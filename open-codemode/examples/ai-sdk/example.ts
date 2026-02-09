/**
 * Vercel AI SDK + open-codemode Example
 *
 * Connects to the open-codemode WebSocket server, registers local functions,
 * and creates an agent that executes TypeScript in a sandbox — calling your
 * functions back over the WebSocket connection.
 *
 * This is the TypeScript equivalent of the Python LangGraph example.
 *
 * Prerequisites:
 *   1. Start the servers:  deno task start  (or docker-compose up)
 *   2. Set OPENAI_API_KEY (or your provider's key) in .env
 *   3. npm install
 *
 * Run:  npx tsx example.ts
 */

import "dotenv/config";
import { generateText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { createAzure } from "@ai-sdk/azure";
import { groq } from "@ai-sdk/groq";
import { createReplTool, type ToolFunction } from "./repl-tool.js";

const WS_URL = process.env.WS_SERVER_URL ?? "ws://localhost:9733";

// -- Model configuration -----------------------------------------------------

function getModel() {
  // Use Groq API if configured
  if (process.env.GROQ_API_KEY || process.env.groq_api_key) {
    // Use a model with strong tool calling support
    const modelName = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
    console.log(`Using Groq API: ${modelName}`);
    return groq(modelName);
  }

  // Use Azure OpenAI if configured
  // if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_RESOURCE_NAME) {
  //   const deploymentName =
  //     process.env.AZURE_OPENAI_DEPLOYMENT_NAME ??
  //     process.env.MODEL_NAME ??
  //     "gpt-4o";
  //   
  //   const azure = createAzure({
  //     resourceName: process.env.AZURE_RESOURCE_NAME,
  //     apiKey: process.env.AZURE_OPENAI_API_KEY,
  //   });
  //   
  //   console.log(`Using Azure OpenAI: ${process.env.AZURE_RESOURCE_NAME} (deployment: ${deploymentName})`);
  //   
  //   // Use Chat Completions API (.chat) which fully supports custom tools
  //   // The Responses API (azure(deploymentName)) only supports built-in Azure tools
  //   return azure.chat(deploymentName);
  // }

  // Otherwise use OpenAI
  return openai(process.env.MODEL_NAME ?? "gpt-4o");
}

// -- Define plain functions to expose in the sandbox -------------------------

const functions: ToolFunction[] = [
  {
    name: "get_temperature",
    description: "Get the current temperature for a city in Fahrenheit",
    parameters: {
      city: { type: "string", description: "City name to look up" },
    },
    returns: "number",
    handler: ({ city }: { city: string }) => {
      const temps: Record<string, number> = {
        NYC: 72.0,
        LA: 85.0,
        Chicago: 65.0,
      };
      return temps[city] ?? 70.0;
    },
  },
  {
    name: "convert_temp",
    description: "Convert temperature from Fahrenheit to another unit",
    parameters: {
      fahrenheit: { type: "number", description: "Temperature in Fahrenheit" },
      to_unit: {
        type: "string",
        description: "Target unit",
        enum: ["celsius", "kelvin"],
      },
    },
    returns: "number",
    handler: ({
      fahrenheit,
      to_unit,
    }: {
      fahrenheit: number;
      to_unit: string;
    }) => {
      if (to_unit === "celsius") return Math.round(((fahrenheit - 32) * 5) / 9 * 10) / 10;
      if (to_unit === "kelvin")
        return Math.round(((fahrenheit - 32) * 5 / 9 + 273.15) * 10) / 10;
      return fahrenheit;
    },
  },
  {
    name: "calculate",
    description: "Perform a mathematical operation on two numbers",
    parameters: {
      a: { type: "number", description: "First number" },
      b: { type: "number", description: "Second number" },
      operation: {
        type: "string",
        description: "One of add, subtract, multiply, divide",
        enum: ["add", "subtract", "multiply", "divide"],
      },
    },
    returns: "number",
    handler: ({
      a,
      b,
      operation,
    }: {
      a: number;
      b: number;
      operation: string;
    }) => {
      const ops: Record<string, (x: number, y: number) => number> = {
        add: (x, y) => x + y,
        subtract: (x, y) => x - y,
        multiply: (x, y) => x * y,
        divide: (x, y) => (y !== 0 ? x / y : Infinity),
      };
      return (ops[operation] ?? (() => 0))(a, b);
    },
  },
];

// -- Agent setup & run -------------------------------------------------------

async function main() {
  console.log("Connecting to open-codemode WS server...");

  const codeExecutor = await createReplTool(functions, { wsUrl: WS_URL });

  console.log("Connected & tools registered.\n");
  console.log("--- Tool Schema Debug ---");
  console.log("Description preview:", codeExecutor.description?.slice(0, 200));
  console.log("Parameters schema:", JSON.stringify(codeExecutor.parameters, null, 2));
  console.log("------------------------\n");

  const model = getModel();
  console.log("Using model:", model.modelId);

  const { text, steps } = await generateText({
    model,
    tools: { code_executor: codeExecutor },
    maxTokens: 4000,
    stopWhen: stepCountIs(10),
    system:
      "You are a helpful assistant that writes and executes TypeScript code. " +
      "When you need to solve a problem, use the code_executor tool. " +
      "The code_executor tool requires a 'code' parameter with TypeScript code as a string. " +
      "Always include console.log() in your code to produce output.",
    prompt: "Use code_executor to calculate 5 + 3",
    onStepFinish: ({ toolCalls, toolResults, text }) => {
      if (toolCalls.length) {
        console.log("\n--- Tool Calls (full) ---");
        console.log(JSON.stringify(toolCalls, null, 2));
        console.log("\n--- Tool Calls (mapped) ---");
        console.log(JSON.stringify(toolCalls.map(tc => ({
          id: tc.toolCallId,
          name: tc.toolName,
          args: tc.args,
          argsKeys: Object.keys(tc.args || {}),
        })), null, 2));
      }
      if (text) {
        console.log("\n--- Step Text ---");
        console.log(text);
      }
      if (toolResults.length) {
        console.log("\n--- Tool Results ---");
        console.log(JSON.stringify(toolResults.map(tr => ({
          toolName: tr.toolName,
          output: tr.output
        })), null, 2));
      }
    },
  });

  console.log("\nFinal answer:", text);
  console.log(`\nCompleted in ${steps.length} step(s)`);

  process.exit(0);
}

main().catch((err) => {
  console.error("\nError:", err instanceof Error ? err.message : String(err));
  console.error("\nMake sure:");
  console.error("  1. The open-codemode servers are running (deno task start)");
  console.error("  2. OPENAI_API_KEY or Azure credentials are set in .env");
  process.exit(1);
});
