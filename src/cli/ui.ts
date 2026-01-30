/**
 * CLI UI Helpers
 *
 * Functions for displaying UI elements in the terminal.
 */

import type { SupportAgent } from "../agent";
import type { Provider } from "../types";

/**
 * Displays the welcome banner
 */
export function showWelcome(agent: SupportAgent): void {
  console.log("");
  console.log("╔═══════════════════════════════════════════╗");
  console.log("║         Welcome to Support Agent!         ║");
  console.log("╚═══════════════════════════════════════════╝");
  console.log("");
  console.log(`  Model: ${agent.currentModel}`);
  console.log(`  Mode:  ${agent.currentMode}`);
  console.log("");
  console.log("─────────────────────────────────────────────");
  console.log("  Commands:");
  console.log("    /model   - Select an AI model");
  console.log("    /mode    - Set thinking mode (low/medium/high)");
  console.log("    /exit    - Exit the application");
  console.log("");
  console.log("  Usage:");
  console.log("    [source_url] your question here");
  console.log("");
  console.log("  Example:");
  console.log("    https://github.com/user/repo How do I install this?");
  console.log("─────────────────────────────────────────────");
  console.log("");
}

/**
 * Displays the provider selection menu
 */
export function showProviderMenu(
  providers: Provider[],
  agent: SupportAgent,
): void {
  console.log("\nSelect a provider (enter 'back' or '0' to cancel):\n");
  providers.forEach((p, i) => {
    const freeLabel = agent.requiresApiKey(p.id) ? "" : " (FREE)";
    console.log(`  ${i + 1}. ${p.id}${freeLabel}`);
  });
  console.log("");
}

/**
 * Displays the model selection menu
 */
export function showModelMenu(models: string[], providerName: string): void {
  console.log(`\nProvider: ${providerName}`);
  console.log("Select a model (enter 'back' or '0' to go back):\n");
  models.forEach((m, i) => {
    console.log(`  ${i + 1}. ${m}`);
  });
  console.log("");
}

/**
 * Displays the API key prompt
 */
export function showApiKeyPrompt(providerName: string, envVar: string): void {
  console.log("");
  console.log(`⚠️  ${providerName} requires an API key.`);
  console.log(`   Environment variable ${envVar} is not set.`);
  console.log("");
  console.log("Options:");
  console.log(`  1. Add ${envVar}=your_key to your .env file`);
  console.log(`  2. Enter your API key now (session only)`);
  console.log(`  3. Type 'back' to choose a different provider`);
  console.log("");
}

/**
 * Displays thinking mode help
 */
export function showModeHelp(): void {
  console.log("\nUsage: /mode [low|medium|high]");
  console.log("");
  console.log("  low    - Fast responses, less reasoning");
  console.log("  medium - Balanced (default)");
  console.log("  high   - Deep reasoning, slower");
  console.log("");
}
