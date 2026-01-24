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
import { sortMiddleware, getMiddlewareFn } from "./helpers.js";
import type { FileBasedConfig } from "./types.js";
import type { ToolDefs } from "@mcp-apps-kit/core";

/**
 * Tracks loaded modules for proper cleanup during hot reload
 * Uses WeakRef where possible to avoid preventing garbage collection
 */
const loadedModulePaths = new Set<string>();

/**
 * Recursively clear module cache for a path and its dependencies
 * Properly handles circular references to avoid memory leaks
 */
function clearModuleCacheRecursive(modulePath: string, visited = new Set<string>()): void {
  if (visited.has(modulePath)) {
    return; // Avoid infinite loops on circular dependencies
  }
  visited.add(modulePath);

  const cache = typeof require !== "undefined" ? require.cache : undefined;
  if (!cache) {
    return;
  }

  const cached = cache[modulePath];
  if (!cached) {
    return;
  }

  // Recursively clear children first
  if (cached.children) {
    for (const child of cached.children) {
      // Only clear children that are within tracked paths
      if (loadedModulePaths.has(child.id)) {
        clearModuleCacheRecursive(child.id, visited);
      }
    }
    // Clear children array to help GC
    cached.children.length = 0;
  }

  // Remove from cache
  Reflect.deleteProperty(cache, modulePath);
  loadedModulePaths.delete(modulePath);
}

/**
 * Validate tools object before hot reload
 *
 * Validates that each tool has:
 * - An execute, build, or handler function
 * - A description string
 * - A valid input schema (Zod schema with _def or parse method)
 *
 * @param tools - The tools object to validate
 * @throws Error if validation fails
 */
function validateToolsForHotReload(tools: Record<string, unknown>): void {
  if (typeof tools !== "object" || tools === null) {
    throw new Error(`Invalid tools object: expected object, got ${typeof tools}`);
  }

  for (const [name, tool] of Object.entries(tools)) {
    // Check for undefined/null (failed imports)
    if (tool === undefined || tool === null) {
      throw new Error(`Tool "${name}" is undefined or null - import may have failed`);
    }

    // Check tool has expected structure (defineTool returns objects with specific shape)
    if (typeof tool !== "object") {
      throw new Error(`Tool "${name}" is not an object - expected defineTool result`);
    }

    const toolObj = tool as Record<string, unknown>;

    // Check for essential tool properties that defineTool creates
    // Tools must have an execute function or be a tool builder
    const hasExecute = typeof toolObj.execute === "function";
    const hasBuild = typeof toolObj.build === "function";
    const hasHandler = typeof toolObj.handler === "function";

    if (!hasExecute && !hasBuild && !hasHandler) {
      throw new Error(
        `Tool "${name}" is missing execute/build/handler function - may not be a valid tool definition`
      );
    }

    // Validate description is present and is a string
    if (typeof toolObj.description !== "string" || toolObj.description.trim() === "") {
      throw new Error(
        `Tool "${name}" is missing or has invalid description - expected non-empty string`
      );
    }

    // Validate input schema is present and looks like a Zod schema
    // Zod schemas have a _def property (internal) or a parse method
    const input = toolObj.input as Record<string, unknown> | undefined;
    if (!input || typeof input !== "object") {
      throw new Error(`Tool "${name}" is missing input schema - expected Zod schema`);
    }

    const hasZodDef = "_def" in input;
    const hasParseMethod = typeof input.parse === "function";
    if (!hasZodDef && !hasParseMethod) {
      throw new Error(
        `Tool "${name}" has invalid input schema - expected Zod schema with _def or parse method`
      );
    }
  }
}

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

  // Register file-based middleware (sorted by order property)
  const middlewareList = manifest.middleware ?? [];
  const sortedMiddleware = sortMiddleware(middlewareList as Parameters<typeof sortMiddleware>[0]);
  for (const mw of sortedMiddleware) {
    app.use(getMiddlewareFn(mw));
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
          // Uses recursive cleanup to properly handle circular dependencies
          const toolsDir = path.resolve(projectRoot, config.directories?.tools ?? "tools");
          const workflowsDir = path.resolve(
            projectRoot,
            config.directories?.workflows ?? "workflows"
          );
          const uiWidgetsDir = config.directories?.uiWidgets
            ? path.resolve(projectRoot, config.directories.uiWidgets)
            : null;

          const cache = typeof require !== "undefined" ? require.cache : undefined;
          if (cache) {
            // Collect paths to clear (avoid modifying while iterating)
            const pathsToClear: string[] = [];
            for (const key of Object.keys(cache)) {
              if (
                key.startsWith(toolsDir) ||
                key.startsWith(workflowsDir) ||
                key.startsWith(manifestPath) ||
                (uiWidgetsDir && key.startsWith(uiWidgetsDir))
              ) {
                pathsToClear.push(key);
                loadedModulePaths.add(key);
              }
            }
            // Clear with proper dependency handling
            for (const modulePath of pathsToClear) {
              clearModuleCacheRecursive(modulePath);
            }
          }

          // Re-import the manifest using jiti (fresh instance for cache bypass)
          // Use cache-busting query string to force reimport of all dependencies.
          //
          // NOTE: The query string approach is a jiti-specific technique that works by
          // making each import URL unique. While non-standard for ESM imports, jiti
          // uses the full URL (including query string) as the cache key, so this
          // effectively bypasses its module cache. This is combined with moduleCache:false
          // and fsCache:false for complete cache invalidation during hot reload.
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

          // Validate tools before hot reload using comprehensive validation
          validateToolsForHotReload(tools);

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
