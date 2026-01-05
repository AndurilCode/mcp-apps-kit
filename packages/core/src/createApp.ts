/**
 * createApp implementation for @mcp-apps-kit/core
 *
 * Creates an MCP app with unified tool and UI definitions.
 */

import type { ToolDefs, App, StartOptions, McpServer, ExpressMiddleware } from "./types/tools";
import type {
  AppConfig,
  AppConfigInput,
  VersionsConfig,
  VersionConfig,
  GlobalConfig,
  VersionSpecificConfig,
} from "./types/config";
import type { UIDef, UIDefs } from "./types/ui";
import type { Middleware } from "./middleware/types";
import type { EventMap, EventHandler } from "./events/types";
import { AppError, ErrorCode, wrapError } from "./utils/errors";
import { createServerInstance, type ServerInstance } from "./server/index";
import { PluginManager } from "./plugins/PluginManager";
import { MiddlewareChain } from "./middleware/MiddlewareChain";
import { TypedEventEmitter } from "./events/EventEmitter";
import { configureDebugLogger, debugLogger } from "./debug/logger";
import { OAuthConfigSchema } from "./server/oauth/types.js";
import { getJwksUri } from "./server/oauth/discovery.js";
import { createJwksClient } from "./server/oauth/jwks-client.js";
import type { JwksClient } from "jwks-rsa";
import express, { type Request as ExpressRequest, type Response as ExpressResponse } from "express";
import http, { type Server } from "http";
import type { Plugin } from "./plugins/types";

/**
 * Check if a value is a UIDef object (has required 'html' property)
 */
function isUIDef(value: unknown): value is UIDef {
  return typeof value === "object" && value !== null && "html" in value;
}

/**
 * Extract colocated UIs from tool definitions.
 *
 * For tools with inline UIDef objects, generates a unique key based on the tool name
 * and collects them into a UI definitions map. Also normalizes the tool's `ui` field
 * to be a string key for internal server processing.
 *
 * @returns Extracted UIDefs and normalized tools with string UI references
 */
function extractColocatedUIs<T extends ToolDefs>(tools: T): { uiDefs: UIDefs; normalizedTools: T } {
  const uiDefs: UIDefs = {};
  const normalizedTools = { ...tools } as Record<string, unknown>;

  for (const [toolName, toolDef] of Object.entries(tools)) {
    if (toolDef.ui && isUIDef(toolDef.ui)) {
      // Generate a unique key for this colocated UI based on tool name
      const uiKey = `__ui_${toolName}`;

      // Collect UI definition
      uiDefs[uiKey] = toolDef.ui;

      // Normalize the tool to use the string key internally
      normalizedTools[toolName] = {
        ...toolDef,
        ui: uiKey,
      };
    }
  }

  return { uiDefs, normalizedTools: normalizedTools as T };
}

/**
 * Check if config is a multi-version config
 */
function isVersionsConfig<T extends ToolDefs>(
  config: AppConfigInput<T>
): config is VersionsConfig<T> {
  return "versions" in config && typeof config.versions === "object";
}

/**
 * Validate version key format (must match /^v\d+$/)
 */
function validateVersionKey(versionKey: string): void {
  if (!/^v\d+$/.test(versionKey)) {
    throw new AppError(
      ErrorCode.INVALID_CONFIG,
      `Version key must match pattern /^v\\d+$/, got: "${versionKey}"`
    );
  }
}

/**
 * Validate a single version config
 */
function validateVersionConfig<T extends ToolDefs>(
  versionKey: string,
  versionConfig: VersionConfig<T>
): void {
  if (typeof versionConfig.version !== "string" || versionConfig.version.length === 0) {
    throw new AppError(
      ErrorCode.INVALID_CONFIG,
      `Version "${versionKey}".version is required and must be a non-empty string`
    );
  }

  if (typeof versionConfig.tools !== "object" || versionConfig.tools === null) {
    throw new AppError(
      ErrorCode.INVALID_CONFIG,
      `Version "${versionKey}".tools is required and must be an object`
    );
  }

  // Validate version-specific config if provided
  if (versionConfig.config) {
    validateGlobalConfig(versionConfig.config, `Version "${versionKey}".config`);
  }

  // Validate version-specific plugins if provided
  if (versionConfig.plugins !== undefined) {
    if (!Array.isArray(versionConfig.plugins)) {
      throw new AppError(
        ErrorCode.INVALID_CONFIG,
        `Version "${versionKey}".plugins must be an array if provided`
      );
    }
  }
}

/**
 * Validate global config
 * Accepts GlobalConfig, Partial<GlobalConfig>, or VersionSpecificConfig (which allows null values)
 */
function validateGlobalConfig(
  config: GlobalConfig | Partial<GlobalConfig> | VersionSpecificConfig,
  prefix = "Config"
): void {
  // Validate serverRoute if provided
  if (config.serverRoute !== undefined) {
    const serverRoute = config.serverRoute;
    if (typeof serverRoute !== "string") {
      throw new AppError(ErrorCode.INVALID_CONFIG, `${prefix}.serverRoute must be a string`);
    }
    if (!serverRoute.startsWith("/")) {
      throw new AppError(
        ErrorCode.INVALID_CONFIG,
        `${prefix}.serverRoute must start with "/", got: "${serverRoute}"`
      );
    }
    if (serverRoute === "/health") {
      throw new AppError(
        ErrorCode.INVALID_CONFIG,
        `${prefix}.serverRoute cannot be "/health" as it conflicts with the health check endpoint`
      );
    }
  }

  // Validate debug config if provided (null is valid - means disable)
  if (config.debug !== undefined && config.debug !== null) {
    const debug = config.debug;
    if (typeof debug !== "object") {
      throw new AppError(ErrorCode.INVALID_CONFIG, `${prefix}.debug must be an object or null`);
    }
    // Note: Nested null values (e.g., logTool: null) are valid for deep merge
    // and will be handled by deepMerge to remove the property
    if (
      debug.logTool !== undefined &&
      debug.logTool !== null &&
      typeof debug.logTool !== "boolean"
    ) {
      throw new AppError(
        ErrorCode.INVALID_CONFIG,
        `${prefix}.debug.logTool must be a boolean if provided`
      );
    }
    if (debug.level !== undefined && debug.level !== null) {
      const validLevels = ["debug", "info", "warn", "error"];
      if (!validLevels.includes(debug.level)) {
        throw new AppError(
          ErrorCode.INVALID_CONFIG,
          `${prefix}.debug.level must be one of: ${validLevels.join(", ")}`
        );
      }
    }
    if (debug.batchSize !== undefined && debug.batchSize !== null) {
      if (typeof debug.batchSize !== "number" || debug.batchSize < 1) {
        throw new AppError(
          ErrorCode.INVALID_CONFIG,
          `${prefix}.debug.batchSize must be a positive number`
        );
      }
    }
    if (debug.flushIntervalMs !== undefined && debug.flushIntervalMs !== null) {
      if (typeof debug.flushIntervalMs !== "number" || debug.flushIntervalMs < 0) {
        throw new AppError(
          ErrorCode.INVALID_CONFIG,
          `${prefix}.debug.flushIntervalMs must be a non-negative number`
        );
      }
    }
  }

  // Validate OAuth config if provided (null is valid - means disable)
  if (config.oauth !== undefined && config.oauth !== null) {
    try {
      OAuthConfigSchema.parse(config.oauth);
    } catch (error) {
      if (error instanceof Error) {
        throw new AppError(
          ErrorCode.INVALID_CONFIG,
          `${prefix}.oauth: Invalid OAuth configuration: ${error.message}`
        );
      }
      throw new AppError(ErrorCode.INVALID_CONFIG, `${prefix}.oauth: Invalid OAuth configuration`);
    }
  }

  // Validate OpenAI config if provided (null is valid - means disable)
  if (config.openai !== undefined && config.openai !== null) {
    const openaiConfig = config.openai as Record<string, unknown>;
    if (typeof openaiConfig !== "object") {
      throw new AppError(ErrorCode.INVALID_CONFIG, `${prefix}.openai must be an object or null`);
    }
    if (openaiConfig.domain_challenge !== undefined) {
      const token = openaiConfig.domain_challenge;
      if (typeof token !== "string") {
        throw new AppError(
          ErrorCode.INVALID_CONFIG,
          `${prefix}.openai.domain_challenge must be a string`
        );
      }
      if (token.length === 0) {
        throw new AppError(
          ErrorCode.INVALID_CONFIG,
          `${prefix}.openai.domain_challenge cannot be an empty string`
        );
      }
      if (token.length > 1000) {
        throw new AppError(
          ErrorCode.INVALID_CONFIG,
          `${prefix}.openai.domain_challenge cannot exceed 1000 characters`
        );
      }
    }
  }
}

/**
 * Validate app configuration (supports both single and multi-version)
 */
function validateConfig<T extends ToolDefs>(config: unknown): asserts config is AppConfigInput<T> {
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

  // Check if this is a multi-version config
  if (isVersionsConfig(cfg as unknown as AppConfigInput<T>)) {
    const versionsConfig = cfg as unknown as VersionsConfig<T>;

    // Validate versions object
    if (typeof versionsConfig.versions !== "object" || versionsConfig.versions === null) {
      throw new AppError(
        ErrorCode.INVALID_CONFIG,
        "Config.versions is required and must be an object"
      );
    }

    // Validate each version
    const versionKeys = Object.keys(versionsConfig.versions);
    if (versionKeys.length === 0) {
      throw new AppError(
        ErrorCode.INVALID_CONFIG,
        "Config.versions must have at least one version"
      );
    }

    for (const versionKey of versionKeys) {
      validateVersionKey(versionKey);
      const versionConfig = versionsConfig.versions[versionKey];
      if (!versionConfig) {
        throw new AppError(ErrorCode.INVALID_CONFIG, `Version "${versionKey}" config is missing`);
      }
      validateVersionConfig(versionKey, versionConfig);
    }

    // Validate global config if provided
    if (versionsConfig.config) {
      validateGlobalConfig(versionsConfig.config);
    }

    // Validate global plugins if provided
    if (versionsConfig.plugins !== undefined) {
      if (!Array.isArray(versionsConfig.plugins)) {
        throw new AppError(ErrorCode.INVALID_CONFIG, "Config.plugins must be an array if provided");
      }
    }
  } else {
    // Single-version config (backward compatible)
    if (typeof cfg.version !== "string" || cfg.version.length === 0) {
      throw new AppError(
        ErrorCode.INVALID_CONFIG,
        "Config.version is required and must be a non-empty string"
      );
    }

    if (typeof cfg.tools !== "object" || cfg.tools === null) {
      throw new AppError(
        ErrorCode.INVALID_CONFIG,
        "Config.tools is required and must be an object"
      );
    }

    // Validate global config if provided
    const globalConfig = cfg.config as GlobalConfig | undefined;
    if (globalConfig) {
      validateGlobalConfig(globalConfig);
    }
  }
}

/**
 * Deep merge two objects. Version-specific values override global values.
 * - null explicitly removes/disables the property
 * - undefined inherits from global
 * - Objects are recursively merged
 * - Arrays and primitives are replaced
 *
 * @param global - Global config object
 * @param versionSpecific - Version-specific config (overrides global)
 * @returns Merged config or undefined if disabled
 */
function deepMerge<T extends Record<string, unknown>>(
  global: T | undefined,
  versionSpecific: Partial<T> | null | undefined
): T | undefined {
  // null explicitly disables the config
  if (versionSpecific === null) {
    return undefined;
  }

  // undefined inherits from global
  if (versionSpecific === undefined) {
    return global;
  }

  // No global config, use version-specific
  if (global === undefined) {
    return versionSpecific as T;
  }

  // Deep merge objects - build result without null properties
  const result: Record<string, unknown> = {};

  // First, copy all global properties
  for (const [key, value] of Object.entries(global)) {
    result[key] = value;
  }

  // Then, apply version-specific overrides
  for (const [key, value] of Object.entries(versionSpecific)) {
    if (value === null) {
      // null removes the property - use Reflect.deleteProperty to satisfy ESLint
      Reflect.deleteProperty(result, key);
    } else if (value === undefined) {
      // undefined keeps the global value (no change)
    } else if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key]) &&
      result[key] !== null
    ) {
      // Recursively merge nested objects
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      // Replace arrays and primitives
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Merge global config with version-specific config
 * Version-specific config takes precedence over global config.
 *
 * Nested objects (oauth, cors, openai, debug, protocol) are deep-merged:
 * - Specific properties override global properties
 * - undefined inherits from global
 * - null explicitly disables/removes the config
 * - Arrays and primitives are replaced (not merged)
 */
function mergeVersionConfig<T extends ToolDefs>(
  globalConfig: GlobalConfig | undefined,
  versionConfig: VersionConfig<T>,
  globalPlugins: Plugin[] | undefined
): AppConfig<T> & { ui?: UIDefs } {
  // Handle primitive config properties (null means remove, undefined means inherit)
  const serverRoute =
    versionConfig.config?.serverRoute === null
      ? undefined
      : (versionConfig.config?.serverRoute ?? globalConfig?.serverRoute);

  // Handle protocol (string literal, not an object - use simple override)
  const protocol =
    versionConfig.config?.protocol === null
      ? undefined
      : (versionConfig.config?.protocol ?? globalConfig?.protocol);

  // Deep merge nested config objects (null disables, undefined inherits)
  // Type assertions needed because deepMerge returns Record<string, unknown>
  const mergedConfig: GlobalConfig = {
    serverRoute,
    protocol,
    // Deep merge nested objects
    oauth: deepMerge(
      globalConfig?.oauth as Record<string, unknown> | undefined,
      versionConfig.config?.oauth as Record<string, unknown> | null | undefined
    ) as GlobalConfig["oauth"],
    cors: deepMerge(
      globalConfig?.cors as Record<string, unknown> | undefined,
      versionConfig.config?.cors as Record<string, unknown> | null | undefined
    ) as GlobalConfig["cors"],
    openai: deepMerge(
      globalConfig?.openai as Record<string, unknown> | undefined,
      versionConfig.config?.openai as Record<string, unknown> | null | undefined
    ) as GlobalConfig["openai"],
    debug: deepMerge(
      globalConfig?.debug as Record<string, unknown> | undefined,
      versionConfig.config?.debug as Record<string, unknown> | null | undefined
    ) as GlobalConfig["debug"],
  };

  // Merge plugins arrays (global + version-specific)
  const mergedPlugins = [...(globalPlugins ?? []), ...(versionConfig.plugins ?? [])];

  return {
    name: "", // Will be set from global config
    version: versionConfig.version,
    tools: versionConfig.tools,
    ui: versionConfig.ui,
    config: mergedConfig,
    plugins: mergedPlugins.length > 0 ? mergedPlugins : undefined,
  };
}

/**
 * Create an MCP app with unified tool and UI definitions
 *
 * Supports both single-version (backward compatible) and multi-version configurations.
 *
 * @param config - App configuration with tools and UI resources
 * @returns App instance for starting server or getting middleware
 *
 * @example Single-version (backward compatible)
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
 *
 * @example Multi-version
 * ```typescript
 * const app = createApp({
 *   name: "my-app",
 *   config: {
 *     oauth: { authorizationServer: "https://auth.example.com" },
 *     cors: { origin: true }
 *   },
 *   versions: {
 *     v1: {
 *       version: "1.0.0",
 *       tools: { greet: {...} }
 *     },
 *     v2: {
 *       version: "2.0.0",
 *       tools: { greet: {...}, search: {...} }
 *     }
 *   }
 * });
 * ```
 */
export function createApp<T extends ToolDefs>(config: AppConfigInput<T>): App<T> {
  // Validate config at runtime
  validateConfig<T>(config);

  // Check if this is a multi-version config
  if (isVersionsConfig(config)) {
    return createMultiVersionApp(config);
  } else {
    return createSingleVersionApp(config);
  }
}

/**
 * Create a single-version app (backward compatible)
 */
function createSingleVersionApp<T extends ToolDefs>(config: AppConfig<T>): App<T> {
  // Extract colocated UIs from tool definitions for internal server processing
  const { uiDefs, normalizedTools } = extractColocatedUIs(config.tools);

  // Create normalized config with extracted UIs for server
  const normalizedConfig: AppConfig<T> & { ui?: UIDefs } = {
    ...config,
    tools: normalizedTools,
    ui: Object.keys(uiDefs).length > 0 ? uiDefs : undefined,
  };

  // Configure debug logger if debug config is provided
  if (normalizedConfig.config?.debug) {
    configureDebugLogger(normalizedConfig.config.debug);
  }

  // Initialize plugin manager (but defer init() call to app.start())
  const pluginManager = new PluginManager(normalizedConfig.plugins ?? []);
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
    if (!normalizedConfig.config?.oauth || jwksClient !== null) {
      return;
    }

    // If initialization is in progress, wait for it
    if (oauthInitPromise) {
      await oauthInitPromise;
      return;
    }

    // Start initialization (only runs once)
    oauthInitPromise = (async () => {
      try {
        const oauthConfig = normalizedConfig.config?.oauth;
        if (!oauthConfig) {
          throw new AppError(ErrorCode.INVALID_CONFIG, "OAuth configuration is missing");
        }

        // Initialize JWKS client (even with custom verifier, for hybrid scenarios)
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

          if (oauthConfig.tokenVerifier) {
            debugLogger.info(
              `OAuth enabled - Using custom token verifier with JWKS URI: ${jwksUri}`
            );
          } else {
            debugLogger.info(`OAuth enabled - JWKS URI: ${jwksUri}`);
          }
        } catch (error) {
          // Fail initialization if JWKS discovery fails
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error during JWKS discovery";
          throw new AppError(
            ErrorCode.INVALID_CONFIG,
            `OAuth initialization failed: ${errorMessage}. Please verify your authorization server URL and network connectivity.`
          );
        }
      } catch (error) {
        // Reset promise on failure to allow retry
        oauthInitPromise = null;
        throw error;
      }
    })();

    await oauthInitPromise;
  }

  function getServerInstance(): ServerInstance {
    if (!serverInstance) {
      // Pass a getter function for JWKS client to support lazy initialization
      serverInstance = createServerInstance(normalizedConfig, pluginManager, () => jwksClient);
      // Attach middleware chain to server instance for tool execution
      serverInstance.setMiddlewareChain(middlewareChain);
      // Attach event emitter to server instance for event emission
      serverInstance.setEventEmitter(eventEmitter);
    }
    return serverInstance;
  }

  // Create the app instance
  const app: App<T> = {
    // Typed tool definitions (original, not normalized - preserves inline UIDefs for type inference)
    tools: config.tools,

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
          config: normalizedConfig,
          tools: normalizedConfig.tools,
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
    handleRequest: async (req: globalThis.Request, env?: unknown): Promise<globalThis.Response> => {
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

    /**
     * Get a version-specific app instance (not available for single-version apps)
     */
    getVersion: (_versionKey: string): App<T> | undefined => {
      return undefined;
    },

    /**
     * Get list of available version keys (empty for single-version apps)
     */
    getVersions: (): string[] => {
      return [];
    },
  };

  // Emit app:init event after app is created
  // Note: This happens synchronously during createApp
  void eventEmitter.emit("app:init", { config: normalizedConfig });

  return app;
}

/**
 * Create a multi-version app
 */
function createMultiVersionApp<T extends ToolDefs>(config: VersionsConfig<T>): App<T> {
  // Shared Express app for all versions
  const sharedExpressApp = express();
  sharedExpressApp.use(express.json());

  // Map of version keys to their app instances
  const versionApps = new Map<string, App<T>>();

  // Map of version keys to their server instances
  const versionServerInstances = new Map<string, ServerInstance>();

  // Shared HTTP server for multi-version apps (stored here for getServer() access)
  let sharedHttpServer: Server | undefined;

  // Shared OAuth JWKS clients (keyed by OAuth config hash for reuse)
  const jwksClients = new Map<string, JwksClient>();
  const oauthInitPromises = new Map<string, Promise<void>>();

  // Configure debug logger if global debug config is provided
  if (config.config?.debug) {
    configureDebugLogger(config.config.debug);
  }

  // Create app instance for each version
  for (const [versionKey, versionConfig] of Object.entries(config.versions)) {
    // Merge global and version-specific configs
    const mergedConfig = mergeVersionConfig(config.config, versionConfig, config.plugins);
    mergedConfig.name = config.name; // Set app name from global config

    // Extract colocated UIs from tool definitions
    const { uiDefs, normalizedTools } = extractColocatedUIs(versionConfig.tools);

    // Create normalized config with extracted UIs
    const normalizedVersionConfig: AppConfig<T> & { ui?: UIDefs } = {
      ...mergedConfig,
      tools: normalizedTools,
      ui: Object.keys(uiDefs).length > 0 ? uiDefs : undefined,
    };

    // Note: Debug logger is configured once with global config (line 681-683).
    // We don't reconfigure it per-version because it's a global singleton.
    // If version-specific debug configs are needed, they would require per-version
    // logger instances, which is a larger architectural change.

    // Initialize version-specific plugin manager
    const versionPluginManager = new PluginManager(normalizedVersionConfig.plugins ?? []);
    let versionPluginInitialized = false;

    // Initialize version-specific middleware chain
    const versionMiddlewareChain = new MiddlewareChain();

    // Initialize version-specific event emitter
    const versionEventEmitter = new TypedEventEmitter<EventMap & Record<string, unknown>>();

    // Create version-specific OAuth JWKS client key (for reuse if config is identical)
    const oauthConfigKey = normalizedVersionConfig.config?.oauth
      ? JSON.stringify(normalizedVersionConfig.config.oauth)
      : "no-oauth";

    // Get or create OAuth JWKS client
    let versionJwksClient: JwksClient | null = null;
    let versionOauthInitPromise: Promise<void> | null = null;

    /**
     * Ensure OAuth is initialized for this version (idempotent)
     */
    async function ensureVersionOAuthInitialized(): Promise<void> {
      if (!normalizedVersionConfig.config?.oauth) {
        return;
      }

      // Reuse existing JWKS client if config is identical
      const existingClient = jwksClients.get(oauthConfigKey);
      if (existingClient) {
        versionJwksClient = existingClient;
        return;
      }

      // If initialization is in progress for this config, wait for it
      const existingPromise = oauthInitPromises.get(oauthConfigKey);
      if (existingPromise) {
        await existingPromise;
        const clientAfterInit = jwksClients.get(oauthConfigKey);
        if (clientAfterInit) {
          versionJwksClient = clientAfterInit;
        }
        return;
      }

      // Start initialization
      versionOauthInitPromise = (async () => {
        try {
          const oauthConfig = normalizedVersionConfig.config?.oauth;
          if (!oauthConfig) {
            throw new AppError(ErrorCode.INVALID_CONFIG, "OAuth configuration is missing");
          }

          try {
            const jwksUri = await getJwksUri(oauthConfig.authorizationServer, oauthConfig.jwksUri);
            versionJwksClient = createJwksClient({
              jwksUri,
              cacheMaxAge: 600000,
              jwksRequestsPerMinute: 10,
              timeout: 5000,
            });
            jwksClients.set(oauthConfigKey, versionJwksClient);

            if (oauthConfig.tokenVerifier) {
              debugLogger.info(
                `OAuth enabled for ${versionKey} - Using custom token verifier with JWKS URI: ${jwksUri}`
              );
            } else {
              debugLogger.info(`OAuth enabled for ${versionKey} - JWKS URI: ${jwksUri}`);
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error during JWKS discovery";
            throw new AppError(
              ErrorCode.INVALID_CONFIG,
              `OAuth initialization failed for ${versionKey}: ${errorMessage}. Please verify your authorization server URL and network connectivity.`
            );
          }
        } catch (error) {
          oauthInitPromises.delete(oauthConfigKey);
          throw error;
        }
      })();

      oauthInitPromises.set(oauthConfigKey, versionOauthInitPromise);
      await versionOauthInitPromise;
    }

    // Create server instance for this version
    // Pass a getter function for JWKS client to support lazy initialization
    const versionRoute = `/${versionKey}/mcp`;
    const versionServerInstance = createServerInstance(
      normalizedVersionConfig,
      versionPluginManager,
      () => versionJwksClient,
      versionRoute
    );
    versionServerInstances.set(versionKey, versionServerInstance);

    // Attach middleware chain and event emitter to server instance
    versionServerInstance.setMiddlewareChain(versionMiddlewareChain);
    versionServerInstance.setEventEmitter(versionEventEmitter);

    // Mount version's Express app on shared Express app
    // Each version server has its own Express app with its routes registered at serverRoute
    // We mount the entire Express app, so routes registered on it will be accessible
    // Note: Express strips the mount path, so routes registered at serverRoute on the version app
    // will be accessible at versionRoute + serverRoute on the shared app
    // Since serverRoute is the same as versionRoute for multi-version, this works correctly
    sharedExpressApp.use(versionServerInstance.expressApp);

    // Create version-specific app instance
    const versionApp: App<T> = {
      tools: versionConfig.tools,

      get expressApp() {
        return sharedExpressApp;
      },

      start: async (options?: StartOptions): Promise<void> => {
        // Initialize plugins if not already done
        if (!versionPluginInitialized) {
          await versionPluginManager.init({
            config: normalizedVersionConfig,
            tools: normalizedVersionConfig.tools,
          });
          versionPluginInitialized = true;
        }

        // Initialize OAuth if configured
        await ensureVersionOAuthInitialized();

        // For multi-version apps, version servers don't start their own HTTP servers
        // They're mounted on the shared Express app which is started at the top level
        // Just call plugin onStart hooks
        await versionPluginManager.start({
          port: options?.port,
          transport: options?.transport ?? "http",
        });

        // Emit version-specific app:start event
        await versionEventEmitter.emit("app:start", {
          port: options?.port,
          transport: options?.transport ?? "http",
        });
      },

      getServer: (): McpServer => {
        return versionServerInstance.mcpServer as unknown as McpServer;
      },

      handler: (): ExpressMiddleware => {
        return versionServerInstance.handler();
      },

      handleRequest: async (
        req: globalThis.Request,
        env?: unknown
      ): Promise<globalThis.Response> => {
        await ensureVersionOAuthInitialized();
        return versionServerInstance.handleRequest(req, env);
      },

      use: (middleware: Middleware) => {
        versionMiddlewareChain.use(middleware);
      },

      on: (event, handler) => {
        return versionEventEmitter.on(event, handler);
      },

      once: (event, handler) => {
        return versionEventEmitter.once(event, handler);
      },

      onAny: (handler) => {
        return versionEventEmitter.onAny(handler);
      },

      getVersion: (key: string): App<T> | undefined => {
        return versionApps.get(key);
      },

      getVersions: (): string[] => {
        return Array.from(versionApps.keys());
      },
    };

    versionApps.set(versionKey, versionApp);

    // Emit version-specific app:init event
    void versionEventEmitter.emit("app:init", { config: normalizedVersionConfig });
  }

  // Add health check endpoint to shared Express app
  sharedExpressApp.get("/health", (_req: ExpressRequest, res: ExpressResponse) => {
    res.json({ status: "ok", name: config.name, versions: Array.from(versionApps.keys()) });
  });

  // Add OpenAI domain verification challenge endpoint if configured
  if (config.config?.openai?.domain_challenge) {
    const challengeToken = config.config.openai.domain_challenge;
    sharedExpressApp.get(
      "/.well-known/openai-apps-challenge",
      (_req: ExpressRequest, res: ExpressResponse) => {
        res.type("text/plain").send(challengeToken);
      }
    );
  }

  // Add catch-all 404 handler for unmatched routes
  sharedExpressApp.use((_req: ExpressRequest, res: ExpressResponse) => {
    res.status(404).json({ error: "Not found" });
  });

  // Create main app instance that delegates to version apps
  const mainApp: App<T> = {
    // Use tools from first version (for type inference).
    // To access a specific version's tools, use getVersion(key).tools
    tools: (Object.values(config.versions)[0] as VersionConfig<T> | undefined)?.tools as T,

    get expressApp() {
      return sharedExpressApp;
    },

    start: async (options?: StartOptions): Promise<void> => {
      // Initialize all version plugins and OAuth
      for (const [_versionKey, versionApp] of versionApps) {
        await versionApp.start(options);
      }

      // Start the shared HTTP server
      const port = options?.port ?? 3000;

      return new Promise<void>((resolve, reject) => {
        try {
          sharedHttpServer = http.createServer(sharedExpressApp);
          sharedHttpServer.listen(port, () => {
            // Attach HTTP server to all version ServerInstances for getServer().httpServer access
            for (const serverInstance of versionServerInstances.values()) {
              serverInstance.httpServer = sharedHttpServer;
            }
            resolve();
          });
          sharedHttpServer.on("error", reject);
        } catch (error) {
          reject(wrapError(error));
        }
      });
    },

    getServer: (): McpServer => {
      // Return first version's ServerInstance (cast to McpServer for type compatibility)
      // The ServerInstance has both mcpServer and httpServer properties
      // httpServer is attached when start() is called
      const firstVersion = Array.from(versionServerInstances.values())[0];
      if (!firstVersion) {
        throw new Error("No server instance available");
      }
      // Return the ServerInstance itself so httpServer is accessible
      // Type assertion maintains backward compatibility with McpServer type
      return firstVersion as unknown as McpServer;
    },

    handler: (): ExpressMiddleware => {
      return (req: unknown, res: unknown, next: () => void) => {
        sharedExpressApp(req as ExpressRequest, res as ExpressResponse, next);
      };
    },

    handleRequest: async (req: globalThis.Request, env?: unknown): Promise<globalThis.Response> => {
      // Route to appropriate version based on request path
      const url = new URL(req.url);

      // Health check endpoint (shared across all versions)
      if (url.pathname === "/health") {
        return new globalThis.Response(
          JSON.stringify({
            status: "ok",
            name: config.name,
            versions: Array.from(versionApps.keys()),
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      // OpenAI domain verification challenge endpoint (shared across all versions)
      if (
        url.pathname === "/.well-known/openai-apps-challenge" &&
        config.config?.openai?.domain_challenge
      ) {
        return new globalThis.Response(config.config.openai.domain_challenge, {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      }

      // Route to version-specific MCP endpoints
      const pathParts = url.pathname.split("/").filter(Boolean);

      if (pathParts.length >= 2 && pathParts[0]?.match(/^v\d+$/) && pathParts[1] === "mcp") {
        const versionKey = pathParts[0];
        if (versionKey) {
          const versionApp = versionApps.get(versionKey);
          if (versionApp) {
            return versionApp.handleRequest(req, env);
          }
          // Version key matches pattern but doesn't exist
          return new globalThis.Response(
            JSON.stringify({
              error: "Version not found",
              message: `Version "${versionKey}" does not exist`,
              availableVersions: Array.from(versionApps.keys()),
            }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      }

      // Return 404 for unmatched routes (consistent with Express path)
      return new globalThis.Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    },

    use: (middleware: Middleware) => {
      // Apply shared middleware to all versions
      // Each version app has its own middleware chain, so we add the middleware to all of them
      for (const versionApp of versionApps.values()) {
        versionApp.use(middleware);
      }
    },

    on: (event, handler) => {
      // Subscribe to events on all versions
      const unsubscribers: (() => void)[] = [];
      for (const versionApp of versionApps.values()) {
        unsubscribers.push(versionApp.on(event, handler));
      }
      return () => {
        for (const unsubscribe of unsubscribers) {
          unsubscribe();
        }
      };
    },

    once: <K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>) => {
      // Shared wrapper that tracks if it has fired
      let fired = false;
      const unsubscribers: (() => void)[] = [];
      let isUnsubscribed = false;

      // Create wrapper that fires only once across all versions
      const wrapper: EventHandler<EventMap[K]> = async (payload) => {
        // Prevent execution if already unsubscribed or already fired
        if (isUnsubscribed || fired) {
          return;
        }

        // Mark as fired BEFORE unsubscribing to prevent race conditions
        fired = true;

        // Unsubscribe from all versions BEFORE calling handler to prevent memory leaks
        // This ensures cleanup happens even if handler throws or if other versions
        // fire events during handler execution
        isUnsubscribed = true;
        for (const unsubscribe of unsubscribers) {
          unsubscribe();
        }

        // Call the original handler with received payload
        await handler(payload);
      };

      // Register wrapper on each version app and collect unsubscribers
      for (const versionApp of versionApps.values()) {
        unsubscribers.push(versionApp.once(event, wrapper));
      }

      // Return single unsubscribe that clears all and prevents further wrapper calls
      return () => {
        if (isUnsubscribed) {
          return;
        }
        isUnsubscribed = true;
        for (const unsubscribe of unsubscribers) {
          unsubscribe();
        }
      };
    },

    onAny: (handler) => {
      // Subscribe to all events on all versions
      const unsubscribers: (() => void)[] = [];
      for (const versionApp of versionApps.values()) {
        unsubscribers.push(versionApp.onAny(handler));
      }
      return () => {
        for (const unsubscribe of unsubscribers) {
          unsubscribe();
        }
      };
    },

    getVersion: (versionKey: string): App<T> | undefined => {
      return versionApps.get(versionKey);
    },

    getVersions: (): string[] => {
      return Array.from(versionApps.keys());
    },
  };

  return mainApp;
}

// Re-export defineTool from types/tools for convenience
export { defineTool } from "./types/tools";

// Re-export defineUI from types/ui for convenience
export { defineUI } from "./types/ui";
