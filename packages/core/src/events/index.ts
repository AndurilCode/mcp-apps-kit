/**
 * Event System
 *
 * @module events
 */

// Re-export all types and helpers
export type {
  EventMap,
  EventHandler,
  AnyEventHandler,
  UnsubscribeFn,
  EventNames,
  EventPayload,
  EventEmitterOptions,
  EventEmitterStats,
  EventListenerInfo,
} from "./types";

export {
  MaxListenersExceededError,
  createValidatedHandler,
  createDebouncedHandler,
  createBatchedHandler,
} from "./types";
