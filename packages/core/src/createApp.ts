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
import { configureDebugLogger, debugLogger } from "./debug/logger";
import { OAuthConfigSchema } from "./server/oauth/types.js";
import { getJwksUri } from "./server/oauth/discovery.js";
import { createJwksClient } from "./server/oauth/jwks-client.js";
import type { JwksClient } from "jwks-rsa";

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
    if (debug.logTool !== undefined && typeof debug.logTool !== "boolean") {
      throw new AppError(
        ErrorCode.INVALID_CONFIG,
        "Config.config.debug.logTool must be a boolean if provided"
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

  // Validate OAuth config if provided
  if (globalConfig?.oauth !== undefined) {
    try {
      OAuthConfigSchema.parse(globalConfig.oauth);
    } catch (error) {
      if (error instanceof Error) {
        throw new AppError(
          ErrorCode.INVALID_CONFIG,
          `Invalid OAuth configuration: ${error.message}`
        );
      }
      throw new AppError(ErrorCode.INVALID_CONFIG, "Invalid OAuth configuration");
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

  // Configure debug logger if debug config is provided
  if (config.config?.debug) {
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

  // OAuth JWKS client (initialized lazily on first use)
  let jwksClient: JwksClient | null = null;
  let oauthInitPromise: Promise<void> | null = null;

  /**
   * Ensure OAuth is initialized (idempotent, runs only once)
   * Called from both app.start() and app.handleRequest() for serverless support
   */
  async function ensureOAuthInitialized(): Promise<void> {
    // Skip if OAuth not configured or already initialized
    if (!config.config?.oauth || jwksClient !== null) {
      return;
    }

    // If initialization is in progress, wait for it
    if (oauthInitPromise) {
      await oauthInitPromise;
      return;
    }

    // Start initialization (only runs once)
    oauthInitPromise = (async () => {
      const oauthConfig = config.config?.oauth;
      if (!oauthConfig) {
        throw new AppError(ErrorCode.INVALID_CONFIG, "OAuth configuration is missing");
      }

      // Skip JWKS discovery if custom token verifier is provided
      if (!oauthConfig.tokenVerifier) {
        try {
          // Discover or use explicit JWKS URI
          const jwksUri = await getJwksUri(oauthConfig.authorizationServer, oauthConfig.jwksUri);

          // Initialize JWKS client with discovered/explicit URI
          jwksClient = createJwksClient({
            jwksUri,
            cacheMaxAge: 600000, // 10 minutes
            jwksRequestsPerMinute: 10,
            timeout: 5000,
          });

          debugLogger.info(`OAuth enabled - JWKS URI: ${jwksUri}`);
        } catch (error) {
          // Fail initialization if JWKS discovery fails
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error during JWKS discovery";
          throw new AppError(
            ErrorCode.INVALID_CONFIG,
            `OAuth initialization failed: ${errorMessage}. Please verify your authorization server URL and network connectivity.`
          );
        }
      } else {
        debugLogger.info("OAuth enabled - Using custom token verifier");
      }
    })();

    await oauthInitPromise;
  }

  function getServerInstance(): ServerInstance {
    if (!serverInstance) {
      serverInstance = createServerInstance(config, pluginManager, jwksClient);
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
     * Get the underlying Express app for serverless deployments (e.g., Vercel).
     */
    get expressApp() {
      const server = getServerInstance();
      return server.expressApp;
    },

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

      // Initialize OAuth if configured (idempotent)
      await ensureOAuthInitialized();

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
      // Initialize OAuth lazily for serverless (idempotent)
      await ensureOAuthInitialized();

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
