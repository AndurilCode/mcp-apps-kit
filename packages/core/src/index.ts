/**
 * @mcp-apps-kit/core
 *
 * Server-side framework for building MCP applications.
 *
 * @example
 * ```typescript
 * import { createApp } from "@mcp-apps-kit/core";
 * import { z } from "zod";
 *
 * const app = createApp({
 *   name: "my-app",
 *   version: "1.0.0",
 *   tools: {
 *     greet: {
 *       description: "Greet a user",
 *       input: z.object({ name: z.string() }),
 *       output: z.object({ message: z.string() }),
 *       handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
 *     },
 *   },
 * });
 *
 * await app.start({ port: 3000 });
 * ```
 */

// =============================================================================
// TYPE EXPORTS
// =============================================================================

// Tool types
export type {
  Visibility,
  UserLocation,
  ToolContext,
  ToolAnnotations,
  ToolDef,
  ToolDefs,
  StartOptions,
  App,
  McpServer,
  ExpressMiddleware,
  InferToolInputs,
  InferToolOutputs,
  ClientToolsFromCore,
} from "./types/tools";

// UI types
export type { CSPConfig, UIDef, UIDefs } from "./types/ui";

// Config types
export type {
  Protocol,
  CORSConfig,
  GlobalConfig,
  AppConfig,
  DebugConfig,
  DebugLogLevel,
} from "./types/config";

// OAuth types
export type {
  OAuthConfig,
  ValidatedToken,
  AuthContext,
  TokenVerifier,
} from "./server/oauth/types.js";
export { OAuthConfigSchema } from "./server/oauth/types.js";
export { OAuthError, ErrorCode as OAuthErrorCode } from "./server/oauth/errors.js";

// Plugin types
export type {
  Plugin,
  PluginInitContext,
  PluginStartContext,
  PluginShutdownContext,
  ToolCallContext,
  RequestContext,
  ResponseContext,
  UILoadContext,
  InferPluginConfig,
} from "./plugins/types";
export { createPlugin } from "./plugins/types";
export { PluginManager } from "./plugins/PluginManager";
export { loggingPlugin } from "./plugins/builtin/logging";

// Middleware types
export type { Middleware, MiddlewareContext } from "./middleware/types";
export {
  MultipleNextCallsError,
  MiddlewareTimeoutError,
  createTypedMiddleware,
  composeMiddleware,
  createErrorHandler,
  createConditionalMiddleware,
  createTimeoutMiddleware,
} from "./middleware/types";
export { MiddlewareChain } from "./middleware/MiddlewareChain";

// Event types
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
} from "./events/types";
export {
  MaxListenersExceededError,
  createValidatedHandler,
  createDebouncedHandler,
  createBatchedHandler,
} from "./events/types";
export { TypedEventEmitter } from "./events/EventEmitter";

// Debug logging types
export type { LogEntry, LogDebugInput, LogDebugOutput, LogOutputHandler } from "./debug/logger";
export {
  DebugLogger,
  debugLogger,
  configureDebugLogger,
  consoleOutputHandler,
  shouldLog,
  safeStringify,
  safeSerialize,
} from "./debug/logger";

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

// Schema utilities
export { zodToJsonSchema, extractPropertyDescriptions, isZodSchema } from "./utils/schema";
export type { JSONSchema, ZodToJsonSchemaOptions } from "./utils/schema";

// Error utilities
export { AppError, ErrorCode, formatZodError, wrapError } from "./utils/errors";
export type { ErrorCodeType } from "./utils/errors";

// Metadata utilities
export {
  mapVisibilityToMcp,
  mapVisibilityToOpenAI,
  generateToolMetadata,
  generateAllToolsMetadata,
} from "./utils/metadata";
export type {
  McpVisibilityValue,
  McpUIMeta,
  OpenAIVisibilitySettings,
  McpToolMetadata,
  OpenAIToolMetadata,
} from "./utils/metadata";

// CSP utilities
export {
  generateMcpCSPMetadata,
  generateOpenAICSPMetadata,
  generateMcpUIMetadata,
  generateOpenAIUIMetadata,
} from "./utils/csp";
export type {
  McpCSPMetadata,
  OpenAICSPMetadata,
  McpUIResourceMetadata,
  OpenAIUIResourceMetadata,
} from "./utils/csp";

// =============================================================================
// MAIN ENTRY POINTS
// =============================================================================

export { createApp, defineTool, defineUI } from "./createApp";
