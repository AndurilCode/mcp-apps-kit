/**
 * File-based app creation helper
 *
 * Creates an MCP app from the generated manifest, driven by mcp.config.ts.
 * This allows mcp.config.ts to be both configuration AND the app factory.
 */

import * as path from "node:path";
import type { FileBasedConfig } from "./types.js";

/**
 * Options for creating a file-based app
 */
export interface CreateAppOptions extends FileBasedConfig {
  /**
   * Auto-start the server when not in test environment
   * @default true
   */
  autoStart?: boolean;

  /**
   * Port to listen on (can be overridden by PORT env var)
   * @default 3000
   */
  port?: number;
}

/**
 * The app instance returned by defineApp
 */
export interface FileBasedAppInstance {
  /** Start the server */
  start: (options?: { port?: number }) => Promise<void>;
  /** The underlying app from @mcp-apps-kit/core */
  app: unknown;
  /** Tool names */
  tools: string[];
  /** Workflow names */
  workflows: string[];
}

/**
 * Define and create a file-based MCP app
 *
 * This is the recommended way to create a file-based app. It:
 * 1. Uses the configuration to set up the app
 * 2. Imports the generated manifest
 * 3. Creates the app instance
 * 4. Optionally auto-starts in non-test environments
 *
 * @example
 * ```typescript
 * // mcp.config.ts
 * import { defineApp } from "@mcp-apps-kit/codegen";
 *
 * export default defineApp({
 *   name: "my-app",
 *   version: "1.0.0",
 *   directories: {
 *     tools: "tools",
 *     workflows: "workflows",
 *   },
 *   config: {
 *     protocol: "mcp",
 *   },
 * });
 * ```
 *
 * @param options - App configuration
 * @returns The app instance (for testing) or starts the server
 */
export async function defineApp(options: CreateAppOptions): Promise<FileBasedAppInstance> {
  const { autoStart = true, port: configPort, ...config } = options;

  // Determine project root from the caller's location
  // This works because mcp.config.ts imports this function
  const projectRoot = process.cwd();
  const outDir = "__generated__";
  const manifestPath = path.resolve(projectRoot, outDir, "app-manifest.js");

  // Dynamic import the manifest
  const cacheBuster = `?t=${Date.now()}`;
  const manifest = (await import(`file://${manifestPath}${cacheBuster}`)) as {
    tools: Record<string, unknown>;
    workflows: Record<string, unknown>;
  };

  // Dynamic import createFileBasedApp from core
  const coreModule = await import("@mcp-apps-kit/core");
  const createFileBasedApp = coreModule.createFileBasedApp as unknown as (
    config: Record<string, unknown>
  ) => {
    start: (opts: { port: number }) => Promise<void>;
  };

  // Create the app
  const app = createFileBasedApp({
    ...config,
    tools: manifest.tools,
  });

  const toolNames = Object.keys(manifest.tools);
  const workflowNames = Object.keys(manifest.workflows);

  const instance: FileBasedAppInstance = {
    app,
    tools: toolNames,
    workflows: workflowNames,
    start: async (startOptions?: { port?: number }) => {
      const port = startOptions?.port ?? configPort ?? parseInt(process.env.PORT ?? "3000", 10);
      await app.start({ port });

      const toolOnlyNames = toolNames.filter((n) => !workflowNames.includes(n));

      // eslint-disable-next-line no-console
      console.log(`
${config.name} running on http://localhost:${port}

Tools (${toolOnlyNames.length}):
${toolOnlyNames.map((name) => `  - ${name}`).join("\n")}

Workflows (${workflowNames.length}):
${workflowNames.map((name) => `  - ${name}`).join("\n")}

Endpoints:
  - MCP:     http://localhost:${port}/mcp
  - Health:  http://localhost:${port}/health
`);
    },
  };

  // Auto-start if not in test environment
  if (autoStart && process.env.NODE_ENV !== "test" && !process.env.VITEST) {
    await instance.start();
  }

  return instance;
}
