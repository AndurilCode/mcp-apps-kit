/**
 * Safe Middleware Helpers
 *
 * Provides patterns to prevent common middleware mistakes like forgetting `await next()`.
 *
 * @module middleware/defineMiddleware
 */

import type { Middleware, MiddlewareContext, MiddlewareWithResult } from "./types";

// =============================================================================
// BASIC PATTERN TYPES (Void-based)
// =============================================================================

/**
 * Hook that runs before the middleware chain continues
 *
 * Automatically calls next() after hook completes.
 */
export type BeforeHook = (context: MiddlewareContext) => Promise<void> | void;

/**
 * Hook that runs after the middleware chain completes
 *
 * Runs after next() returns, useful for cleanup or logging.
 */
export type AfterHook = (context: MiddlewareContext) => Promise<void> | void;

/**
 * Full middleware function with type enforcement
 *
 * Must return Promise<void>. TypeScript will help ensure next() is called
 * or an error is thrown.
 */
export type WrapMiddleware = (
  context: MiddlewareContext,
  next: () => Promise<void>
) => Promise<void>;

/**
 * Middleware definition with before/after hooks
 */
export interface MiddlewareDefinition {
  /**
   * Runs before the middleware chain continues
   *
   * Use for setup, validation, or state preparation.
   */
  before?: BeforeHook;

  /**
   * Runs after the middleware chain completes
   *
   * Use for cleanup, logging, or metrics.
   */
  after?: AfterHook;
}

// =============================================================================
// RESULT-PASSING PATTERN TYPES
// =============================================================================

/**
 * Hook that runs before the middleware chain continues (with result passing)
 */
export type BeforeHookWithResult = (context: MiddlewareContext) => Promise<void> | void;

/**
 * Hook that runs after the middleware chain completes (with result access)
 *
 * Can inspect and optionally transform the result.
 * - Return a new result to transform it
 * - Return void/undefined to keep the original result
 *
 * @template TResult - Type of result from the handler
 */
export type AfterHookWithResult<TResult> = (
  context: MiddlewareContext,
  result: TResult
) => Promise<TResult | undefined> | TResult | undefined;

/**
 * Full middleware function with result passing
 *
 * Must return Promise<TResult>. Can inspect and transform results.
 *
 * @template TResult - Type of result from the handler
 */
export type WrapMiddlewareWithResult<TResult> = (
  context: MiddlewareContext,
  next: () => Promise<TResult>
) => Promise<TResult>;

/**
 * Middleware definition with before/after hooks and result passing
 *
 * @template TResult - Type of result from the handler
 */
export interface MiddlewareDefinitionWithResult<TResult> {
  /**
   * Runs before the middleware chain continues
   *
   * Use for setup, validation, or state preparation.
   */
  before?: BeforeHookWithResult;

  /**
   * Runs after the middleware chain completes
   *
   * Receives the result and can optionally transform it.
   */
  after?: AfterHookWithResult<TResult>;
}

/**
 * Interface for defineMiddleware.withResult function with helper methods
 */
export interface DefineMiddlewareWithResult {
  <TResult = unknown>(
    definition: MiddlewareDefinitionWithResult<TResult>
  ): MiddlewareWithResult<TResult>;

  /**
   * Create middleware that only runs after the chain (with result access)
   */
  after: <TResult = unknown>(hook: AfterHookWithResult<TResult>) => MiddlewareWithResult<TResult>;

  /**
   * Create middleware with full control and result passing
   */
  wrap: <TResult = unknown>(
    wrapper: WrapMiddlewareWithResult<TResult>
  ) => MiddlewareWithResult<TResult>;
}

// =============================================================================
// BASIC PATTERN IMPLEMENTATION
// =============================================================================

/**
 * Define middleware with automatic next() handling
 *
 * Prevents the common mistake of forgetting to call `await next()`.
 *
 * @example Before/After Pattern (Recommended for simple cases)
 * ```typescript
 * const logging = defineMiddleware({
 *   before: async (context) => {
 *     console.log("Tool:", context.toolName);
 *   },
 *   after: async (context) => {
 *     console.log("Completed:", context.toolName);
 *   },
 * });
 * ```
 *
 * @example Before-Only Shorthand
 * ```typescript
 * const timing = defineMiddleware.before(async (context) => {
 *   context.state.set("startTime", Date.now());
 * });
 * ```
 *
 * @example After-Only Shorthand
 * ```typescript
 * const metrics = defineMiddleware.after(async (context) => {
 *   const duration = Date.now() - (context.state.get("startTime") as number);
 *   recordMetric(context.toolName, duration);
 * });
 * ```
 *
 * @example Full Control with Type Enforcement
 * ```typescript
 * const auth = defineMiddleware.wrap(async (context, next) => {
 *   if (!context.metadata.subject) {
 *     throw new Error("Unauthorized");
 *   }
 *   return next(); // TypeScript enforces returning Promise<void>
 * });
 * ```
 */
export function defineMiddleware(definition: MiddlewareDefinition): Middleware {
  const { before, after } = definition;

  // Note: We return the result from next() even though Middleware type says Promise<void>.
  // This allows void-based middleware to work seamlessly with MiddlewareChain<TResult>.
  // The type assertion is safe because JavaScript doesn't enforce return types at runtime.
  return (async (context, next) => {
    // Run before hook
    if (before) {
      await before(context);
    }

    // Call next and capture result (guaranteed!)
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const result = await next();

    // Run after hook
    if (after) {
      await after(context);
    }

    // Pass through result for MiddlewareChain compatibility
    return result;
  }) as Middleware;
}

/**
 * Create middleware that only runs before the chain
 *
 * Automatically calls next() after the hook.
 *
 * @example
 * ```typescript
 * const setup = defineMiddleware.before(async (context) => {
 *   context.state.set("initialized", true);
 * });
 * ```
 */
defineMiddleware.before = (hook: BeforeHook): Middleware => {
  return (async (context, next) => {
    await hook(context);
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    return await next();
  }) as Middleware;
};

/**
 * Create middleware that only runs after the chain
 *
 * Automatically calls next() before the hook.
 *
 * @example
 * ```typescript
 * const cleanup = defineMiddleware.after(async (context) => {
 *   console.log("Done processing:", context.toolName);
 * });
 * ```
 */
defineMiddleware.after = (hook: AfterHook): Middleware => {
  return (async (context, next) => {
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const result = await next();
    await hook(context);
    return result;
  }) as Middleware;
};

/**
 * Create middleware with full control and type enforcement
 *
 * The return type (Promise<void>) helps TypeScript catch cases where
 * you forget to return next() or throw an error.
 *
 * Use this pattern for:
 * - Conditional execution
 * - Short-circuiting the chain
 * - Error handling
 * - Complex control flow
 *
 * @example Authentication
 * ```typescript
 * const auth = defineMiddleware.wrap(async (context, next) => {
 *   const token = context.metadata.raw?.["authorization"];
 *   if (!token) throw new Error("Missing auth token");
 *   return next();
 * });
 * ```
 *
 * @example Conditional Execution
 * ```typescript
 * const skipForAdmin = defineMiddleware.wrap(async (context, next) => {
 *   if (context.metadata.subject === "admin") {
 *     return; // Skip the rest of the chain
 *   }
 *   return next();
 * });
 * ```
 */
defineMiddleware.wrap = (wrapper: WrapMiddleware): Middleware => {
  return wrapper;
};

// =============================================================================
// RESULT-PASSING PATTERN IMPLEMENTATION
// =============================================================================

/**
 * Define middleware with result passing support
 *
 * Allows middleware to inspect and transform results from tool handlers.
 *
 * @example Result Inspection
 * ```typescript
 * const logResult = defineMiddleware.withResult<ToolResult>({
 *   after: async (context, result) => {
 *     console.log("Result:", result.data);
 *     return result; // Keep original result
 *   },
 * });
 * ```
 *
 * @example Result Transformation
 * ```typescript
 * const addTimestamp = defineMiddleware.withResult<ToolResult>({
 *   after: async (context, result) => {
 *     return {
 *       ...result,
 *       _meta: { ...result._meta, timestamp: Date.now() },
 *     };
 *   },
 * });
 * ```
 *
 * @example Caching with Short-Circuit
 * ```typescript
 * const cache = defineMiddleware.withResult<ToolResult>({
 *   before: async (context) => {
 *     const cached = await getFromCache(context.toolName, context.input);
 *     if (cached) {
 *       context.state.set("response", cached);
 *     }
 *   },
 *   after: async (context, result) => {
 *     if (!context.state.get("response")) {
 *       await saveToCache(context.toolName, context.input, result);
 *     }
 *     return result;
 *   },
 * });
 * ```
 */
defineMiddleware.withResult = (<TResult = unknown>(
  definition: MiddlewareDefinitionWithResult<TResult>
): MiddlewareWithResult<TResult> => {
  const { before, after } = definition;

  return async (context, next) => {
    // Run before hook
    if (before) {
      await before(context);
    }

    // Call next and capture result
    let result = await next();

    // Run after hook (can transform result)
    if (after) {
      const transformed = await after(context, result);
      if (transformed !== undefined) {
        result = transformed;
      }
    }

    return result;
  };
}) as unknown as DefineMiddlewareWithResult;

/**
 * Create middleware that only runs after the chain (with result access)
 *
 * Automatically calls next() before the hook and passes the result.
 * Can transform the result by returning a new value.
 *
 * @example Log result
 * ```typescript
 * const logResult = defineMiddleware.withResult.after<ToolResult>(
 *   async (context, result) => {
 *     console.log("Result:", result.data);
 *     return result; // Keep original
 *   }
 * );
 * ```
 *
 * @example Transform result
 * ```typescript
 * const enrichResult = defineMiddleware.withResult.after<ToolResult>(
 *   async (context, result) => {
 *     return {
 *       ...result,
 *       _meta: { ...result._meta, userId: context.metadata.subject },
 *     };
 *   }
 * );
 * ```
 */
defineMiddleware.withResult.after = <TResult = unknown>(
  hook: AfterHookWithResult<TResult>
): MiddlewareWithResult<TResult> => {
  return async (context, next) => {
    const result = await next();
    const transformed = await hook(context, result);
    return transformed ?? result;
  };
};

/**
 * Create middleware with full control and result passing
 *
 * The return type (Promise<TResult>) enforces returning a result.
 *
 * Use this pattern for:
 * - Caching (short-circuit with cached result)
 * - Result validation and retry
 * - Conditional result transformation
 * - Result sanitization
 *
 * @example Caching
 * ```typescript
 * const cache = defineMiddleware.withResult.wrap<ToolResult>(
 *   async (context, next) => {
 *     const cached = await getFromCache(context.toolName);
 *     if (cached) return cached; // Short-circuit
 *
 *     const result = await next();
 *     await saveToCache(context.toolName, result);
 *     return result;
 *   }
 * );
 * ```
 *
 * @example Result Validation & Retry
 * ```typescript
 * const retryOnError = defineMiddleware.withResult.wrap<ToolResult>(
 *   async (context, next) => {
 *     for (let attempt = 0; attempt < 3; attempt++) {
 *       try {
 *         const result = await next();
 *         if (result.data) return result; // Valid
 *       } catch (error) {
 *         if (attempt === 2) throw error;
 *         await sleep(100 * attempt);
 *       }
 *     }
 *     throw new Error("Max retries exceeded");
 *   }
 * );
 * ```
 */
defineMiddleware.withResult.wrap = <TResult = unknown>(
  wrapper: WrapMiddlewareWithResult<TResult>
): MiddlewareWithResult<TResult> => {
  return wrapper;
};
