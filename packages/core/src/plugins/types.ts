/**
 * Plugin System Types
 *
 * @module plugins/types
 */

import type { z } from "zod";
import type { ToolDefs, ToolContext } from "../types/tools";
import type { AppConfig } from "../types/config";

// =============================================================================
// PLUGIN CONTEXT TYPES
// =============================================================================

/**
 * Base context provided to all plugin hooks
 *
 * Contains app metadata and plugin reference.
 *
 * @internal
 */
export interface PluginContext {
  /** App metadata */
  app: {
    /** App name */
    name: string;
    /** App version */
    version: string;
  };
  /** Current environment (test, development, production) */
  environment?: string;
  /** Reference to the plugin (config and metadata) */
  plugin: {
    /** Plugin name */
    name: string;
    /** Plugin version */
    version?: string;
    /** Plugin configuration */
    config?: unknown;
  };
}

/**
 * Context provided to plugin onInit hook
 *
 * @internal
 */
export interface PluginInitContext {
  /** App configuration */
  config: AppConfig;
  /** Tool definitions */
  tools: ToolDefs;
}

/**
 * Context provided to plugin onStart hook
 *
 * @internal
 */
export interface PluginStartContext {
  /** Server port (if HTTP transport) */
  port?: number;
  /** Transport type */
  transport: "http" | "stdio";
}

/**
 * Context provided to plugin onShutdown hook
 *
 * @internal
 */
export interface PluginShutdownContext {
  /** Whether shutdown is graceful */
  graceful: boolean;
  /** Shutdown timeout in ms */
  timeoutMs: number;
}

/**
 * Context provided to plugin beforeToolCall/afterToolCall/onToolError hooks
 *
 * @internal
 */
export interface ToolCallContext {
  /** Name of the tool being called */
  toolName: string;
  /** Validated tool input */
  input: unknown;
  /** Client-provided metadata (locale, userAgent, etc.) */
  metadata: ToolContext;
}

/**
 * Context provided to plugin onRequest hook
 *
 * @internal
 */
export interface RequestContext {
  /** HTTP method */
  method: string;
  /** Request path */
  path: string;
  /** Request headers */
  headers: Record<string, string>;
  /** Client-provided metadata */
  metadata?: ToolContext;
}

/**
 * Context provided to plugin onResponse hook
 *
 * @internal
 */
export interface ResponseContext extends RequestContext {
  /** HTTP status code */
  statusCode: number;
  /** Response body (if available) */
  body?: unknown;
}

/**
 * Context provided to plugin onUILoad hook
 *
 * @internal
 */
export interface UILoadContext {
  /** UI resource key */
  uiKey: string;
  /** UI resource URI */
  uri: string;
}

// =============================================================================
// PLUGIN DEFINITION
// =============================================================================

/**
 * Plugin definition with lifecycle and execution hooks
 *
 * Plugins extend app behavior without modifying tool handlers.
 * All hooks are optional - implement only what you need.
 *
 * @template TConfig - Inferred from configSchema if provided
 *
 * @example
 * ```typescript
 * const loggingPlugin: Plugin<{ level: string }> = {
 *   name: 'logging',
 *   version: '1.0.0',
 *   configSchema: z.object({ level: z.enum(['debug', 'info', 'warn', 'error']) }),
 *   config: { level: 'info' },
 *
 *   onInit: async (context) => {
 *     console.log('Plugin initialized with tools:', Object.keys(context.tools));
 *   },
 *
 *   beforeToolCall: async (context) => {
 *     console.log(`[${new Date().toISOString()}] Tool called: ${context.toolName}`);
 *   },
 * };
 * ```
 */
export interface Plugin<TConfig = unknown> {
  /**
   * Unique plugin identifier
   *
   * Used for logging, debugging, and error messages.
   * Must be unique within an app.
   */
  name: string;

  /**
   * Plugin version (semantic versioning recommended)
   *
   * Optional but helpful for debugging.
   */
  version?: string;

  /**
   * Plugin configuration
   *
   * If configSchema is provided, this will be validated at plugin creation.
   */
  config?: TConfig;

  /**
   * Zod schema for config validation
   *
   * If provided, config will be validated and TConfig will be inferred.
   */
  configSchema?: z.ZodType<TConfig>;

  // ---------------------------------------------------------------------------
  // LIFECYCLE HOOKS
  // ---------------------------------------------------------------------------

  /**
   * Called when app is initialized (before server starts)
   *
   * If this hook throws, app initialization fails.
   */
  onInit?(context: PluginInitContext): void | Promise<void>;

  /**
   * Called when server starts successfully
   *
   * If this hook throws, error is logged but server continues.
   */
  onStart?(context: PluginStartContext): void | Promise<void>;

  /**
   * Called during graceful shutdown
   *
   * Hook is subject to shutdown timeout (default 30s).
   */
  onShutdown?(context: PluginShutdownContext): void | Promise<void>;

  // ---------------------------------------------------------------------------
  // TOOL EXECUTION HOOKS
  // ---------------------------------------------------------------------------

  /**
   * Called before tool handler executes
   *
   * Executes after middleware chain but before handler.
   * If this hook throws, error is logged but tool execution continues.
   */
  beforeToolCall?(context: ToolCallContext): void | Promise<void>;

  /**
   * Called after tool handler succeeds
   *
   * If this hook throws, error is logged but response is sent normally.
   */
  afterToolCall?(context: ToolCallContext, result: unknown): void | Promise<void>;

  /**
   * Called when tool handler throws error
   *
   * Cannot prevent error from propagating to client.
   * If this hook throws, error is logged separately.
   */
  onToolError?(context: ToolCallContext, error: Error): void | Promise<void>;

  // ---------------------------------------------------------------------------
  // HTTP HOOKS (OPTIONAL)
  // ---------------------------------------------------------------------------

  /**
   * Called when HTTP request received (before routing)
   *
   * Not available for stdio transport.
   * If this hook throws, error is logged but request continues.
   */
  onRequest?(context: RequestContext): void | Promise<void>;

  /**
   * Called before HTTP response sent
   *
   * Not available for stdio transport.
   * If this hook throws, error is logged but response is sent normally.
   */
  onResponse?(context: ResponseContext): void | Promise<void>;

  // ---------------------------------------------------------------------------
  // UI HOOKS (OPTIONAL)
  // ---------------------------------------------------------------------------

  /**
   * Called when UI resource is loaded
   *
   * If this hook throws, error is logged but UI is served normally.
   */
  onUILoad?(context: UILoadContext): void | Promise<void>;
}

// =============================================================================
// HELPER TYPES
// =============================================================================

/**
 * Helper type to infer config type from configSchema
 *
 * @internal
 */
export type InferPluginConfig<T extends z.ZodType> = z.infer<T>;

/**
 * Helper function to create a plugin with type inference
 *
 * Provides better TypeScript inference than manually typing Plugin interface.
 * Validates config against configSchema at creation time.
 *
 * @internal
 */
export function createPlugin<TConfig extends z.ZodType>(
  definition: Omit<Plugin<z.infer<TConfig>>, "configSchema"> & {
    configSchema?: TConfig;
  }
): Plugin<z.infer<TConfig>> {
  // Validate config if schema provided
  if (definition.configSchema && definition.config) {
    definition.configSchema.parse(definition.config);
  }

  return definition as Plugin<z.infer<TConfig>>;
}
