/**
 * Type definitions for Support Agent
 */

/**
 * Thinking mode controls reasoning depth
 */
export type ThinkingMode = "low" | "medium" | "high";

/**
 * Thinking mode configuration
 */
export interface ThinkingConfig {
  reasoningEffort: "low" | "medium" | "high";
  budgetTokens: number;
}

/**
 * Provider information from OpenCode API
 */
export interface Provider {
  id: string;
  name?: string;
  models?: Record<string, ModelInfo>;
}

/**
 * Model information
 */
export interface ModelInfo {
  name?: string;
  description?: string;
}

/**
 * Parsed user input
 */
export interface ParsedInput {
  source?: string;
  query: string;
}

/**
 * CLI interaction state
 */
export type CLIState =
  | "normal"
  | "selecting_provider"
  | "selecting_model"
  | "entering_api_key";
