/**
 * Support Agent - Entry Point
 *
 * A CLI-based AI assistant that helps programmers with code queries.
 */

import { runCLI } from "./cli";

// Run the CLI application
runCLI().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
