import { createOpencodeClient } from "@opencode-ai/sdk"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  console.log("Connecting to dev server at http://127.0.0.1:4200...")

  const client = createOpencodeClient({
    baseUrl: "http://127.0.0.1:4200",
  })

  try {
    const testFolderPath = path.join(__dirname, "test-folder")
    console.log(`Test folder: ${testFolderPath}`)

    console.log("\nCreating session with restricted tools...")
    const sessionResult = await client.session.create({
      query: {
        directory: testFolderPath,
      },
      body: {
        config: {
          agent: {
            build: { disable: true },
            explore: { disable: true },
            general: { disable: true },
            plan: { disable: true },
            testAgent: {
              prompt: "You are a test agent. Use the REPL tool to read files and process data.",
              description: "Test agent for REPL functionality",
              mode: "primary",
              tools: {
                // Disable all write/modify tools
                bash: false,
                write: false,
                edit: false,
                apply_patch: false,
                delete: false,
                codesearch: false,
                websearch: false,
                webfetch: false,
                skill: false,
                task: false,
                mcp: false,
                path: false,
                // Keep read tools
                read: false,
                grep: false,
                glob: false,
                list: false,
                // Keep todo tools
                todowrite: true,
                todoread: true,
                // Enable REPL
                repl: true,
              },
            },
          },
          experimental: {
            repl: {
              ws_url: "ws://localhost:9733",
              // In REPL, exclude write tools
              exclude_tools: [
                "bash",
                "write",
                "edit",
                "apply_patch",
                "delete",
                "webfetch",
                "websearch",
                "codesearch",
                "list",
                "task",
                "question",
                "skill",
                "batch",
                "plan*",
                "lsp",
                "mcp",
                "todo*",
              ],
              timeout: 60000,
            },
          },
        },
      },
    })

    const sessionId = sessionResult.data.id
    console.log(`Session created: ${sessionId}`)

    // Subscribe to events
    console.log("\nSubscribing to event stream...")
    const events = await client.event.subscribe()

    const message = `Use the REPL tool to:
1. Find all .txt files in the current directory
2. Read each file and count total lines
3. Read data.json and show its content
4. Return a summary`

    console.log(`\nSending prompt: "${message}"`)
    console.log("=".repeat(60))

    // Send prompt async
    await client.session.promptAsync({
      path: { id: sessionId },
      body: {
        parts: [{ type: "text", text: message }],
      },
    })

    let sessionCompleted = false
    let responseText = ""

    // Listen for events
    for await (const event of events.stream) {
      const props = event.properties

      // Filter to our session
      if (
        props?.sessionID !== sessionId &&
        props?.info?.sessionID !== sessionId &&
        props?.part?.sessionID !== sessionId
      ) {
        continue
      }

      switch (event.type) {
        case "message.part.updated":
          const part = props?.part

          if (part?.type === "text") {
            // Text streaming
            if (props.delta) {
              responseText += props.delta
              process.stdout.write(props.delta)
            }
          } else if (part?.type === "tool") {
            // Tool execution
            if (part.state?.status === "running") {
              console.log(`\n\n[Tool: ${part.tool}] Running...`)
              if (part.metadata?.code) {
                console.log("Code:")
                console.log(part.metadata.code)
              }
            } else if (part.state?.status === "success") {
              console.log(`\n[Tool: ${part.tool}] Complete`)
              if (part.metadata?.output) {
                const output = part.metadata.output.substring(0, 500)
                console.log(`Output: ${output}${part.metadata.output.length > 500 ? "..." : ""}`)
              }
            } else if (part.state?.status === "error") {
              console.log(`\n[Tool: ${part.tool}] Error`)
              if (part.metadata?.output) {
                console.log(`Error: ${part.metadata.output}`)
              }
            }
          }
          break

        case "message.updated":
          if (props?.info?.role === "assistant") {
            console.log(`\n[Message updated]`)
          }
          break

        case "session.idle":
          if (props?.sessionID === sessionId) {
            sessionCompleted = true
          }
          break

        case "session.error":
          if (props?.sessionID === sessionId) {
            console.error("\nSession error:", props?.error)
            sessionCompleted = true
          }
          break
      }

      if (sessionCompleted) break
    }

    console.log("\n" + "=".repeat(60))
    console.log("\n--- Test complete ---")
    process.exit(0)
  } catch (error) {
    console.error("\nError:", error.message)
    process.exit(1)
  }
}

main()
