/**
 * File-based middleware and event handler helpers
 *
 * Provides type-safe helpers for defining middleware and event handlers
 * that can be auto-discovered from file directories.
 *
 * @module helpers
 */

import type { Middleware, MiddlewareContext, EventMap, EventHandler } from "@mcp-apps-kit/core";

// Re-export defineMiddleware from core for convenience
export { defineMiddleware } from "@mcp-apps-kit/core";
export type {
  MiddlewareDefinition,
  BeforeHook,
  AfterHook,
  WrapMiddleware,
} from "@mcp-apps-kit/core";

// =============================================================================
// ORDERED MIDDLEWARE (FOR FILE-BASED DISCOVERY)
// =============================================================================

/**
 * File-based middleware definition with ordering support
 *
 * Extends the standard middleware definition with an `order` property
 * that controls execution order when multiple middleware are discovered
 * from files.
 */
export interface FileBasedMiddlewareDefinition {
  /**
   * Execution order (lower runs first)
   *
   * Default: 100
   *
   * Recommended ranges:
   * - 0-25: Security/auth (run first)
   * - 26-50: Validation/parsing
   * - 51-75: Logging/metrics
   * - 76-100: Default
   * - 101+: Cleanup/finalization
   */
  order?: number;

  /**
   * Hook that runs before the middleware chain continues
   *
   * Use for setup, validation, or state preparation.
   */
  before?: (context: MiddlewareContext) => Promise<void> | void;

  /**
   * Hook that runs after the middleware chain completes
   *
   * Use for cleanup, logging, or metrics.
   */
  after?: (context: MiddlewareContext) => Promise<void> | void;
}

/**
 * Ordered middleware with explicit order property
 *
 * Used internally to sort middleware before registration.
 */
export interface OrderedMiddleware {
  /** The middleware function */
  middleware: Middleware;
  /** Execution order (lower runs first) */
  order: number;
}

/**
 * Define middleware with ordering support for file-based discovery
 *
 * This helper creates middleware that includes an `order` property
 * which determines execution order when multiple middleware files
 * are discovered.
 *
 * @param definition - Middleware definition with optional order
 * @returns Ordered middleware that can be sorted before registration
 *
 * @example Auth middleware (runs first)
 * ```typescript
 * // middleware/auth.ts
 * import { defineOrderedMiddleware } from "@mcp-apps-kit/codegen";
 *
 * export default defineOrderedMiddleware({
 *   order: 10,  // Run before other middleware
 *   before: async (context) => {
 *     if (!context.metadata.subject) {
 *       throw new Error("Authentication required");
 *     }
 *   },
 * });
 * ```
 *
 * @example Logging middleware (default order)
 * ```typescript
 * // middleware/logging.ts
 * import { defineOrderedMiddleware } from "@mcp-apps-kit/codegen";
 *
 * export default defineOrderedMiddleware({
 *   before: async (context) => {
 *     context.state.set("startTime", Date.now());
 *     console.log(`Tool called: ${context.toolName}`);
 *   },
 *   after: async (context) => {
 *     const duration = Date.now() - (context.state.get("startTime") as number);
 *     console.log(`Tool completed: ${context.toolName} (${duration}ms)`);
 *   },
 * });
 * ```
 */
export function defineOrderedMiddleware(
  definition: FileBasedMiddlewareDefinition
): OrderedMiddleware {
  const { order = 100, before, after } = definition;

  const middleware: Middleware = async (context, next) => {
    // Run before hook
    if (before) {
      await before(context);
    }

    // Call next (guaranteed!)
    await next();

    // Run after hook
    if (after) {
      await after(context);
    }
  };

  return { middleware, order };
}

// =============================================================================
// EVENT CONSTANTS
// =============================================================================

/**
 * Event name constants for type-safe event handler definitions
 *
 * Use these constants instead of string literals for better
 * discoverability and to avoid typos.
 */
export const Events = {
  /** Emitted when app initialization completes */
  APP_INIT: "app:init",
  /** Emitted when server starts successfully */
  APP_START: "app:start",
  /** Emitted when app shutdown begins */
  APP_SHUTDOWN: "app:shutdown",
  /** Emitted when tool is invoked */
  TOOL_CALLED: "tool:called",
  /** Emitted when tool completes successfully */
  TOOL_SUCCESS: "tool:success",
  /** Emitted when tool execution fails */
  TOOL_ERROR: "tool:error",
  /** Emitted when plugin/middleware/event handler errors occur */
  ERROR: "error",
} as const satisfies Record<string, keyof EventMap>;

// =============================================================================
// EVENT HANDLER DEFINITION (FOR FILE-BASED DISCOVERY)
// =============================================================================

/**
 * Event handler definition for file-based discovery
 *
 * Binds a handler to a specific event type with full type safety.
 *
 * @template K - Event name (from EventMap)
 */
export interface HandlerDefinition<K extends keyof EventMap> {
  /** Event name to listen for */
  event: K;
  /** Handler function (receives typed payload) */
  handler: EventHandler<EventMap[K]>;
}

/**
 * Define a type-safe event handler for file-based discovery
 *
 * This helper creates an event handler definition that can be
 * auto-discovered from the handlers/ directory and registered
 * with the app's event emitter.
 *
 * @param definition - Handler definition with event and handler
 * @returns The same definition (for type inference)
 *
 * @example App start handler
 * ```typescript
 * // handlers/app-start.ts
 * import { defineHandler, Events } from "@mcp-apps-kit/codegen";
 *
 * export default defineHandler({
 *   event: Events.APP_START,
 *   handler: async (payload) => {
 *     console.log(`App started on port ${payload.port}`);
 *   },
 * });
 * ```
 *
 * @example Tool metrics handler
 * ```typescript
 * // handlers/tool-metrics.ts
 * import { defineHandler, Events } from "@mcp-apps-kit/codegen";
 *
 * export default defineHandler({
 *   event: Events.TOOL_SUCCESS,
 *   handler: async (payload) => {
 *     recordMetric(payload.toolName, payload.duration);
 *   },
 * });
 * ```
 *
 * @example Error handler
 * ```typescript
 * // handlers/error-logging.ts
 * import { defineHandler, Events } from "@mcp-apps-kit/codegen";
 *
 * export default defineHandler({
 *   event: Events.TOOL_ERROR,
 *   handler: async (payload) => {
 *     console.error(`Tool ${payload.toolName} failed:`, payload.error);
 *   },
 * });
 * ```
 */
export function defineHandler<K extends keyof EventMap>(
  definition: HandlerDefinition<K>
): HandlerDefinition<K> {
  return definition;
}
