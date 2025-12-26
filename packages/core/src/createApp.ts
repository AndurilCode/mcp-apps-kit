/**
 * createApp implementation for @mcp-apps-kit/core
 *
 * Creates an MCP app with unified tool and UI definitions.
 */

import type { ToolDefs, App, StartOptions, McpServer, ExpressMiddleware } from "./types/tools";
import type { AppConfig, DebugConfig } from "./types/config";
import type { UIDefs } from "./types/ui";
import type { Middleware } from "./middleware/types";
import type { EventMap } from "./events/types";
import { AppError, ErrorCode } from "./utils/errors";
import { createServerInstance, type ServerInstance } from "./server/index";
import { PluginManager } from "./plugins/PluginManager";
import { MiddlewareChain } from "./middleware/MiddlewareChain";
import { TypedEventEmitter } from "./events/EventEmitter";
import { configureDebugLogger } from "./debug/logger";

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

  // Validate serverRoute if provided
  const globalConfig = cfg.config as Record<string, unknown> | undefined;
  if (globalConfig?.serverRoute !== undefined) {
    const serverRoute = globalConfig.serverRoute;
    if (typeof serverRoute !== "string") {
      throw new AppError(ErrorCode.INVALID_CONFIG, "Config.config.serverRoute must be a string");
    }
    if (!serverRoute.startsWith("/")) {
      throw new AppError(
        ErrorCode.INVALID_CONFIG,
        `Config.config.serverRoute must start with "/", got: "${serverRoute}"`
      );
    }
    if (serverRoute === "/health") {
      throw new AppError(
        ErrorCode.INVALID_CONFIG,
        'Config.config.serverRoute cannot be "/health" as it conflicts with the health check endpoint'
      );
    }
  }

  // Validate debug config if provided
  if (globalConfig?.debug !== undefined) {
    const debug = globalConfig.debug as DebugConfig;
    if (typeof debug !== "object" || debug === null) {
      throw new AppError(ErrorCode.INVALID_CONFIG, "Config.config.debug must be an object");
    }
    if (typeof debug.enabled !== "boolean") {
      throw new AppError(
        ErrorCode.INVALID_CONFIG,
        "Config.config.debug.enabled is required and must be a boolean"
      );
    }
    if (debug.level !== undefined) {
      const validLevels = ["debug", "info", "warn", "error"];
      if (!validLevels.includes(debug.level)) {
        throw new AppError(
          ErrorCode.INVALID_CONFIG,
          `Config.config.debug.level must be one of: ${validLevels.join(", ")}`
        );
      }
    }
    if (debug.batchSize !== undefined) {
      if (typeof debug.batchSize !== "number" || debug.batchSize < 1) {
        throw new AppError(
          ErrorCode.INVALID_CONFIG,
          "Config.config.debug.batchSize must be a positive number"
        );
      }
    }
    if (debug.flushIntervalMs !== undefined) {
      if (typeof debug.flushIntervalMs !== "number" || debug.flushIntervalMs < 0) {
        throw new AppError(
          ErrorCode.INVALID_CONFIG,
          "Config.config.debug.flushIntervalMs must be a non-negative number"
        );
      }
    }
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

  // Configure debug logger if enabled
  if (config.config?.debug?.enabled) {
    configureDebugLogger(config.config.debug);
  }

  // Initialize plugin manager (but defer init() call to app.start())
  const pluginManager = new PluginManager(config.plugins ?? []);
  let pluginInitialized = false;

  // Initialize middleware chain
  const middlewareChain = new MiddlewareChain();

  // Initialize event emitter
  const eventEmitter = new TypedEventEmitter<EventMap & Record<string, unknown>>();

  // Create server instance (lazy initialization)
  let serverInstance: ServerInstance | null = null;

  function getServerInstance(): ServerInstance {
    if (!serverInstance) {
      serverInstance = createServerInstance(config, pluginManager);
      // Attach middleware chain to server instance for tool execution
      serverInstance.setMiddlewareChain(middlewareChain);
      // Attach event emitter to server instance for event emission
      serverInstance.setEventEmitter(eventEmitter);
    }
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

      // Call plugin onStart hooks after server starts
      await pluginManager.start({
        port: options?.port,
        transport: options?.transport ?? "http",
      });

      // Emit app:start event after server starts
      await eventEmitter.emit("app:start", {
        port: options?.port,
        transport: options?.transport ?? "http",
      });
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
     * Register middleware
     *
     * Middleware executes in registration order before tool handlers.
     *
     * @param middleware - Middleware function to register
     */
    use: (middleware: Middleware) => {
      middlewareChain.use(middleware);
    },

    /**
     * Subscribe to event
     */
    on: (event, handler) => {
      return eventEmitter.on(event, handler);
    },

    /**
     * Subscribe to event once
     */
    once: (event, handler) => {
      return eventEmitter.once(event, handler);
    },

    /**
     * Subscribe to all events
     */
    onAny: (handler) => {
      return eventEmitter.onAny(handler);
    },
  };

  // Emit app:init event after app is created
  // Note: This happens synchronously during createApp
  void eventEmitter.emit("app:init", { config });

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
