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
  getRecommendedModels,
  isModelFree,
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
  getRecommendedModels = getRecommendedModels;
  isModelFree = isModelFree;

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
   * Creates a promise that rejects after a timeout
   */
  private timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Request timed out after ${ms / 1000}s`));
      }, ms);

      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Processes a user query and returns the AI response
   * Uses event-based streaming for proper response handling
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

    // Subscribe to events first
    const events = await this.client.event.subscribe();

    // Collect response text from events
    let responseText = "";
    let sessionCompleted = false;
    let sessionError: string | null = null;
    const currentSessionId = this.currentSessionId;

    // Send the prompt asynchronously
    await this.client.session.promptAsync({
      path: { id: this.currentSessionId },
      body: {
        model: { providerID: providerID!, modelID: modelID! },
        parts: [{ type: "text" as const, text: fullQuery }],
      },
    });

    // Set up timeout
    const timeout = setTimeout(() => {
      sessionError = "Request timed out after 60s";
      sessionCompleted = true;
    }, 60000);

    // Start response on new line
    let hasStartedPrinting = false;

    try {
      // Listen for events
      for await (const event of events.stream) {
        // Only process events for our session
        const props = event.properties as any;

        if (
          props?.sessionID !== currentSessionId &&
          props?.info?.sessionID !== currentSessionId
        ) {
          // Skip events for other sessions
          if (
            event.type !== "message.part.updated" &&
            event.type !== "session.idle"
          ) {
            continue;
          }
        }

        switch (event.type) {
          case "message.part.updated":
            // Handle streaming text updates
            if (
              props?.part?.type === "text" &&
              props?.part?.sessionID === currentSessionId
            ) {
              // Use delta if available, otherwise use full text
              if (props.delta) {
                if (!hasStartedPrinting) {
                  process.stdout.write("\n"); // Start on new line
                  hasStartedPrinting = true;
                }
                responseText += props.delta;
                process.stdout.write(props.delta); // Stream to console
              } else if (props.part.text && responseText === "") {
                responseText = props.part.text;
              }
            }
            break;

          case "session.idle":
            // Session has completed processing
            if (props?.sessionID === currentSessionId) {
              sessionCompleted = true;
            }
            break;

          case "session.error":
            // Handle errors
            if (props?.sessionID === currentSessionId || !props?.sessionID) {
              sessionError =
                props?.error?.data?.message || "Unknown error occurred";
              sessionCompleted = true;
            }
            break;
        }

        if (sessionCompleted) break;
      }
    } finally {
      clearTimeout(timeout);
    }

    if (sessionError) {
      throw new Error(sessionError);
    }

    return responseText || "(No response received)";
  }
}

export default SupportAgent;
