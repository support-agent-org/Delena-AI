/**
 * CLI Command Handlers
 *
 * Handles processing of CLI commands and user input.
 */

import type { Interface as ReadlineInterface } from "readline";
import type { SupportAgent } from "../agent";
import type { CLIState, Provider, ThinkingMode } from "../types";
import { PROVIDER_API_KEYS } from "../config";
import {
  showProviderMenu,
  showModelMenu,
  showApiKeyPrompt,
  showModeHelp,
} from "./ui";
import { parseInput } from "./utils";

/**
 * CLI Session state
 */
export interface CLISession {
  state: CLIState;
  providers: Provider[];
  selectedProvider: Provider | null;
  filteredModels: string[];
}

/**
 * Creates a new CLI session
 */
export function createSession(): CLISession {
  return {
    state: "normal",
    providers: [],
    selectedProvider: null,
    filteredModels: [],
  };
}

/**
 * Handles the /model command
 */
export async function handleModelCommand(
  agent: SupportAgent,
  session: CLISession,
): Promise<void> {
  console.log("Fetching available providers...");

  session.providers = await agent.getAvailableProviders();

  if (session.providers.length === 0) {
    console.log("No providers found.");
    return;
  }

  showProviderMenu(session.providers, agent);
  session.state = "selecting_provider";
}

/**
 * Handles the /mode command
 */
export async function handleModeCommand(
  agent: SupportAgent,
  args: string,
): Promise<void> {
  const validModes = ["low", "medium", "high"];

  if (!args || !validModes.includes(args)) {
    showModeHelp();
    return;
  }

  agent.setThinkingMode(args as ThinkingMode);
}

/**
 * Handles provider selection
 */
export function handleProviderSelection(
  input: string,
  agent: SupportAgent,
  session: CLISession,
): void {
  const index = parseInt(input) - 1;

  if (isNaN(index) || index < 0 || index >= session.providers.length) {
    console.log("Invalid selection. Enter a number, 'back', or '0'.");
    return;
  }

  session.selectedProvider = session.providers[index]!;

  // Check if API key is required and missing
  if (
    agent.requiresApiKey(session.selectedProvider.id) &&
    !agent.hasApiKey(session.selectedProvider.id)
  ) {
    const envVar = agent.getApiKeyEnvVar(session.selectedProvider.id);
    if (envVar) {
      showApiKeyPrompt(session.selectedProvider.id, envVar);
      session.state = "entering_api_key";
      return;
    }
  }

  // Show models for selected provider
  showModelsForProvider(agent, session);
}

/**
 * Handles API key entry
 */
export function handleApiKeyEntry(
  input: string,
  agent: SupportAgent,
  session: CLISession,
): void {
  if (input.length <= 10) {
    console.log("Invalid API key (too short). Try again or enter 'back'.");
    return;
  }

  // Set the API key for this session
  const envVar = agent.getApiKeyEnvVar(session.selectedProvider!.id);
  if (envVar) {
    process.env[envVar] = input;
    console.log("✓ API key set for this session.");
  }

  showModelsForProvider(agent, session);
}

/**
 * Displays models for the selected provider
 * Uses curated recommended models list for better UX
 */
function showModelsForProvider(agent: SupportAgent, session: CLISession): void {
  // Use recommended models if available, otherwise filter from available
  const recommendedModels = agent.getRecommendedModels(
    session.selectedProvider!.id,
  );

  if (recommendedModels.length > 0) {
    session.filteredModels = recommendedModels;
  } else {
    // Fallback to filtering available models
    session.filteredModels = agent.filterModels(
      session.selectedProvider!.models || {},
    );
  }

  if (session.filteredModels.length === 0) {
    console.log("No models found for this provider.");
    session.state = "normal";
    return;
  }

  showModelMenu(session.filteredModels, session.selectedProvider!.id, agent);
  session.state = "selecting_model";
}

/**
 * Handles model selection
 */
export function handleModelSelection(
  input: string,
  agent: SupportAgent,
  session: CLISession,
): void {
  const index = parseInt(input) - 1;

  if (isNaN(index) || index < 0 || index >= session.filteredModels.length) {
    console.log("Invalid selection. Enter a number, 'back', or '0'.");
    return;
  }

  const modelId = session.filteredModels[index]!;
  const fullModelId = `${session.selectedProvider!.id}/${modelId}`;

  agent.setModel(fullModelId);
  session.state = "normal";
}

/**
 * Handles the back/cancel command
 */
export function handleBack(session: CLISession, agent: SupportAgent): void {
  if (session.state === "selecting_model") {
    // Go back to provider selection
    showProviderMenu(session.providers, agent);
    session.state = "selecting_provider";
  } else if (
    session.state === "selecting_provider" ||
    session.state === "entering_api_key"
  ) {
    console.log("Selection cancelled.");
    session.state = "normal";
  }
}

/**
 * Handles a user query
 */
export async function handleQuery(
  input: string,
  agent: SupportAgent,
): Promise<void> {
  const { source, query } = parseInput(input);

  console.log("Thinking...");
  try {
    await agent.query(query, source);
    // Response is streamed to console, just add final newline
    console.log("");
  } catch (error) {
    console.error("\nError:", error);
  }
}
