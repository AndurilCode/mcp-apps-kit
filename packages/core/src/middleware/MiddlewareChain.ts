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

    const dispatch = async (): Promise<void> => {
      if (index < this.middleware.length) {
        const currentMiddlewareIndex = index;
        index++;
        
        // Check if this middleware has already called next()
        const callCount = this.nextCallCounts.get(currentMiddlewareIndex) ?? 0;
        if (callCount > 0) {
          throw new MultipleNextCallsError(currentMiddlewareIndex);
        }
        this.nextCallCounts.set(currentMiddlewareIndex, callCount + 1);
        
        const fn = this.middleware[currentMiddlewareIndex];
        if (fn) {
          await fn(context, dispatch);
        }
      } else {
        // All middleware complete, execute handler
        await handler();
      }
    };

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
