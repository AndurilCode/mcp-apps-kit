/**
 * Middleware Chain
 *
 * Executes middleware in registration order with proper control flow.
 *
 * @internal
 * @module middleware/MiddlewareChain
 */

import type { MiddlewareContext, MiddlewareWithResult, Middleware } from "./types";
import { MultipleNextCallsError } from "./types";

/**
 * Middleware chain executor with result passing
 *
 * Manages middleware registration and execution with:
 * - Sequential execution in registration order
 * - next() call tracking to prevent multiple calls
 * - Error propagation through chain
 * - Result passing through middleware chain
 *
 * @template TResult - Type of result returned by handler and passed through middleware (defaults to void for backward compatibility)
 *
 * @internal
 */
export class MiddlewareChain<TResult = void> {
  private middleware: MiddlewareWithResult<TResult>[] = [];

  /**
   * Register middleware function
   *
   * Middleware executes in registration order.
   * Accepts both void-based (Middleware) and result-passing (MiddlewareWithResult<TResult>) middleware.
   * Void-based middleware is automatically adapted to work with result-passing chains.
   */
  use(middleware: MiddlewareWithResult<TResult> | Middleware): void {
    // Type assertion is safe: void-based middleware ignores return value and works with any TResult
    this.middleware.push(middleware as MiddlewareWithResult<TResult>);
  }

  /**
   * Execute middleware chain with handler
   *
   * Runs all middleware in order, then executes handler as final step.
   * Returns the result from the handler, potentially transformed by middleware.
   *
   * @param context - Middleware context
   * @param handler - Final handler to execute after middleware
   * @returns Result from handler (potentially transformed by middleware)
   */
  async execute(context: MiddlewareContext, handler: () => Promise<TResult>): Promise<TResult> {
    // Create per-execution next() call tracking to prevent race conditions
    const nextCallCounts: Map<number, number> = new Map();

    let index = 0;

    const dispatch = async (fromMiddlewareIndex?: number): Promise<TResult> => {
      // Track next() calls for the middleware that called dispatch
      if (fromMiddlewareIndex !== undefined) {
        const callCount = nextCallCounts.get(fromMiddlewareIndex) ?? 0;
        if (callCount > 0) {
          throw new MultipleNextCallsError(fromMiddlewareIndex);
        }
        nextCallCounts.set(fromMiddlewareIndex, callCount + 1);
      }

      if (index < this.middleware.length) {
        const currentMiddlewareIndex = index;
        index++;

        const fn = this.middleware[currentMiddlewareIndex];
        if (!fn) {
          // Middleware slot is empty (shouldn't happen), continue to next
          return await dispatch();
        }

        // Create a next() function that tracks which middleware is calling it
        const next = () => dispatch(currentMiddlewareIndex);
        return await fn(context, next);
      }

      // All middleware complete, execute handler and return result
      return await handler();
    };

    // Start the chain (not called by any middleware) and return final result
    return await dispatch();
  }

  /**
   * Check if any middleware registered
   *
   * @returns True if middleware chain has at least one middleware
   */
  hasMiddleware(): boolean {
    return this.middleware.length > 0;
  }
}
