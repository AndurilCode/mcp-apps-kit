/**
 * Serve CLI for @mcp-apps-kit/codegen
 *
 * Generates manifest and starts the MCP server in one command.
 * No separate server file needed - mcp.config.ts drives everything.
 *
 * Usage: mcp-serve [--port 3000] [--watch]
 */

import * as path from "node:path";
import { runCodegen } from "./generator.js";
import { loadConfig } from "./config.js";

interface ServeOptions {
  port?: number;
  watch?: boolean;
  configPath?: string;
}

/**
 * Parse CLI arguments
 */
function parseArgs(): ServeOptions {
  const args = process.argv.slice(2);
  const options: ServeOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--port" || arg === "-p") {
      options.port = parseInt(args[++i] ?? "3000", 10);
    } else if (arg === "--watch" || arg === "-w") {
      options.watch = true;
    } else if (arg === "--config" || arg === "-c") {
      options.configPath = args[++i];
    }
  }

  return options;
}

/**
 * Start the MCP server using the generated manifest
 */
async function serve(options: ServeOptions = {}): Promise<void> {
  const projectRoot = process.cwd();
  const configPath = options.configPath ?? "./mcp.config.ts";
  const outDir = "__generated__";

  // eslint-disable-next-line no-console
  console.log("[mcp-serve] Starting...\n");

  // Step 1: Generate manifest
  await runCodegen({
    projectRoot,
    configPath,
    outDir,
  });

  // Step 2: Load config
  const config = await loadConfig(configPath, projectRoot);

  // Step 3: Dynamic import the manifest and core
  const manifestPath = path.resolve(projectRoot, outDir, "app-manifest.js");

  // Import the generated manifest
  const cacheBuster = `?t=${Date.now()}`;
  const manifest = (await import(`file://${manifestPath}${cacheBuster}`)) as {
    tools: Record<string, unknown>;
    workflows: Record<string, unknown>;
  };

  // Import createFileBasedApp from core
  const coreModule = await import("@mcp-apps-kit/core");
  const createFileBasedApp = coreModule.createFileBasedApp as unknown as (
    config: Record<string, unknown>
  ) => {
    start: (opts: { port: number }) => Promise<void>;
  };

  // Step 4: Create and start the app
  const app = createFileBasedApp({
    ...config,
    tools: manifest.tools,
  });

  const port = options.port ?? parseInt(process.env.PORT ?? "3000", 10);
  await app.start({ port });

  // Log startup info
  const workflowNames = Object.keys(manifest.workflows);
  const toolOnlyNames = Object.keys(manifest.tools).filter((name) => !workflowNames.includes(name));

  // eslint-disable-next-line no-console
  console.log(`
[mcp-serve] Server running on http://localhost:${port}

Tools (${toolOnlyNames.length}):
${toolOnlyNames.map((name) => `  - ${name}`).join("\n")}

Workflows (${workflowNames.length}):
${workflowNames.map((name) => `  - ${name}`).join("\n")}

Endpoints:
  - MCP:     http://localhost:${port}/mcp
  - Health:  http://localhost:${port}/health
`);

  // TODO: Add watch mode support if options.watch is true
}

// Run the server
serve(parseArgs()).catch((error: unknown) => {
  console.error("[mcp-serve] Failed to start:", error); // eslint-disable-line no-console
  process.exit(1);
});
