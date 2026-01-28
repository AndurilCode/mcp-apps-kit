/**
 * Session Module
 *
 * Unified exports for widget session management.
 */

// Types
export type {
  WidgetSession,
  ActiveWidgetSession,
  SessionInfo,
  SessionSource,
  ProxyMetadata,
} from "./widget-session";

// Session Store
export { SessionStore } from "./session-store";
export type { CreateSessionOptions, SessionStoreOptions } from "./session-store";

// Session Renderer
export {
  SessionRenderer,
  setupPageListeners,
  updateSessionGlobals,
  deliverToolCallResponse,
} from "./session-renderer";
export type {
  RenderOptions,
  RenderResult,
  SessionRendererCallbacks,
  SetupPageOptions,
  UpdateGlobalsOptions,
  DeliverToolResponseOptions,
} from "./session-renderer";
