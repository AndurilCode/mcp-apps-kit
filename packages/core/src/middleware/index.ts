/**
 * Middleware System
 *
 * @module middleware
 */

// Re-export all types and helpers
export type { Middleware, MiddlewareContext, MiddlewareWithResult } from "./types";

export {
  MultipleNextCallsError,
  MiddlewareTimeoutError,
  createTypedMiddleware,
  composeMiddleware,
  createErrorHandler,
  createConditionalMiddleware,
  createTimeoutMiddleware,
} from "./types";

export { MiddlewareChain } from "./MiddlewareChain";

// Safe middleware helpers (NEW)
export {
  defineMiddleware,
  type BeforeHook,
  type AfterHook,
  type WrapMiddleware,
  type MiddlewareDefinition,
  type BeforeHookWithResult,
  type AfterHookWithResult,
  type WrapMiddlewareWithResult,
  type MiddlewareDefinitionWithResult,
} from "./defineMiddleware";
