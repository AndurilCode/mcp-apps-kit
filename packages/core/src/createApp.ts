/**
 * createApp implementation for @mcp-apps-kit/core
 *
 * Creates an MCP app with unified tool and UI definitions.
 */

import type { ToolDefs, App, StartOptions, McpServer, ExpressMiddleware } from "./types/tools";
import type { AppConfig } from "./types/config";
import type { UIDefs } from "./types/ui";
import { AppError, ErrorCode } from "./utils/errors";
import { createServerInstance, type ServerInstance } from "./server/index";
import { PluginManager } from "./plugins/PluginManager";

/**
 * Validate app configuration
 */
function validateConfig<T extends ToolDefs>(config: unknown): asserts config is AppConfig<T> {
  if (typeof config !== "object" || config === null) {
    throw new AppError(ErrorCode.INVALID_CONFIG, "Config must be an object");
  }

  const cfg = config as Record<string, unknown>;

  if (typeof cfg.name !== "string" || cfg.name.length === 0) {
    throw new AppError(
      ErrorCode.INVALID_CONFIG,
      "Config.name is required and must be a non-empty string"
    );
  }

  if (typeof cfg.version !== "string" || cfg.version.length === 0) {
    throw new AppError(
      ErrorCode.INVALID_CONFIG,
      "Config.version is required and must be a non-empty string"
    );
  }

  if (typeof cfg.tools !== "object" || cfg.tools === null) {
    throw new AppError(ErrorCode.INVALID_CONFIG, "Config.tools is required and must be an object");
  }
}

/**
 * Create an MCP app with unified tool and UI definitions
 *
 * @param config - App configuration with tools and UI resources
 * @returns App instance for starting server or getting middleware
 *
 * @example
 * ```typescript
 * const app = createApp({
 *   name: "my-app",
 *   version: "1.0.0",
 *   tools: {
 *     greet: {
 *       description: "Greet a user",
 *       input: z.object({ name: z.string() }),
 *       output: z.object({ message: z.string() }),
 *       handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
 *     },
 *   },
 * });
 *
 * await app.start({ port: 3000 });
 * ```
 */
export function createApp<T extends ToolDefs, U extends UIDefs | undefined = undefined>(
  config: AppConfig<T> & { ui?: U }
): App<T, U> {
  // Validate config at runtime
  validateConfig<T>(config);

  // Initialize plugin manager (but defer init() call to app.start())
  const pluginManager = new PluginManager(config.plugins ?? []);
  let pluginInitialized = false;

  // Create server instance (lazy initialization)
  let serverInstance: ServerInstance | null = null;

  function getServerInstance(): ServerInstance {
    serverInstance ??= createServerInstance(config, pluginManager);
    return serverInstance;
  }

  // Create the app instance
  const app: App<T, U> = {
    // Typed tool definitions
    tools: config.tools,

    // UI resource definitions
    ui: config.ui as U,

    /**
     * Start the built-in Express server
     */
    start: async (options?: StartOptions): Promise<void> => {
      // Initialize plugins if not already done
      if (!pluginInitialized) {
        await pluginManager.init({
          config,
          tools: config.tools,
        });
        pluginInitialized = true;
      }
      
      const server = getServerInstance();
      await server.start(options);
    },

    /**
     * Get the underlying MCP server instance
     */
    getServer: (): McpServer => {
      const server = getServerInstance();
      return server.mcpServer as unknown as McpServer;
    },

    /**
     * Get Express middleware for custom server setup
     */
    handler: (): ExpressMiddleware => {
      const server = getServerInstance();
      return server.handler();
    },

    /**
     * Handle a single request (for serverless)
     */
    handleRequest: async (req: Request, env?: unknown): Promise<Response> => {
      const server = getServerInstance();
      return server.handleRequest(req, env);
    },

    /**
     * Register middleware (stub - not yet implemented)
     */
    use: () => {
      throw new Error("Middleware not yet implemented");
    },

    /**
     * Subscribe to event (stub - not yet implemented)
     */
    on: () => {
      throw new Error("Events not yet implemented");
    },

    /**
     * Subscribe to event once (stub - not yet implemented)
     */
    once: () => {
      throw new Error("Events not yet implemented");
    },

    /**
     * Subscribe to all events (stub - not yet implemented)
     */
    onAny: () => {
      throw new Error("Events not yet implemented");
    },
  };

  return app;
}

/**
 * Define a UI resource with type inference (optional helper)
 *
 * @param def - UI resource definition
 * @returns The same UI definition (for type inference)
 *
 * @example
 * ```typescript
 * const widget = defineUI({
 *   html: "./widget.html",
 *   csp: { connectDomains: ["https://api.example.com"] },
 * });
 * ```
 */
export function defineUI<T>(def: T): T {
  return def;
}

// Re-export defineTool from types/tools for convenience
export { defineTool } from "./types/tools";
