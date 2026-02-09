import z from "zod"
import path from "path"
import { Tool } from "./tool"
import { ToolRegistry } from "./registry"
import { Config } from "../config/config"
import { Log } from "../util/log"
import { Instance } from "../project/instance"
import DESCRIPTION_TEMPLATE from "./repl.txt"

const log = Log.create({ service: "tool.repl" })

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

const DEFAULT_WS_URL = "ws://localhost:9733"
const DEFAULT_TIMEOUT = 60_000
const DEFAULT_EXCLUDE_PATTERNS = [
  "tool_runner",
  "todo*",
  "question",
  "invalid",
  "batch",
  "skill",
  "task",
  "plan*",
  "repl",
]

// ---------------------------------------------------------------------------
// Types (matching open-codemode ws-protocol.ts)
// ---------------------------------------------------------------------------

interface ClientToolDescriptor {
  name: string
  description?: string
  inputSchema: object
  outputSchema?: object
}

type ClientMessage =
  | { type: "register_tools"; tools: ClientToolDescriptor[] }
  | { type: "get_signatures" }
  | { type: "execute_code"; executionId: string; code: string }
  | { type: "tool_result"; callId: string; result?: unknown; error?: string }

interface ServerMessage {
  type: string
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// WsBridge — manages WebSocket connection to open-codemode
// ---------------------------------------------------------------------------

class WsBridge {
  private ws: WebSocket | null = null
  private pending = new Map<string, { resolve: (v: ServerMessage) => void; reject: (e: Error) => void }>()
  private responseWaiters: Array<{
    expect: string[]
    resolve: (msg: ServerMessage) => void
    reject: (e: Error) => void
  }> = []
  private connected = false
  private toolExecutor: ((toolName: string, args: unknown, ctx: Tool.Context) => Promise<unknown>) | null = null
  private currentCtx: Tool.Context | null = null

  public signatures = ""

  constructor(
    private wsUrl: string,
    private timeout: number,
  ) {}

  // -- Lifecycle -------------------------------------------------------------

  async start(
    descriptors: ClientToolDescriptor[],
    executor: (toolName: string, args: unknown, ctx: Tool.Context) => Promise<unknown>,
  ): Promise<void> {
    this.toolExecutor = executor
    await this.connect()

    // Register tools
    const regResp = await this.sendAndWait({ type: "register_tools", tools: descriptors }, ["success", "error"])
    if (regResp.type === "error") {
      throw new Error(`Tool registration failed: ${regResp.message}`)
    }
    log.info("registered tools on open-codemode", { count: descriptors.length })

    // Fetch generated TypeScript signatures
    const sigResp = await this.sendAndWait({ type: "get_signatures" }, ["signatures", "error"])
    if (sigResp.type === "error") {
      throw new Error(`Failed to get signatures: ${sigResp.message}`)
    }
    this.signatures = (sigResp.content as string) ?? ""
    log.info("received signatures", { length: this.signatures.length })
  }

  stop(): void {
    this.ws?.close()
    this.ws = null
    this.connected = false
  }

  // -- Code execution --------------------------------------------------------

  async execute(code: string, ctx: Tool.Context): Promise<string> {
    if (!this.connected) {
      return "Error: Not connected to open-codemode server"
    }

    this.currentCtx = ctx
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    return new Promise((resolve, _reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(executionId)
        resolve(`Execution timed out after ${this.timeout / 1000} seconds`)
      }, this.timeout)

      this.pending.set(executionId, {
        resolve: (msg: ServerMessage) => {
          clearTimeout(timer)
          this.currentCtx = null
          if (msg.success) {
            resolve((msg.output as string) ?? "(no output)")
          } else {
            // The execution_result message carries output (stdout+stderr) and optionally error.
            // Prefer the output field since it contains the actual stderr from the sandbox.
            const detail = (msg.output as string) || (msg.error as string) || "Unknown error"
            resolve(`Execution failed:\n${detail}`)
          }
        },
        reject: (err: Error) => {
          clearTimeout(timer)
          this.currentCtx = null
          resolve(`Execution error: ${err.message}`)
        },
      })

      this.send({ type: "execute_code", executionId, code })
    })
  }

  // -- Internal networking ---------------------------------------------------

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl)

      ws.addEventListener("open", () => {
        this.ws = ws
        this.connected = true
        log.info("connected to open-codemode", { url: this.wsUrl })
        resolve()
      })

      ws.addEventListener("error", (ev) => {
        if (!this.connected) {
          reject(new Error(`Failed to connect to open-codemode at ${this.wsUrl}: ${ev}`))
        }
      })

      ws.addEventListener("close", () => {
        this.connected = false
        log.info("disconnected from open-codemode")
      })

      ws.addEventListener("message", (ev) => {
        try {
          const data = typeof ev.data === "string" ? ev.data : String(ev.data)
          const msg: ServerMessage = JSON.parse(data)
          this.handleMessage(msg)
        } catch {
          /* ignore parse errors */
        }
      })
    })
  }

  private handleMessage(msg: ServerMessage): void {
    // Tool call from sandbox → execute real OpenCode tool
    if (msg.type === "tool_call") {
      this.handleToolCall(msg)
      return
    }

    // Execution result
    if (msg.type === "execution_result") {
      const entry = this.pending.get(msg.executionId as string)
      if (entry) {
        this.pending.delete(msg.executionId as string)
        entry.resolve(msg)
      }
      return
    }

    // Expected response (for sendAndWait)
    for (let i = 0; i < this.responseWaiters.length; i++) {
      const waiter = this.responseWaiters[i]
      if (waiter.expect.includes(msg.type)) {
        this.responseWaiters.splice(i, 1)
        waiter.resolve(msg)
        return
      }
    }
  }

  private async handleToolCall(msg: ServerMessage): Promise<void> {
    const callId = msg.callId as string
    const toolName = msg.toolName as string
    const args = (msg.args as Record<string, unknown>) ?? {}

    log.debug("handleToolCall", { callId, toolName, args, hasExecutor: !!this.toolExecutor, hasCtx: !!this.currentCtx })

    if (!this.toolExecutor || !this.currentCtx) {
      this.send({ type: "tool_result", callId, error: "No execution context available" })
      return
    }

    try {
      log.debug("executing tool from REPL", { toolName, args })
      const result = await this.toolExecutor(toolName, args, this.currentCtx)
      log.debug("tool execution complete", { toolName, result })
      this.send({ type: "tool_result", callId, result })
    } catch (err) {
      log.error("tool execution failed", { toolName, error: err })
      this.send({
        type: "tool_result",
        callId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  private sendAndWait(msg: ClientMessage, expect: string[], timeoutMs = 15_000): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for ${expect.join("/")}`))
      }, timeoutMs)

      this.responseWaiters.push({
        expect,
        resolve: (resp) => {
          clearTimeout(timer)
          resolve(resp)
        },
        reject: (err) => {
          clearTimeout(timer)
          reject(err)
        },
      })

      this.send(msg)
    })
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesPattern(id: string, pattern: string): boolean {
  if (pattern.endsWith("*")) {
    return id.startsWith(pattern.slice(0, -1))
  }
  return id === pattern
}

function shouldExclude(id: string, patterns: string[]): boolean {
  return patterns.some((p) => matchesPattern(id, p))
}

// ---------------------------------------------------------------------------
// Read file directly for REPL (no line numbers, no limits, no <file> tags)
// ---------------------------------------------------------------------------

async function readForRepl(args: Record<string, unknown>, directory: string) {
  let filepath = args.filePath as string
  if (!filepath) throw new Error("filePath is required")
  if (!path.isAbsolute(filepath)) filepath = path.resolve(directory, filepath)

  const file = Bun.file(filepath)
  if (!(await file.exists())) throw new Error(`File not found: ${filepath}`)

  const text = await file.text()
  const allLines = text.split("\n")
  const offset = (args.offset as number) || 0
  const limit = args.limit as number | undefined
  const lines = limit !== undefined ? allLines.slice(offset, offset + limit) : allLines.slice(offset)
  const endOfFile = offset + lines.length >= allLines.length

  return {
    filePath: filepath,
    lines,
    totalLines: allLines.length,
    startLine: offset,
    endOfFile,
  }
}

// ---------------------------------------------------------------------------
// Per-tool result transformers for REPL
// ---------------------------------------------------------------------------

type ToolResult = { title: string; metadata: Record<string, any>; output: string }

function transformForRepl(toolName: string, result: ToolResult, args: unknown): unknown {
  const meta = result.metadata

  switch (toolName) {
    case "bash": {
      const raw = (meta.output as string) ?? result.output
      // Strip the <bash_metadata> block from the output to get clean stdout
      const metaTagIdx = raw.indexOf("\n\n<bash_metadata>")
      const stdout = metaTagIdx !== -1 ? raw.substring(0, metaTagIdx) : raw
      return {
        stdout,
        exitCode: (meta.exit as number | null) ?? null,
        timedOut: result.output.includes("terminated command after exceeding timeout"),
      }
    }

    case "glob": {
      if (result.output === "No files found") return []
      return result.output.split("\n").filter((line) => line && !line.startsWith("("))
    }

    case "grep": {
      if (meta.matches === 0) return []
      // Parse the formatted output: "filepath:\n  Line N: text"
      const matches: { path: string; line: number; text: string }[] = []
      let current = ""
      for (const line of result.output.split("\n")) {
        if (line.startsWith("Found ")) continue
        if (line.startsWith("(")) continue
        if (line === "") continue
        if (line.endsWith(":") && !line.startsWith("  ")) {
          current = line.slice(0, -1)
          continue
        }
        const m = line.match(/^\s+Line (\d+): (.*)$/)
        if (m && current) {
          matches.push({ path: current, line: parseInt(m[1], 10), text: m[2] })
        }
      }
      return matches
    }

    case "write": {
      return {
        filePath: meta.filepath as string,
        created: !meta.exists,
        diagnostics: meta.diagnostics ?? {},
      }
    }

    case "edit": {
      const fd = meta.filediff as { file: string; additions: number; deletions: number } | undefined
      return {
        filePath: fd?.file ?? "",
        diff: (meta.diff as string) ?? "",
        additions: fd?.additions ?? 0,
        deletions: fd?.deletions ?? 0,
        diagnostics: meta.diagnostics ?? {},
      }
    }

    case "apply_patch": {
      const files =
        (meta.files as Array<{
          filePath: string
          relativePath: string
          type: string
          diff: string
          additions: number
          deletions: number
          movePath?: string
        }>) ?? []
      return {
        diff: (meta.diff as string) ?? "",
        files,
        diagnostics: meta.diagnostics ?? {},
      }
    }

    case "webfetch": {
      // title format: "url (contentType)"
      const titleMatch = result.title.match(/^(.+?)\s+\(([^)]*)\)$/)
      return {
        url: titleMatch ? titleMatch[1] : result.title,
        content: result.output,
        contentType: titleMatch ? titleMatch[2] : "",
      }
    }

    case "list": {
      // Output is an indented tree. Extract just the file paths as relative strings.
      // First line is the root dir, skip it. Files are leaves (no trailing /).
      const lines = result.output.split("\n").filter((l) => l.length > 0)
      if (lines.length === 0) return []
      // Walk the tree to reconstruct relative paths
      const files: string[] = []
      const stack: string[] = []
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]
        const stripped = line.trimStart()
        const depth = (line.length - stripped.length) / 2 // 2-space indent
        stack.length = depth
        if (stripped.endsWith("/")) {
          stack[depth] = stripped.slice(0, -1)
        } else {
          files.push([...stack.slice(0, depth), stripped].join("/"))
        }
      }
      return files
    }

    case "websearch":
    case "codesearch": {
      const a = args as Record<string, unknown>
      return {
        query: (a.query as string) ?? "",
        content: result.output,
      }
    }

    default:
      // Unknown tool — return the raw output as-is
      return result.output
  }
}

// ---------------------------------------------------------------------------
// Output schemas for REPL tool return types (JSON Schema format)
// ---------------------------------------------------------------------------

const outputSchemas: Record<string, object> = {
  read: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Absolute path to the file" },
      lines: { type: "array", items: { type: "string" }, description: "File content as an array of lines" },
      totalLines: { type: "number", description: "Total number of lines in the file" },
      startLine: { type: "number", description: "0-based line offset that was read from" },
      endOfFile: { type: "boolean", description: "Whether the returned lines reach the end of the file" },
    },
    required: ["filePath", "lines", "totalLines", "startLine", "endOfFile"],
  },
  bash: {
    type: "object",
    properties: {
      stdout: { type: "string", description: "Combined stdout and stderr output" },
      exitCode: { type: ["number", "null"], description: "Process exit code, or null if unavailable" },
      timedOut: { type: "boolean", description: "Whether the command was killed due to timeout" },
    },
    required: ["stdout", "exitCode", "timedOut"],
  },
  glob: {
    type: "array",
    items: { type: "string" },
    description: "Array of absolute file paths matching the pattern, sorted by modification time",
  },
  grep: {
    type: "array",
    items: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the file containing the match" },
        line: { type: "number", description: "1-based line number of the match" },
        text: { type: "string", description: "Content of the matching line" },
      },
      required: ["path", "line", "text"],
    },
    description: "Array of matches sorted by file modification time",
  },
  write: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Absolute path to the written file" },
      created: { type: "boolean", description: "True if the file was newly created, false if it already existed" },
      diagnostics: { type: "object", description: "LSP diagnostics keyed by file path" },
    },
    required: ["filePath", "created", "diagnostics"],
  },
  edit: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Absolute path to the edited file" },
      diff: { type: "string", description: "Unified diff of the changes" },
      additions: { type: "number", description: "Number of lines added" },
      deletions: { type: "number", description: "Number of lines removed" },
      diagnostics: { type: "object", description: "LSP diagnostics keyed by file path" },
    },
    required: ["filePath", "diff", "additions", "deletions", "diagnostics"],
  },
  apply_patch: {
    type: "object",
    properties: {
      diff: { type: "string", description: "Combined unified diff of all changes" },
      files: {
        type: "array",
        items: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "Absolute path to the file" },
            relativePath: { type: "string", description: "Path relative to worktree" },
            type: { type: "string", description: "Change type: add, update, delete, or move" },
            diff: { type: "string", description: "Unified diff for this file" },
            additions: { type: "number", description: "Number of lines added" },
            deletions: { type: "number", description: "Number of lines removed" },
            movePath: { type: "string", description: "Destination path for move operations" },
          },
          required: ["filePath", "relativePath", "type", "diff", "additions", "deletions"],
        },
        description: "Array of file changes applied by the patch",
      },
      diagnostics: { type: "object", description: "LSP diagnostics keyed by file path" },
    },
    required: ["diff", "files", "diagnostics"],
  },
  webfetch: {
    type: "object",
    properties: {
      url: { type: "string", description: "The fetched URL" },
      content: { type: "string", description: "The page content in the requested format" },
      contentType: { type: "string", description: "The Content-Type header value" },
    },
    required: ["url", "content", "contentType"],
  },
  list: {
    type: "array",
    items: { type: "string" },
    description: "Array of relative file paths in the directory",
  },
  websearch: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query that was executed" },
      content: { type: "string", description: "Search results content" },
    },
    required: ["query", "content"],
  },
  codesearch: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query that was executed" },
      content: { type: "string", description: "Code search results content" },
    },
    required: ["query", "content"],
  },
}

// ---------------------------------------------------------------------------
// ReplTool
// ---------------------------------------------------------------------------

const replParams = z.object({
  code: z.string().describe("TypeScript/JavaScript code to execute in the sandboxed Deno environment"),
})

export const ReplTool = Tool.define("repl", async (initCtx) => {
  const config = await Config.get()
  const replConfig = (config.experimental as Record<string, any>)?.repl as
    | { ws_url?: string; exclude_tools?: string[]; timeout?: number }
    | undefined
  const wsUrl = replConfig?.ws_url ?? DEFAULT_WS_URL
  const timeout = replConfig?.timeout ?? DEFAULT_TIMEOUT
  const excludePatterns = replConfig?.exclude_tools ?? DEFAULT_EXCLUDE_PATTERNS

  // Capture the current Instance context directory so we can re-provide it later
  const directory = Instance.directory

  // Get available tools by ID, then init each one individually.
  // We avoid calling ToolRegistry.tools() because that would recursively init ReplTool.
  const allIds = await ToolRegistry.ids()
  const filteredIds = allIds.filter((id) => !shouldExclude(id, excludePatterns))

  const availableTools = await Promise.all(
    filteredIds.map(async (id) => {
      const info = await ToolRegistry.get(id)
      if (!info) return null
      const initialized = await info.init(initCtx)
      return { id, ...initialized }
    }),
  ).then((results) => results.filter((t): t is NonNullable<typeof t> => t !== null))

  log.info("repl tool initializing", {
    totalIds: allIds.length,
    availableTools: availableTools.length,
    excluded: allIds.length - availableTools.length,
    directory,
  })

  // Build a map of initialized tool executors
  const toolMap = new Map(availableTools.map((t) => [t.id, t]))

  // Convert zod schemas → JSON Schema → ClientToolDescriptor
  const descriptors: ClientToolDescriptor[] = availableTools.map((t) => {
    // Use zod v4's built-in toJSONSchema (zod-to-json-schema doesn't work with v4)
    const jsonSchema = z.toJSONSchema(t.parameters) as Record<string, unknown>
    // Strip $schema key — Ajv on the open-codemode side only supports draft-07
    const { $schema: _, ...schema } = jsonSchema
    return {
      name: t.id,
      description: t.description,
      inputSchema: schema,
      outputSchema: outputSchemas[t.id],
    }
  })

  // Create the bridge and connect
  const bridge = new WsBridge(wsUrl, timeout)

  const executor = async (toolName: string, args: unknown, ctx: Tool.Context): Promise<unknown> => {
    log.debug("executor called", { toolName, args })

    // For read, bypass the tool entirely and read the file directly
    // to avoid line numbers, <file> tags, and truncation limits
    if (toolName === "read") {
      return Instance.provide({
        directory,
        async fn() {
          return readForRepl(args as Record<string, unknown>, directory)
        },
      })
    }

    const tool = toolMap.get(toolName)
    if (!tool) {
      log.error("tool not found", { toolName, availableTools: Array.from(toolMap.keys()) })
      return { error: `Unknown tool "${toolName}"` }
    }
    log.debug("executing tool within Instance.provide", { toolName, directory, hasExecute: !!tool.execute })

    // Wrap tool execution in Instance.provide to restore AsyncLocalStorage context
    return Instance.provide({
      directory,
      async fn() {
        const result = await tool.execute(args as any, ctx)
        log.debug("tool executed", { toolName, output: result.output?.substring(0, 100) })
        return transformForRepl(toolName, result, args)
      },
    })
  }

  try {
    await bridge.start(descriptors, executor)
  } catch (err) {
    log.error("failed to connect to open-codemode", { error: err })
    // Return a degraded tool that tells the LLM the server isn't available
    return {
      description:
        "The REPL tool is unavailable because the open-codemode server is not running. " +
        "Start it with: cd open-codemode && deno run --allow-all src/servers/ws-server.ts",
      parameters: replParams,
      async execute(_args: z.infer<typeof replParams>, _ctx: Tool.Context) {
        return {
          title: "repl unavailable",
          metadata: {} as Record<string, any>,
          output:
            "Error: Cannot connect to open-codemode server. " +
            "Please start it with: cd open-codemode && deno run --allow-all src/servers/ws-server.ts",
        }
      },
    }
  }

  // Build description with signatures
  const description = DESCRIPTION_TEMPLATE.replace("${signatures}", bridge.signatures)

  return {
    description,
    parameters: replParams,
    async execute(params: z.infer<typeof replParams>, ctx: Tool.Context) {
      ctx.metadata({
        title: "executing code…",
        metadata: { code: params.code },
      })

      const output = await bridge.execute(params.code, ctx)
      const failed =
        output.startsWith("Execution failed:") ||
        output.startsWith("Execution timed out") ||
        output.startsWith("Error:")

      return {
        title: failed ? "repl error" : "repl execution",
        metadata: {
          code: params.code,
          output: output.length > 30_000 ? output.slice(0, 30_000) + "\n\n..." : output,
          success: !failed,
        } as Record<string, any>,
        output,
      }
    },
  }
})
