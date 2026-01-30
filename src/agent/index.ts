/**
 * Support Agent
 *
 * Main agent class that manages AI interactions via OpenCode.
 */

import { createOpencodeClient } from "@opencode-ai/sdk/client";
import type { OpencodeClient } from "@opencode-ai/sdk";

import type { ThinkingMode, Provider } from "../types";
import {
  ALLOWED_PROVIDERS,
  requiresApiKey,
  getApiKeyEnvVar,
  hasApiKey,
  DEFAULT_MODEL,
  DEFAULT_THINKING_MODE,
  THINKING_CONFIGS,
  filterModels,
} from "../config";
import { spawnServer, stopServer } from "./server";

/**
 * SupportAgent manages AI model interactions
 */
export class SupportAgent {
  private client: OpencodeClient | null = null;
  private serverProc: ReturnType<typeof Bun.spawn> | null = null;
  private currentSessionId: string | null = null;

  private _currentModel: string = DEFAULT_MODEL;
  private _currentMode: ThinkingMode = DEFAULT_THINKING_MODE;

  // ─────────────────────────────────────────────────────────────────
  // Getters
  // ─────────────────────────────────────────────────────────────────

  /** Returns the currently active model string */
  get currentModel(): string {
    return this._currentModel;
  }

  /** Returns the current thinking mode */
  get currentMode(): ThinkingMode {
    return this._currentMode;
  }

  // ─────────────────────────────────────────────────────────────────
  // Provider & Model Utilities (delegated to config)
  // ─────────────────────────────────────────────────────────────────

  requiresApiKey = requiresApiKey;
  getApiKeyEnvVar = getApiKeyEnvVar;
  hasApiKey = hasApiKey;
  filterModels = filterModels;

  // ─────────────────────────────────────────────────────────────────
  // Model Management
  // ─────────────────────────────────────────────────────────────────

  /**
   * Sets the current model
   */
  setModel(modelString: string): void {
    this._currentModel = modelString;
    console.log(`Model set to: ${modelString}`);
  }

  /**
   * Sets the thinking mode
   */
  setThinkingMode(mode: ThinkingMode): void {
    this._currentMode = mode;
    const config = THINKING_CONFIGS[mode];
    console.log(
      `Switched to ${mode} thinking mode (reasoning: ${config.reasoningEffort})`,
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Provider Discovery
  // ─────────────────────────────────────────────────────────────────

  /**
   * Returns a list of available providers and their models
   */
  async getAvailableProviders(): Promise<Provider[]> {
    if (!this.client) {
      throw new Error("Agent not started");
    }

    const response = await this.client.provider.list();
    if (!response.data) {
      return [];
    }

    const allProviders = response.data.all || [];

    // Filter to allowed providers and sort by preference order
    return allProviders
      .filter((p: Provider) => ALLOWED_PROVIDERS.includes(p.id))
      .sort(
        (a: Provider, b: Provider) =>
          ALLOWED_PROVIDERS.indexOf(a.id) - ALLOWED_PROVIDERS.indexOf(b.id),
      );
  }

  // ─────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────

  /**
   * Starts the OpenCode server and initializes the client
   */
  async start(): Promise<void> {
    const { process, url } = await spawnServer(this._currentModel);
    this.serverProc = process;

    this.client = createOpencodeClient({
      baseUrl: url,
    });

    // console.log("Support Agent initialized.");
  }

  /**
   * Stops the server and cleans up resources
   */
  async stop(): Promise<void> {
    await stopServer(this.serverProc);
    this.serverProc = null;
    this.client = null;
    this.currentSessionId = null;
  }

  // ─────────────────────────────────────────────────────────────────
  // Query Processing
  // ─────────────────────────────────────────────────────────────────

  /**
   * Processes a user query and returns the AI response
   */
  async query(input: string, source?: string): Promise<string> {
    if (!this.client) {
      throw new Error("Agent not started");
    }

    // Build the full query
    let fullQuery = input;
    if (source) {
      fullQuery = `Using the source '${source}', please answer: ${input}`;
    }

    // Ensure we have a session
    if (!this.currentSessionId) {
      const result = await this.client.session.create();
      if (!result.data) {
        throw new Error("Failed to create session");
      }
      this.currentSessionId = result.data.id;
    }

    // Parse model string "provider/model"
    const [providerID, modelID] = this._currentModel.split("/");

    const payload = {
      path: { id: this.currentSessionId },
      body: {
        model: { providerID: providerID!, modelID: modelID! },
        parts: [{ type: "text" as const, text: fullQuery }],
      },
    };

    try {
      const response = await this.client.session.prompt(payload);

      if (!response.data || !response.data.parts) {
        throw new Error("Failed to get response");
      }

      // Extract text from response parts
      return response.data.parts
        .filter((p: { type: string }) => p.type === "text")
        .map((p: { text: string }) => p.text)
        .join("\n");
    } catch (error) {
      console.error("Query error:", error);
      throw error;
    }
  }
}

export default SupportAgent;
