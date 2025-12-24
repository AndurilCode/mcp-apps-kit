/**
 * Middleware Chain
 *
 * Executes middleware in registration order with proper control flow.
 *
 * @module middleware/MiddlewareChain
 */

import type { Middleware, MiddlewareContext } from "./types";
import { MultipleNextCallsError } from "./types";

/**
 * Middleware chain executor
 *
 * Manages middleware registration and execution with:
 * - Sequential execution in registration order
 * - next() call tracking to prevent multiple calls
 * - Error propagation through chain
 */
export class MiddlewareChain {
  private middleware: Middleware[] = [];
  private nextCallCounts: Map<number, number> = new Map();

  /**
   * Register middleware function
   *
   * Middleware executes in registration order.
   */
  use(middleware: Middleware): void {
    this.middleware.push(middleware);
  }

  /**
   * Execute middleware chain with handler
   *
   * Runs all middleware in order, then executes handler as final step.
   *
   * @param context - Middleware context
   * @param handler - Final handler to execute after middleware
   */
  async execute(context: MiddlewareContext, handler: () => Promise<void>): Promise<void> {
    // Reset next() call tracking for this execution
    this.nextCallCounts.clear();

    let index = 0;

    const dispatch = async (fromMiddlewareIndex?: number): Promise<void> => {
      // Track next() calls for the middleware that called dispatch
      if (fromMiddlewareIndex !== undefined) {
        const callCount = this.nextCallCounts.get(fromMiddlewareIndex) ?? 0;
        if (callCount > 0) {
          throw new MultipleNextCallsError(fromMiddlewareIndex);
        }
        this.nextCallCounts.set(fromMiddlewareIndex, callCount + 1);
      }

      if (index < this.middleware.length) {
        const currentMiddlewareIndex = index;
        index++;

        const fn = this.middleware[currentMiddlewareIndex];
        if (fn) {
          // Create a next() function that tracks which middleware is calling it
          const next = () => dispatch(currentMiddlewareIndex);
          await fn(context, next);
        }
      } else {
        // All middleware complete, execute handler
        await handler();
      }
    };

    // Start the chain (not called by any middleware)
    await dispatch();
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
