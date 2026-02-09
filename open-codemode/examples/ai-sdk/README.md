# Vercel AI SDK Integration with Open-CodeMode

Connects a Vercel AI SDK agent to the open-codemode **WebSocket server** for bidirectional tool calling. Your TypeScript/JavaScript functions run locally; the sandbox calls them back through the WebSocket connection.

This is the TypeScript equivalent of the [Python LangGraph example](../langgraph/).

## How It Works

```
LLM  ──>  code_executor tool  ──>  WS Server  ──>  Deno sandbox
                                       │                  │
                                       │     tool_call     │
                                       │  <────────────    │
                                       │                   │
              Local function  <────────┘                   │
              (runs in Node)                               │
                    │                                      │
                    └──── tool_result ──>  WS Server ──>   │
                                                      continues
```

1. `createReplTool()` connects to the WS server, registers your functions (with JSON Schemas), and fetches the TypeScript signatures the server produces
2. The signatures go into the tool description so the LLM knows the available API
3. When the LLM writes code that calls a function, the server sends a `tool_call` back over the WebSocket
4. The wrapper executes your function locally and returns the result
5. The agent loop (`stopWhen: stepCountIs(N)`) allows multi-step tool usage

## Quick Start

```bash
# 1. Start the open-codemode servers
deno task start  # or docker-compose up

# 2. Install dependencies
cd examples/ai-sdk
npm install

# 3. Set up env
cp .env.example .env
# Then add either:
#   OPENAI_API_KEY=sk-...
# OR Azure credentials:
#   AZURE_OPENAI_ENDPOINT=https://your-resource.cognitiveservices.azure.com/...
#   AZURE_OPENAI_API_KEY=...
#   AZURE_OPENAI_DEPLOYMENT_NAME=gpt-5-chat
#   AZURE_OPENAI_API_VERSION=2025-01-01-preview
#   AZURE_RESOURCE_NAME=your-resource (auto-extracted if not set)
#
# Note: AZURE_RESOURCE_NAME should be the resource identifier from your endpoint URL
# (e.g., "chebb-miaidlw9-eastus2"), not the deployment name

# 4. Run the example
npx tsx example.ts
```

## Usage

```typescript
import { generateText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { azure } from "@ai-sdk/azure";
import { createReplTool } from "./repl-tool.js";

// Define regular functions to expose in the sandbox
const codeExecutor = await createReplTool([
  {
    name: "get_weather",
    description: "Get weather for a location",
    parameters: {
      location: { type: "string", description: "City name" },
    },
    returns: "object",
    handler: ({ location }) => ({ temp: 72, condition: "sunny" }),
  },
]);

// Use with OpenAI
const { text } = await generateText({
  model: openai("gpt-4o"),
  tools: { code_executor: codeExecutor },
  stopWhen: stepCountIs(10),
  prompt: "What's the weather in Paris?",
});

// Or use with Azure OpenAI
const { text: azureText } = await generateText({
  model: azure("gpt-4o"), // uses AZURE_OPENAI_* env vars
  tools: { code_executor: codeExecutor },
  stopWhen: stepCountIs(10),
  prompt: "What's the weather in Paris?",
});

// Or use with the ToolLoopAgent class
import { ToolLoopAgent } from "ai";

const agent = new ToolLoopAgent({
  model: openai("gpt-4o"), // or azure("deployment-name")
  tools: { code_executor: codeExecutor },
  instructions: "Use code_executor to run code with access to registered functions.",
});

const result = await agent.generate({
  prompt: "What's the weather in Paris?",
});
```

### Configuration

```typescript
const codeExecutor = await createReplTool(functions, {
  wsUrl: "ws://custom-host:9733",  // WebSocket server URL
  toolName: "my_executor",         // Custom tool name
  timeout: 120_000,                // Execution timeout (ms)
});
```

## Defining Functions

Functions are defined as plain objects with a `handler`:

```typescript
import { ToolFunction } from "./repl-tool.js";

const myFunction: ToolFunction = {
  name: "search",
  description: "Search for items",
  parameters: {
    query: { type: "string", description: "Search query" },
    max_results: { type: "number", description: "Max results", default: 10 },
  },
  returns: "array",
  handler: ({ query, max_results = 10 }) => {
    // Your implementation here
    return [{ title: "Result 1" }];
  },
};
```

### Parameter Types

| Type | JSON Schema | Description |
|------|-------------|-------------|
| `"string"` | `string` | Text values |
| `"number"` | `number` | Numeric values |
| `"boolean"` | `boolean` | True/false |
| `"object"` | `object` | Objects/dicts |
| `"array"` | `array` | Arrays/lists |

### Optional Parameters

Parameters with a `default` value or `required: false` are treated as optional:

```typescript
{
  parameters: {
    query: { type: "string" },                           // required
    limit: { type: "number", default: 10 },              // optional (has default)
    verbose: { type: "boolean", required: false },       // optional (explicit)
  }
}
```

## Comparison with LangGraph Example

| | AI SDK (TypeScript) | LangGraph (Python) |
|---|---|---|
| Agent | `generateText` + `stopWhen` or `ToolLoopAgent` | `create_agent` |
| Tool wrapper | `createReplTool()` | `repl_tool()` |
| Schema source | Explicit `ToolFunction` objects | Auto-generated from type hints + docstrings |
| WS client | `ws` npm package | `websocket-client` |
| Runtime | Node.js / Bun | Python |

## Files

| File | Purpose |
|------|---------|
| `repl-tool.ts` | Core wrapper: WS bridge, schema generation, AI SDK tool |
| `example.ts` | Working example with temperature + math functions |
| `package.json` | Node.js dependencies |
| `.env.example` | Environment variable template |
