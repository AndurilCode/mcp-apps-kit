/**
 * Session Module
 *
 * Unified exports for widget session management.
 */

// Types from widget-session
export type {
  WidgetSession,
  ActiveWidgetSession,
  SessionInfo,
  SessionSource,
  ProxyMetadata,
} from "./widget-session";

// Re-export ConsoleLogEntry from tools for convenience
export type { ConsoleLogEntry } from "../tools/get-console-logs";

// Session Store
export { SessionStore } from "./session-store";
export type { CreateSessionOptions, SessionStoreOptions } from "./session-store";

// Session Renderer utilities
export {
  setupPageListeners,
  updateSessionGlobals,
  deliverToolCallResponse,
} from "./session-renderer";
export type {
  SessionRendererCallbacks,
  SetupPageOptions,
  UpdateGlobalsOptions,
  DeliverToolResponseOptions,
} from "./session-renderer";
