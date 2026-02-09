/**
 * Test to inspect the tool schema being generated
 */

import { tool } from "ai";
import { z } from "zod";

const testTool = tool({
  description: "Test tool",
  parameters: z.object({
    code: z.string().describe("Code to execute"),
  }),
  execute: async ({ code }) => {
    return "result";
  },
});

console.log("\n=== Tool Object ===");
console.log("Type of tool:", typeof testTool);
console.log("Tool keys:", Object.keys(testTool));

// Try to access tool properties
console.log("\n=== Tool Properties ===");
for (const key of Object.keys(testTool)) {
  const value = (testTool as any)[key];
  console.log(`${key}:`, typeof value === 'function' ? '[Function]' : 
    typeof value === 'object' ? JSON.stringify(value, null, 2).substring(0, 200) + '...' : 
    value);
}

// Check if there's a schema property
if ('parameters' in testTool) {
  console.log("\n=== Parameters Schema ===");
  const params = (testTool as any).parameters;
  console.log("Parameters type:", typeof params);
  console.log("Parameters:", params);
  
  // Try to convert to JSON schema
  if (params && typeof params === 'object' && '_def' in params) {
    console.log("\nThis is a Zod schema");
    // Try zodToJsonSchema if available
    try {
      const { zodToJsonSchema } = await import("zod-to-json-schema");
      console.log("\n=== Converted JSON Schema ===");
      console.log(JSON.stringify(zodToJsonSchema(params), null, 2));
    } catch (e) {
      console.log("zod-to-json-schema not available");
    }
  }
}
