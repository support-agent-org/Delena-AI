/**
 * Provider configuration
 *
 * Defines which AI providers are available and their API key requirements.
 */

/**
 * Map of provider IDs to their required environment variable names
 */
export const PROVIDER_API_KEYS: Record<string, string> = {
  // Standard providers (require their own API keys)
  google: "GOOGLE_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  xai: "XAI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  // Note: OpenCode Zen removed - requires billing even for "free" models
};

/**
 * Ordered whitelist of providers to display
 * OpenCode Zen removed since it requires billing setup even for free-tier models
 */
export const ALLOWED_PROVIDERS = [
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
 * Note: All providers require API keys, but OpenCode Zen has free models
 */
export function requiresApiKey(providerId: string): boolean {
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
  const envVar = PROVIDER_API_KEYS[providerId];
  return envVar ? !!process.env[envVar] : false;
}

/**
 * Checks if a model is free (no per-token cost)
 * Currently always returns false - no truly free providers available
 */
export function isModelFree(_modelId: string): boolean {
  return false;
}

/**
 * Gets the recommended models for a provider
 */
export function getRecommendedModels(providerId: string): string[] {
  return RECOMMENDED_MODELS[providerId] || [];
}
