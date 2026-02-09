/**
 * Simple test to verify Azure OpenAI connection
 * Run: npx tsx test-azure.ts
 */

import "dotenv/config";
import { generateText } from "ai";
import { createAzure } from "@ai-sdk/azure";

async function testAzure() {
  console.log("\n=== Testing Azure OpenAI Connection ===\n");
  
  const AZURE_API_KEY = process.env.AZURE_OPENAI_API_KEY;
  const AZURE_RESOURCE = process.env.AZURE_RESOURCE_NAME;
  const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  
  console.log("Config:");
  console.log("  Resource:", AZURE_RESOURCE);
  console.log("  Deployment:", DEPLOYMENT);
  console.log("  API Key:", AZURE_API_KEY ? "✓ Set" : "✗ Missing");
  console.log("\nIMPORTANT: Verify your deployment name exists in Azure Portal:");
  console.log(`  https://portal.azure.com -> Azure OpenAI -> ${AZURE_RESOURCE} -> Deployments\n`);
  
  if (!AZURE_API_KEY || !AZURE_RESOURCE || !DEPLOYMENT) {
    console.error("\n✗ Missing required env vars");
    process.exit(1);
  }
  
  // Test configurations based on Azure AI SDK documentation
  const configs = [
    {
      name: "Standard (v1 endpoint)",
      provider: createAzure({
        resourceName: AZURE_RESOURCE,
        apiKey: AZURE_API_KEY,
      }),
    },
    {
      name: "Deployment-based URLs (legacy)",
      provider: createAzure({
        resourceName: AZURE_RESOURCE,
        apiKey: AZURE_API_KEY,
        useDeploymentBasedUrls: true,
        apiVersion: "2024-08-01-preview",
      }),
    },
    {
      name: "Custom API version",
      provider: createAzure({
        resourceName: AZURE_RESOURCE,
        apiKey: AZURE_API_KEY,
        apiVersion: "2024-08-01-preview",
      }),
    },
  ];
  
  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    console.log(`\n--- Attempt ${i + 1}: ${config.name} ---`);
    
    try {
      const model = config.provider(DEPLOYMENT!);
      
      const result = await generateText({
        model,
        prompt: "Say 'Hello from Azure!' and nothing else.",
        maxTokens: 20,
      });
      
      console.log(`✓ Success with config ${i + 1}!`);
      console.log("Response:", result.text);
      console.log("\n=== Use this configuration ===");
      console.log(JSON.stringify({
        name: config.name,
        resourceName: AZURE_RESOURCE,
        deployment: DEPLOYMENT,
      }, null, 2));
      return;
    } catch (error: any) {
      console.error(`✗ Failed:`, error instanceof Error ? error.message : String(error));
      if (error.cause) {
        console.error("Cause:", error.cause);
      }
    }
  }
  
  console.error("\n✗ All configurations failed");
  console.error("\nPlease verify:");
  console.error("  1. Resource name is correct");
  console.error("  2. Deployment name exists in Azure Portal");
  console.error("  3. API key has access to the deployment");
  process.exit(1);
}

testAzure();
