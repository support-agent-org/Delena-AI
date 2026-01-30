/**
 * Provider configuration
 *
 * Defines which AI providers are available and their API key requirements.
 */

/**
 * Map of provider IDs to their required environment variable names
 */
export const PROVIDER_API_KEYS: Record<string, string> = {
  google: "GOOGLE_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  xai: "XAI_API_KEY",
  mistral: "MISTRAL_API_KEY",
};

/**
 * Providers that don't require API keys (free via OpenCode Zen)
 */
export const FREE_PROVIDERS = ["zai", "opencode"];

/**
 * Ordered whitelist of providers to display
 * Free providers are listed first
 */
export const ALLOWED_PROVIDERS = [
  // Free providers (no API key required)
  "zai", // GLM 4.7 (free)
  "opencode", // Big Pickle, Kimi, MiniMax (free)
  // Paid providers (require API key)
  "google",
  "openai",
  "deepseek",
  "xai",
  "anthropic",
  "mistral",
];

/**
 * Checks if a provider requires an API key
 */
export function requiresApiKey(providerId: string): boolean {
  return !FREE_PROVIDERS.includes(providerId);
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
  return envVar ? !!process.env[envVar] : true;
}
