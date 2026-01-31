/**
 * Context Builder
 *
 * Builds context prompts for the AI from repository data.
 */

/**
 * Builds the initial system context for a loaded repository
 */
export function buildRepoContext(
  repoName: string,
  repoMap: string,
  keyFiles?: Map<string, string>
): string {
  let context = `You are analyzing the repository "${repoName}".

## Repository Structure
\`\`\`
${repoMap}
\`\`\`

`;

  if (keyFiles && keyFiles.size > 0) {
    context += `## Key Files\n\n`;

    for (const [fileName, content] of keyFiles) {
      // Truncate very long files
      const truncatedContent =
        content.length > 2000
          ? content.substring(0, 2000) + "\n... (truncated)"
          : content;

      context += `### ${fileName}\n\`\`\`\n${truncatedContent}\n\`\`\`\n\n`;
    }
  }

  context += `## Instructions
- You are a READ-ONLY assistant. You can ONLY read and analyze this repository.
- You do NOT have the ability to write, modify, or delete any files.
- If asked to make changes, explain what changes would be needed but clarify you cannot execute them.
- Answer questions about the codebase structure, dependencies, and functionality.
- When referencing files, use their relative paths from the repository root.
`;

  return context;
}

/**
 * Builds a context message for token-efficient queries
 */
export function buildQueryContext(
  query: string,
  repoContext?: string
): string {
  if (!repoContext) {
    return query;
  }

  return `${repoContext}

## User Question
${query}`;
}

/**
 * Formats token usage for display
 */
export function formatTokenUsage(
  inputTokens: number,
  outputTokens: number
): string {
  const total = inputTokens + outputTokens;
  return `(Tokens: ${inputTokens} in / ${outputTokens} out, total: ${total})`;
}
