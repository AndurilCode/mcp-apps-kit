/**
 * TypedEventEmitter Implementation
 *
 * Type-safe event emitter with:
 * - Strongly-typed event map for compile-time safety
 * - Async handler support with error isolation
 * - once() for one-time listeners
 * - onAny() for wildcard listeners
 * - Max listeners enforcement to prevent memory leaks
 * - Error logging with configurable behavior
 *
 * @module events/EventEmitter
 */

import type {
  EventHandler,
  AnyEventHandler,
  UnsubscribeFn,
  EventEmitterOptions,
  EventListenerInfo,
  EventEmitterStats,
} from "./types";
import { MaxListenersExceededError } from "./types";
import { debugLogger } from "../debug/logger";

/**
 * Internal listener wrapper
 *
 * Tracks handler function and metadata.
 */
interface ListenerWrapper<T> {
  /** Handler function */
  handler: EventHandler<T>;
  /** Whether this is a one-time listener */
  once: boolean;
  /** Handler function name (for debugging) */
  handlerName?: string;
}

/**
 * TypedEventEmitter
 *
 * Generic event emitter with type-safe event map.
 *
 * @template TEventMap - Event name to payload type mapping
 *
 * @example
 * ```typescript
 * const emitter = new TypedEventEmitter<{
 *   "user:login": { userId: string };
 *   "user:logout": { userId: string };
 * }>();
 *
 * emitter.on("user:login", ({ userId }) => {
 *   console.log(`User ${userId} logged in`);
 * });
 *
 * await emitter.emit("user:login", { userId: "123" });
 * ```
 */
export class TypedEventEmitter<TEventMap extends Record<string, unknown>> {
  private listeners = new Map<keyof TEventMap, ListenerWrapper<unknown>[]>();
  private wildcardListeners: AnyEventHandler[] = [];
  private options: Required<EventEmitterOptions>;

  constructor(options: EventEmitterOptions = {}) {
    this.options = {
      maxListeners: options.maxListeners ?? 50,
      logErrors: options.logErrors ?? true,
      captureStackTraces: options.captureStackTraces ?? false,
    };
  }

  /**
   * Subscribe to event
   *
   * Handler executes every time event is emitted until unsubscribed.
   *
   * @param event - Event name
   * @param handler - Event handler function
   * @returns Unsubscribe function
   */
  on<K extends keyof TEventMap>(event: K, handler: EventHandler<TEventMap[K]>): UnsubscribeFn {
    return this.addListener(event, handler, false);
  }

  /**
   * Subscribe to event (one-time)
   *
   * Handler executes once, then automatically unsubscribes.
   *
   * @param event - Event name
   * @param handler - Event handler function
   * @returns Unsubscribe function (can call to cancel before event fires)
   */
  once<K extends keyof TEventMap>(event: K, handler: EventHandler<TEventMap[K]>): UnsubscribeFn {
    return this.addListener(event, handler, true);
  }

  /**
   * Subscribe to all events
   *
   * Wildcard handler receives every event with name and payload.
   *
   * @param handler - Wildcard handler function
   * @returns Unsubscribe function
   */
  onAny(handler: AnyEventHandler): UnsubscribeFn {
    this.wildcardListeners.push(handler);

    return () => {
      const index = this.wildcardListeners.indexOf(handler);
      if (index !== -1) {
        this.wildcardListeners.splice(index, 1);
      }
    };
  }

  /**
   * Emit event
   *
   * Calls all registered handlers with payload.
   * Errors in handlers are caught and logged but don't propagate.
   *
   * @param event - Event name
   * @param payload - Event payload
   */
  async emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): Promise<void> {
    // Get listeners for this event
    const eventListeners = this.listeners.get(event) ?? [];

    // Execute all handlers with error isolation
    const results = await Promise.allSettled([
      // Execute specific event handlers
      ...eventListeners.map((wrapper) => this.executeHandler(wrapper.handler, payload, event)),
      // Execute wildcard handlers
      ...this.wildcardListeners.map((handler) =>
        this.executeWildcardHandler(handler, event, payload)
      ),
    ]);

    // Remove one-time listeners
    const persistentListeners = eventListeners.filter((wrapper) => !wrapper.once);
    if (persistentListeners.length !== eventListeners.length) {
      this.listeners.set(event, persistentListeners);
    }

    // Log any errors if configured
    if (this.options.logErrors) {
      for (const result of results) {
        if (result.status === "rejected") {
          debugLogger.error(
            `Event handler error for '${String(event)}'`,
            result.reason instanceof Error ? result.reason.message : String(result.reason)
          );
        }
      }
    }
  }

  /**
   * Remove all listeners
   *
   * @param event - Optional event name (if omitted, removes all listeners for all events)
   */
  removeAllListeners(event?: keyof TEventMap): void {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
      this.wildcardListeners = [];
    }
  }

  /**
   * Get listener count
   *
   * @param event - Event name
   * @returns Number of listeners registered for this event
   */
  listenerCount(event: keyof TEventMap): number {
    return this.listeners.get(event)?.length ?? 0;
  }

  /**
   * Get emitter statistics
   *
   * Debug info about current state.
   *
   * @returns Statistics object
   */
  getStats(): EventEmitterStats {
    const listenersByEvent: Record<string, number> = {};
    const listeners: EventListenerInfo[] = [];

    let totalListeners = 0;

    for (const [event, wrappers] of this.listeners.entries()) {
      const eventName = String(event);
      listenersByEvent[eventName] = wrappers.length;
      totalListeners += wrappers.length;

      for (const wrapper of wrappers) {
        listeners.push({
          event: eventName,
          once: wrapper.once,
          handlerName: wrapper.handlerName,
        });
      }
    }

    return {
      totalListeners,
      listenersByEvent,
      wildcardListeners: this.wildcardListeners.length,
      listeners,
    };
  }

  // =============================================================================
  // INTERNAL HELPERS
  // =============================================================================

  /**
   * Add listener with max listeners check
   */
  private addListener<K extends keyof TEventMap>(
    event: K,
    handler: EventHandler<TEventMap[K]>,
    once: boolean
  ): UnsubscribeFn {
    // Check max listeners
    const currentCount = this.listenerCount(event);
    if (this.options.maxListeners > 0 && currentCount >= this.options.maxListeners) {
      throw new MaxListenersExceededError(String(event), this.options.maxListeners);
    }

    // Create wrapper
    const wrapper: ListenerWrapper<TEventMap[K]> = {
      handler,
      once,
      handlerName: handler.name || undefined,
    };

    // Add to listeners map
    const eventListeners = this.listeners.get(event) ?? [];
    eventListeners.push(wrapper as ListenerWrapper<unknown>);
    this.listeners.set(event, eventListeners);

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(event) ?? [];
      const index = listeners.indexOf(wrapper as ListenerWrapper<unknown>);
      if (index !== -1) {
        listeners.splice(index, 1);
        if (listeners.length === 0) {
          this.listeners.delete(event);
        }
      }
    };
  }

  /**
   * Execute handler with error handling
   */
  private async executeHandler<T>(
    handler: EventHandler<T>,
    payload: T,
    _event: keyof TEventMap
  ): Promise<void> {
    await handler(payload);
  }

  /**
   * Execute wildcard handler with error handling
   */
  private async executeWildcardHandler(
    handler: AnyEventHandler,
    event: keyof TEventMap,
    payload: unknown
  ): Promise<void> {
    await handler(String(event), payload);
  }
}
