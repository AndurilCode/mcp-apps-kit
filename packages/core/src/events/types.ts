/**
 * Event System Types
 *
 * @module events/types
 */

import type { ToolContext, ToolDefs as _ToolDefs } from "../types/tools";
import type { AppConfig } from "../types/config";

// =============================================================================
// EVENT MAP
// =============================================================================

/**
 * Strongly-typed event map
 *
 * Maps event names to their payload types. All events emitted by the framework
 * must be defined here to maintain type safety.
 */
export interface EventMap {
  /**
   * Emitted when app initialization completes
   *
   * Timing: After plugins initialized, before server starts
   */
  "app:init": {
    /** App configuration */
    config: AppConfig;
  };

  /**
   * Emitted when server starts successfully
   *
   * Timing: After server starts listening
   */
  "app:start": {
    /** Server port (HTTP transport only) */
    port?: number;
    /** Transport type */
    transport: "http" | "stdio";
  };

  /**
   * Emitted when app shutdown begins
   *
   * Timing: Before plugins shut down
   */
  "app:shutdown": {
    /** Whether shutdown is graceful */
    graceful: boolean;
  };

  /**
   * Emitted when tool is invoked
   *
   * Timing: Before middleware and handler execution
   */
  "tool:called": {
    /** Tool name */
    toolName: string;
    /** Tool input (validated) */
    input: unknown;
    /** Client metadata */
    context: ToolContext;
  };

  /**
   * Emitted when tool completes successfully
   *
   * Timing: After handler and plugins complete
   */
  "tool:success": {
    /** Tool name */
    toolName: string;
    /** Tool result */
    result: unknown;
    /** Execution duration in milliseconds */
    duration: number;
  };

  /**
   * Emitted when tool execution fails
   *
   * Timing: After error occurs, before error response sent
   */
  "tool:error": {
    /** Tool name */
    toolName: string;
    /** Error thrown */
    error: Error;
    /** Execution duration in milliseconds */
    duration: number;
  };

  /**
   * Emitted when plugin/middleware/event handler errors occur
   *
   * Timing: Immediately after error is caught
   */
  error: {
    /** Error that occurred */
    error: Error;
    /** Source of error (e.g., 'plugin:logging:onInit') */
    source: string;
  };
}

// =============================================================================
// EVENT HANDLER TYPES
// =============================================================================

/**
 * Event handler function
 *
 * Async function that processes event payloads.
 * Errors in handlers are caught and logged but don't propagate.
 */
export type EventHandler<T> = (payload: T) => void | Promise<void>;

/**
 * Wildcard event handler
 *
 * Receives all events with event name and payload.
 */
export type AnyEventHandler = (event: string, payload: unknown) => void | Promise<void>;

/**
 * Unsubscribe function
 *
 * Call to remove event listener.
 * Safe to call multiple times (idempotent).
 */
export type UnsubscribeFn = () => void;

// =============================================================================
// EVENT EMITTER ERRORS
// =============================================================================

/**
 * Error thrown when max listeners exceeded
 *
 * Prevents memory leaks from unbounded listener growth.
 */
export class MaxListenersExceededError extends Error {
  constructor(event: string, maxListeners: number) {
    super(
      `Max listeners (${maxListeners}) exceeded for event '${event}'. ` +
        `Possible memory leak detected. Consider using once() or unsubscribing.`
    );
    this.name = "MaxListenersExceededError";
  }
}

// =============================================================================
// EVENT EMITTER OPTIONS
// =============================================================================

/**
 * Options for creating event emitter
 *
 * Allows customization of event emitter behavior.
 */
export interface EventEmitterOptions {
  /**
   * Maximum listeners per event
   *
   * Throws MaxListenersExceededError if exceeded.
   * Set to 0 for unlimited (not recommended).
   *
   * @default 50
   */
  maxListeners?: number;

  /**
   * Whether to log handler errors
   *
   * When true, logs errors to console.error.
   * When false, errors are silently ignored.
   *
   * @default true
   */
  logErrors?: boolean;

  /**
   * Whether to capture stack traces for listeners
   *
   * Helpful for debugging but adds overhead.
   *
   * @default false
   */
  captureStackTraces?: boolean;
}

// =============================================================================
// EVENT LISTENER INFO (FOR DEBUGGING)
// =============================================================================

/**
 * Event listener info
 *
 * Internal type for tracking active listeners.
 */
export interface EventListenerInfo {
  /** Event name */
  event: string;
  /** Whether listener is one-time */
  once: boolean;
  /** Handler function name (if available) */
  handlerName?: string;
}

/**
 * Event emitter stats
 *
 * Debug info about event emitter state.
 */
export interface EventEmitterStats {
  /** Total number of listeners across all events */
  totalListeners: number;
  /** Listeners by event name */
  listenersByEvent: Record<string, number>;
  /** Number of wildcard (onAny) listeners */
  wildcardListeners: number;
  /** List of all active listeners */
  listeners: EventListenerInfo[];
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Extract event names from event map
 */
export type EventNames<TEventMap extends Record<string, unknown>> = keyof TEventMap & string;

/**
 * Extract payload type for specific event
 */
export type EventPayload<
  TEventMap extends Record<string, unknown>,
  K extends keyof TEventMap,
> = TEventMap[K];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create typed event handler with validation
 *
 * Wraps handler with runtime payload validation using Zod schema.
 */
export function createValidatedHandler<T>(
  schema: { parse: (data: unknown) => T },
  handler: EventHandler<T>
): EventHandler<T> {
  return async (payload: T) => {
    const validated = schema.parse(payload);
    await handler(validated);
  };
}

/**
 * Create debounced event handler
 *
 * Delays handler execution until event hasn't fired for specified duration.
 */
export function createDebouncedHandler<T>(
  handler: EventHandler<T>,
  delayMs: number
): EventHandler<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastPayload: T | null = null;

  return (payload: T) => {
    lastPayload = payload;

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      void (async () => {
        if (lastPayload !== null) {
          try {
            await handler(lastPayload);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(
              "Debounced handler error:",
              error instanceof Error ? error.message : String(error)
            );
          } finally {
            lastPayload = null;
          }
        }
      })();
    }, delayMs);
  };
}

/**
 * Create batched event handler
 *
 * Collects events and processes them in batches.
 */
export function createBatchedHandler<T>(
  handler: (payloads: T[]) => void | Promise<void>,
  options: {
    /** Maximum batch size before flushing */
    maxBatchSize: number;
    /** Maximum wait time before flushing */
    maxWaitMs: number;
  }
): EventHandler<T> {
  const batch: T[] = [];
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;

    const payloads = [...batch];
    batch.length = 0;

    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    await handler(payloads);
  };

  const scheduleFlush = (): void => {
    if (timeoutId) return;

    timeoutId = setTimeout(() => {
      void flush();
    }, options.maxWaitMs);
  };

  return async (payload: T) => {
    batch.push(payload);

    if (batch.length >= options.maxBatchSize) {
      await flush();
    } else {
      scheduleFlush();
    }
  };
}
