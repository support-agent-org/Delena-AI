/**
 * CLI Utilities
 *
 * Helper functions for CLI input/output.
 */

import type { ParsedInput } from "../types";

/**
 * Parses user input to extract source URL and query.
 *
 * Formats supported:
 * - "https://... question here" (URL at start)
 * - "[source] question here" (source in brackets)
 * - "question here" (no source)
 */
export function parseInput(input: string): ParsedInput {
  const trimmed = input.trim();

  // Check for URL at the start of input
  const urlMatch = trimmed.match(/^(https?:\/\/\S+)\s+(.+)$/);
  if (urlMatch) {
    return {
      source: urlMatch[1],
      query: urlMatch[2]!.trim(),
    };
  }

  // Check for [source] format
  const bracketMatch = trimmed.match(/^\[(.*?)\]\s*(.*)$/);
  if (bracketMatch && bracketMatch.length >= 3) {
    return {
      source: bracketMatch[1]!.trim(),
      query: bracketMatch[2]!.trim(),
    };
  }

  // No source, just query
  return { query: trimmed };
}
