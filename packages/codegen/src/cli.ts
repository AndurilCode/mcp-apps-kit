/**
 * CLI for @mcp-apps-kit/codegen
 *
 * Reads mcp.config.ts and generates the app manifest.
 *
 * Usage: npx @mcp-apps-kit/codegen
 *    or: mcp-codegen (if installed globally or via npx)
 */

import { runCodegen } from "./generator.js";

runCodegen().catch((error: unknown) => {
  console.error("Failed to generate manifest:", error);
  process.exit(1);
});
