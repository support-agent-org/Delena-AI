/**
 * Step-by-step test of the AI SDK integration
 * Tests each component in isolation to identify issues
 */

import "dotenv/config";
import { generateText } from "ai";
import { groq } from "@ai-sdk/groq";
import { createReplTool, type ToolFunction } from "./repl-tool.js";

const WS_URL = process.env.WS_SERVER_URL ?? "ws://localhost:9733";

async function testGroqConnection() {
  console.log("\n=== Step 1: Test Groq API Connection ===");
  
  if (!process.env.GROQ_API_KEY && !process.env.groq_api_key) {
    console.log("⊘ Skipping - Groq API key not set");
    return null;
  }
  
  try {
    // Use native Groq provider
    const modelName = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
    const model = groq(modelName);
    
    const result = await generateText({
      model,
      prompt: "Say 'OK' and nothing else",
      maxTokens: 5,
    });
    
    console.log("✓ Groq connection works");
    console.log("  Model:", modelName);
    console.log("  Response:", result.text);
    return model;
  } catch (error) {
    console.error("✗ Groq connection failed:", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function testSimpleFunction() {
  console.log("\n=== Step 2: Test Single Simple Function ===");
  
  const functions: ToolFunction[] = [
    {
      name: "add_numbers",
      description: "Add two numbers together",
      parameters: {
        a: { type: "number", description: "First number" },
        b: { type: "number", description: "Second number" },
      },
      returns: "number",
      handler: ({ a, b }: { a: number; b: number }) => {
        console.log(`  Handler called: add_numbers(${a}, ${b})`);
        return a + b;
      },
    },
  ];
  
  console.log("  Function config:", JSON.stringify(functions[0], null, 2));
  
  try {
    const tool = await createReplTool(functions, { wsUrl: WS_URL });
    console.log("✓ Tool created successfully");
    console.log("  Tool description length:", tool.description.length, "chars");
    return tool;
  } catch (error) {
    console.error("✗ Tool creation failed:", error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error("  Stack:", error.stack.split('\n').slice(0, 5).join('\n'));
    }
    throw error;
  }
}

async function testFunctionWithNoReturn() {
  console.log("\n=== Step 3: Test Function Without Return Type ===");
  
  const functions: ToolFunction[] = [
    {
      name: "log_message",
      description: "Log a message",
      parameters: {
        message: { type: "string", description: "Message to log" },
      },
      // No returns field
      handler: ({ message }: { message: string }) => {
        console.log(`  Handler called: log_message("${message}")`);
      },
    },
  ];
  
  try {
    const tool = await createReplTool(functions, { wsUrl: WS_URL });
    console.log("✓ Tool with no return type created successfully");
    return tool;
  } catch (error) {
    console.error("✗ Tool creation failed:", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function testMultipleFunctions() {
  console.log("\n=== Step 4: Test Multiple Functions ===");
  
  const functions: ToolFunction[] = [
    {
      name: "get_temperature",
      description: "Get temperature for a city",
      parameters: {
        city: { type: "string", description: "City name" },
      },
      returns: "number",
      handler: ({ city }: { city: string }) => {
        console.log(`  Handler called: get_temperature("${city}")`);
        return 72;
      },
    },
    {
      name: "convert_temp",
      description: "Convert temperature",
      parameters: {
        fahrenheit: { type: "number", description: "Temperature in F" },
        to_unit: { type: "string", description: "Target unit", enum: ["celsius", "kelvin"] },
      },
      returns: "number",
      handler: ({ fahrenheit, to_unit }: { fahrenheit: number; to_unit: string }) => {
        console.log(`  Handler called: convert_temp(${fahrenheit}, "${to_unit}")`);
        if (to_unit === "celsius") return Math.round(((fahrenheit - 32) * 5 / 9) * 10) / 10;
        return fahrenheit;
      },
    },
  ];
  
  try {
    const tool = await createReplTool(functions, { wsUrl: WS_URL });
    console.log("✓ Multiple functions tool created successfully");
    return tool;
  } catch (error) {
    console.error("✗ Tool creation failed:", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function testCodeExecution(model: any, tool: any) {
  console.log("\n=== Step 5: Test Code Execution with LLM ===");
  
  console.log("  Tool parameters schema:", JSON.stringify(tool.parameters, null, 2));
  
  try {
    const result = await generateText({
      model,
      tools: { code_executor: tool },
      prompt: "Use the code_executor to run: console.log(await add_numbers(5, 3))",
      maxTokens: 100,
    });
    
    console.log("✓ Code execution succeeded");
    console.log("  Result:", result.text);
    return result;
  } catch (error) {
    console.error("✗ Code execution failed:", error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error("  Stack trace:");
      console.error(error.stack.split('\n').slice(0, 10).join('\n'));
    }
    throw error;
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("STEP-BY-STEP AI SDK TEST");
  console.log("=".repeat(60));
  
  try {
    // Step 1: Test Groq connection
    const model = await testGroqConnection();
    if (!model) {
      console.log("\n✗ Cannot proceed without Groq connection");
      process.exit(1);
    }
    
    // Step 2: Test simple function
    const simpleTool = await testSimpleFunction();
    
    // Step 3: Test function without return type
    await testFunctionWithNoReturn();
    
    // Step 4: Test multiple functions
    await testMultipleFunctions();
    
    // Step 5: Test code execution with LLM
    await testCodeExecution(model, simpleTool);
    
    console.log("\n" + "=".repeat(60));
    console.log("✓ ALL TESTS PASSED");
    console.log("=".repeat(60) + "\n");
    
  } catch (error) {
    console.log("\n" + "=".repeat(60));
    console.log("✗ TEST FAILED");
    console.log("=".repeat(60));
    console.error("\nError details:", error);
    process.exit(1);
  }
  
  process.exit(0);
}

main();
