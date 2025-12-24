/**
 * Middleware System Types
 *
 * @module middleware/types
 */

import type { ToolContext } from "../types/tools";

// =============================================================================
// MIDDLEWARE CONTEXT
// =============================================================================

/**
 * Context object passed through middleware chain
 *
 * Immutable properties provide request info, mutable `state` Map allows
 * middleware to share data with downstream middleware and tool handlers.
 */
export interface MiddlewareContext {
  /**
   * Name of the tool being invoked
   *
   * Immutable - set by framework before middleware chain.
   */
  readonly toolName: string;

  /**
   * Validated tool input
   *
   * Already validated against tool's input schema.
   * Immutable - middleware should not modify.
   */
  readonly input: unknown;

  /**
   * Client-provided metadata
   *
   * Includes locale, userAgent, userLocation, subject, etc.
   * Immutable - set by client, middleware should not modify.
   */
  readonly metadata: ToolContext;

  /**
   * Request-scoped shared state
   *
   * Mutable Map for sharing data between middleware and tool handler.
   * Isolated per request - not shared across requests.
   */
  readonly state: Map<string, unknown>;
}

// =============================================================================
// MIDDLEWARE FUNCTION
// =============================================================================

/**
 * Middleware function signature
 *
 * Koa-style middleware with async/await and explicit `next()` call.
 * Middleware executes in registration order before tool handler.
 */
export type Middleware = (context: MiddlewareContext, next: () => Promise<void>) => Promise<void>;

// =============================================================================
// MIDDLEWARE ERROR TYPES
// =============================================================================

/**
 * Error thrown when middleware calls next() multiple times
 *
 * Prevents undefined behavior from multiple invocations.
 */
export class MultipleNextCallsError extends Error {
  constructor(middlewareIndex: number) {
    super(`Middleware at index ${middlewareIndex} called next() multiple times`);
    this.name = "MultipleNextCallsError";
  }
}

/**
 * Error thrown when middleware times out
 *
 * Prevents slow middleware from blocking requests indefinitely.
 */
export class MiddlewareTimeoutError extends Error {
  constructor(timeoutMs: number, middlewareIndex?: number) {
    const msg =
      middlewareIndex !== undefined
        ? `Middleware at index ${middlewareIndex} timed out after ${timeoutMs}ms`
        : `Middleware chain timed out after ${timeoutMs}ms`;
    super(msg);
    this.name = "MiddlewareTimeoutError";
  }
}

// =============================================================================
// TYPED MIDDLEWARE HELPERS
// =============================================================================

/**
 * Helper to create middleware with state type checking
 *
 * Provides better TypeScript inference for middleware that reads/writes
 * specific state keys.
 */
export function createTypedMiddleware<TState extends Record<string, unknown>>(
  middleware: (
    context: MiddlewareContext & {
      state: Map<keyof TState, TState[keyof TState]>;
    },
    next: () => Promise<void>
  ) => Promise<void>
): Middleware {
  return middleware as Middleware;
}

/**
 * Helper to compose multiple middleware into one
 *
 * Useful for grouping related middleware.
 */
export function composeMiddleware(middleware: Middleware[]): Middleware {
  return async (context, next) => {
    let index = 0;

    const dispatch = async (): Promise<void> => {
      if (index < middleware.length) {
        const fn = middleware[index++];
        await fn(context, dispatch);
      } else {
        await next();
      }
    };

    await dispatch();
  };
}

// =============================================================================
// COMMON MIDDLEWARE PATTERNS
// =============================================================================

/**
 * Create error handling middleware
 *
 * Catches errors from downstream middleware/handler and transforms them.
 */
export function createErrorHandler(
  handler: (error: Error, context: MiddlewareContext) => Promise<void> | void
): Middleware {
  return async (context, next) => {
    try {
      await next();
    } catch (error) {
      await handler(error as Error, context);
      throw error; // Re-throw unless handler wants to suppress
    }
  };
}

/**
 * Create conditional middleware
 *
 * Only executes middleware if condition is met.
 */
export function createConditionalMiddleware(
  condition: (context: MiddlewareContext) => boolean,
  middleware: Middleware
): Middleware {
  return async (context, next) => {
    if (condition(context)) {
      await middleware(context, next);
    } else {
      await next();
    }
  };
}

/**
 * Create timeout middleware
 *
 * Enforces timeout on middleware chain execution.
 */
export function createTimeoutMiddleware(timeoutMs: number): Middleware {
  return async (context, next) => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new MiddlewareTimeoutError(timeoutMs));
      }, timeoutMs);
    });

    await Promise.race([next(), timeoutPromise]);
  };
}
