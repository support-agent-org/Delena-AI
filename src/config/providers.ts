/**
 * Provider configuration
 *
 * Defines which AI providers are available and their API key requirements.
 */

/**
 * Map of provider IDs to their required environment variable names
 * These must match what OpenCode/underlying AI SDKs expect
 * Note: "opencode" is NOT in this list because it has truly free models
 */
export const PROVIDER_API_KEYS: Record<string, string> = {
  // Google uses GOOGLE_GENERATIVE_AI_API_KEY (or GOOGLE_API_KEY as fallback)
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  xai: "XAI_API_KEY",
  mistral: "MISTRAL_API_KEY",
};

/**
 * Free models available through OpenCode (no API key required)
 * These are truly free - no billing or API key setup needed
 */
export const FREE_MODELS = [
  "opencode/glm-4.7-free", // GLM 4.7 Free - No API key required
  "opencode/kimi-k2.5-free", // Kimi 2.5 Free - No API key required
];

/**
 * Ordered whitelist of providers to display
 * OpenCode is first since it has free models
 */
export const ALLOWED_PROVIDERS = [
  "opencode", // Has truly free models (no API key required)
  "google",
  "openai",
  "deepseek",
  "xai",
  "anthropic",
  "mistral",
];

/**
 * Recommended models for each provider
 * Only show curated, high-quality models
 */
export const RECOMMENDED_MODELS: Record<string, string[]> = {
  opencode: [
    "glm-4.7-free", // FREE - No API key required
    "kimi-k2.5-free", // FREE - No API key required
  ],
  google: [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-3-flash-preview",
    "gemini-3-pro-preview",
  ],
  openai: ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini"],
  anthropic: ["claude-sonnet-4", "claude-opus-4"],
  deepseek: ["deepseek-r1", "deepseek-v3"],
  xai: ["grok-3", "grok-code"],
  mistral: ["mistral-large"],
};

/**
 * Checks if a provider requires an API key
 * OpenCode doesn't require an API key for its free models
 */
export function requiresApiKey(providerId: string): boolean {
  // OpenCode has free models that don't require an API key
  if (providerId === "opencode") {
    return false;
  }
  return providerId in PROVIDER_API_KEYS;
}

/**
 * Gets the environment variable name for a provider's API key
 */
export function getApiKeyEnvVar(providerId: string): string | undefined {
  return PROVIDER_API_KEYS[providerId];
}

/**
 * Checks if an API key is set for a provider
 */
export function hasApiKey(providerId: string): boolean {
  // OpenCode free models don't need an API key
  if (providerId === "opencode") {
    return true; // Always "has" key since none is needed
  }
  const envVar = PROVIDER_API_KEYS[providerId];
  return envVar ? !!process.env[envVar] : false;
}

/**
 * Checks if a model is free (no API key or billing required)
 */
export function isModelFree(modelId: string): boolean {
  return FREE_MODELS.includes(modelId);
}

/**
 * Gets the recommended models for a provider
 */
export function getRecommendedModels(providerId: string): string[] {
  return RECOMMENDED_MODELS[providerId] || [];
}
