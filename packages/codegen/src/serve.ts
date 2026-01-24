/**
 * Serve CLI for @mcp-apps-kit/codegen
 *
 * Generates manifest and starts the MCP server in one command.
 * No separate server file needed - mcp.config.ts drives everything.
 *
 * Usage: mcp-serve [--port 3000] [--watch]
 */

import * as path from "node:path";
import { createJiti } from "jiti";
import { runCodegen } from "./generator.js";
import { loadConfigWithFallback, isVersionedConfig } from "./config.js";
import { createStandaloneWatcher } from "./watcher.js";
import type { FileBasedConfig } from "./types.js";
import type { ToolDefs } from "@mcp-apps-kit/core";

interface ServeOptions {
  port?: number;
  watch?: boolean;
  configPath?: string;
}

/**
 * App instance type with updateTools method for hot reload
 */
interface AppWithHotReload {
  start: (opts: { port: number }) => Promise<void>;
  updateTools: (newTools: ToolDefs) => void;
  use: (middleware: unknown) => void;
  on: (event: string, handler: unknown) => () => void;
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
      const nextArg = args[i + 1];
      if (!nextArg || nextArg.startsWith("-")) {
        console.error(`[mcp-serve] Error: ${arg} requires a port number`); // eslint-disable-line no-console
        process.exit(1);
      }
      i++;
      // Validate port is a valid integer string (no trailing characters, in range 1-65535)
      const parsedPort = parseInt(nextArg, 10);
      if (
        isNaN(parsedPort) ||
        String(parsedPort) !== nextArg ||
        parsedPort < 1 ||
        parsedPort > 65535
      ) {
        console.error(
          `[mcp-serve] Error: Invalid port number: ${nextArg}. Must be an integer between 1 and 65535.`
        ); // eslint-disable-line no-console
        process.exit(1);
      }
      options.port = parsedPort;
    } else if (arg === "--watch" || arg === "-w") {
      options.watch = true;
    } else if (arg === "--config" || arg === "-c") {
      const nextArg = args[i + 1];
      if (!nextArg || nextArg.startsWith("-")) {
        console.error(`[mcp-serve] Error: ${arg} requires a config file path`); // eslint-disable-line no-console
        process.exit(1);
      }
      i++;
      options.configPath = nextArg;
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

  // Step 2: Load config (with fallback to package.json if mcp.config.ts not found)
  const loadedConfig = await loadConfigWithFallback(configPath, projectRoot);

  // Check for versioned config - serve command doesn't support it yet
  if (isVersionedConfig(loadedConfig)) {
    throw new Error(
      "mcp-serve does not support versioned configurations yet. " +
        "Use single-version config or run the server directly from __generated__/server.ts"
    );
  }

  // At this point we know it's a single-version config
  const config: FileBasedConfig = loadedConfig;

  // Step 3: Import the manifest using jiti (supports TypeScript)
  const manifestPath = path.resolve(projectRoot, outDir, "app-manifest.ts");

  // Create jiti instance for importing TypeScript files
  const jiti = createJiti(projectRoot, {
    interopDefault: true,
    moduleCache: false, // Disable cache for hot reload
    jsx: true, // Enable JSX support for widget TSX files
  });

  // Import the generated manifest
  const manifestModule = await jiti.import(manifestPath);
  const manifest = manifestModule as {
    tools: Record<string, unknown>;
    workflows: Record<string, unknown>;
    middleware: unknown[];
    handlers: unknown[];
  };

  // Import createFileBasedApp from core
  const coreModule = await import("@mcp-apps-kit/core");
  const createFileBasedApp = coreModule.createFileBasedApp as unknown as (
    config: Record<string, unknown>
  ) => AppWithHotReload;

  // Step 4: Create and start the app
  const app = createFileBasedApp({
    ...config,
    tools: manifest.tools,
  });

  // Register file-based middleware (sorted by order property, then alphabetically)
  const middlewareList = manifest.middleware ?? [];
  const sortedMiddleware = [...middlewareList].sort((a, b) => {
    const orderA =
      typeof a === "object" && a !== null && "order" in a ? (a as { order: number }).order : 100;
    const orderB =
      typeof b === "object" && b !== null && "order" in b ? (b as { order: number }).order : 100;
    return orderA - orderB;
  });
  for (const mw of sortedMiddleware) {
    const middlewareFn =
      typeof mw === "object" && mw !== null && "middleware" in mw
        ? (mw as { middleware: unknown }).middleware
        : mw;
    app.use(middlewareFn);
  }

  // Register file-based event handlers
  const handlersList = manifest.handlers ?? [];
  for (const handler of handlersList) {
    if (
      typeof handler === "object" &&
      handler !== null &&
      "event" in handler &&
      "handler" in handler
    ) {
      const h = handler as { event: string; handler: unknown };
      app.on(h.event, h.handler);
    }
  }

  // Validate and determine port
  let port = options.port;
  if (port === undefined) {
    const envPort = process.env.PORT;
    if (envPort !== undefined) {
      const parsedEnvPort = parseInt(envPort, 10);
      if (
        isNaN(parsedEnvPort) ||
        String(parsedEnvPort) !== envPort ||
        parsedEnvPort < 1 ||
        parsedEnvPort > 65535
      ) {
        console.error(
          `[mcp-serve] Error: Invalid PORT environment variable: ${envPort}. Must be an integer between 1 and 65535.`
        ); // eslint-disable-line no-console
        process.exit(1);
      }
      port = parsedEnvPort;
    } else {
      port = 3000;
    }
  }
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

  // Step 5: Set up watch mode if requested
  if (options.watch) {
    // eslint-disable-next-line no-console
    console.log("[mcp-serve] Watch mode enabled - hot reload active\n");

    const watcher = await createStandaloneWatcher({
      projectRoot,
      directories: config.directories,
      onRegenerate: async () => {
        try {
          // Regenerate the manifest
          await runCodegen({
            projectRoot,
            configPath,
            outDir,
          });

          // Clear Node's module cache for the tools/workflows directories
          // This ensures jiti reimports fresh versions of modified files
          // Note: require.cache only exists in CJS context, may be undefined in ESM
          const toolsDir = path.resolve(projectRoot, config.directories?.tools ?? "tools");
          const workflowsDir = path.resolve(
            projectRoot,
            config.directories?.workflows ?? "workflows"
          );

          const cache = typeof require !== "undefined" ? require.cache : undefined;
          if (cache) {
            for (const key of Object.keys(cache)) {
              if (
                key.startsWith(toolsDir) ||
                key.startsWith(workflowsDir) ||
                key.startsWith(manifestPath)
              ) {
                Reflect.deleteProperty(cache, key);
              }
            }
          }

          // Re-import the manifest using jiti (fresh instance for cache bypass)
          // Use cache-busting query string to force reimport of all dependencies
          const freshJiti = createJiti(projectRoot, {
            interopDefault: true,
            moduleCache: false,
            fsCache: false,
            jsx: true, // Enable JSX support for widget TSX files
          });
          const cacheBustPath = `${manifestPath}?t=${Date.now()}`;
          const newManifestModule = await freshJiti.import(cacheBustPath);
          const moduleObj = newManifestModule as Record<string, unknown>;

          // Handle both default export and named exports
          const rawManifest = moduleObj.default ?? moduleObj;
          const newManifest = rawManifest as {
            tools?: Record<string, unknown>;
            workflows?: Record<string, unknown>;
          };

          const tools = newManifest.tools ?? {};
          const workflows = newManifest.workflows ?? {};

          // Validate tools before hot reload
          if (typeof tools !== "object" || tools === null) {
            throw new Error(`Invalid tools object: ${typeof tools}`);
          }

          // Check for undefined tool values (failed imports)
          for (const [name, tool] of Object.entries(tools)) {
            if (tool === undefined || tool === null) {
              throw new Error(`Tool "${name}" is undefined - import may have failed`);
            }
          }

          // Hot reload the tools
          app.updateTools(tools as ToolDefs);

          // Log what was reloaded
          const newWorkflowNames = Object.keys(workflows);
          const newToolOnlyNames = Object.keys(tools).filter(
            (name) => !newWorkflowNames.includes(name)
          );

          // eslint-disable-next-line no-console
          console.log(
            `[mcp-serve] Hot reloaded: ${newToolOnlyNames.length} tools, ${newWorkflowNames.length} workflows`
          );
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(
            "[mcp-serve] Hot reload failed:",
            error instanceof Error ? error.message : String(error)
          );
          if (error instanceof Error && error.stack) {
            // eslint-disable-next-line no-console
            console.error(error.stack);
          }
        }
      },
    });

    // Handle graceful shutdown
    const cleanup = () => {
      // eslint-disable-next-line no-console
      console.log("\n[mcp-serve] Shutting down...");
      watcher.close();
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  }
}

// Run the server
serve(parseArgs()).catch((error: unknown) => {
  console.error("[mcp-serve] Failed to start:", error); // eslint-disable-line no-console
  process.exit(1);
});
