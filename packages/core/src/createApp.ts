/**
 * createApp implementation for @apps-builder/core
 *
 * Creates an MCP app with unified tool and UI definitions.
 */

import type {
  ToolDefs,
  App,
  StartOptions,
  McpServer,
  ExpressMiddleware,
} from "./types/tools";
import type { AppConfig } from "./types/config";
import { AppError, ErrorCode } from "./utils/errors";

/**
 * Validate app configuration
 */
function validateConfig<T extends ToolDefs>(config: unknown): asserts config is AppConfig<T> {
  if (typeof config !== "object" || config === null) {
    throw new AppError(ErrorCode.INVALID_CONFIG, "Config must be an object");
  }

  const cfg = config as Record<string, unknown>;

  if (typeof cfg.name !== "string" || cfg.name.length === 0) {
    throw new AppError(ErrorCode.INVALID_CONFIG, "Config.name is required and must be a non-empty string");
  }

  if (typeof cfg.version !== "string" || cfg.version.length === 0) {
    throw new AppError(ErrorCode.INVALID_CONFIG, "Config.version is required and must be a non-empty string");
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
export function createApp<T extends ToolDefs>(config: AppConfig<T>): App<T> {
  // Validate config at runtime
  validateConfig<T>(config);

  // Store the MCP server instance (created lazily)
  let mcpServer: McpServer | null = null;

  // Create the app instance
  const app: App<T> = {
    // Typed tool definitions
    tools: config.tools,

    /**
     * Start the built-in Express server
     * Full implementation in Phase 4 (User Story 2)
     */
    start: async (_options?: StartOptions): Promise<void> => {
      // Placeholder - will be implemented in Phase 4
      throw new AppError(
        ErrorCode.INTERNAL_ERROR,
        "app.start() not implemented yet - Phase 4"
      );
    },

    /**
     * Get the underlying MCP server instance
     * Full implementation in Phase 4 (User Story 2)
     */
    getServer: (): McpServer => {
      // Create MCP server on first access
      // Placeholder - will be implemented in Phase 4
      mcpServer ??= {
        _placeholder: true,
        name: config.name,
        version: config.version,
      };
      return mcpServer;
    },

    /**
     * Get Express middleware for custom server setup
     * Full implementation in Phase 4 (User Story 2)
     */
    handler: (): ExpressMiddleware => {
      // Placeholder - will be implemented in Phase 4
      return (_req: unknown, _res: unknown, next: () => void): void => {
        next();
      };
    },

    /**
     * Handle a single request (for serverless)
     * Full implementation in Phase 4 (User Story 2)
     */
    handleRequest: async (_req: Request, _env?: unknown): Promise<Response> => {
      // Placeholder - will be implemented in Phase 4
      return new Response(
        JSON.stringify({ error: "handleRequest() not implemented yet - Phase 4" }),
        { status: 501, headers: { "Content-Type": "application/json" } }
      );
    },
  };

  return app;
}

/**
 * Define a tool with type inference (optional helper)
 *
 * This is an optional helper for better IDE experience.
 * You can also define tools inline in the `tools` object.
 *
 * @param def - Tool definition
 * @returns The same tool definition (for type inference)
 *
 * @example
 * ```typescript
 * const greetTool = defineTool({
 *   description: "Greet a user",
 *   input: z.object({ name: z.string() }),
 *   output: z.object({ message: z.string() }),
 *   handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
 * });
 * ```
 */
export function defineTool<T>(def: T): T {
  return def;
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
