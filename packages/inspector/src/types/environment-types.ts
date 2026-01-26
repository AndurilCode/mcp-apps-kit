/**
 * Environment Types
 *
 * Types for environment state, globals, and sync events.
 */

// =============================================================================
// ENVIRONMENT STATE TYPES
// =============================================================================

/**
 * Device type information
 */
export interface DeviceType {
  type?: string;
}

/**
 * Device capabilities information
 */
export interface DeviceCapabilitiesInfo {
  hover?: boolean;
  touch?: boolean;
}

/**
 * User agent information
 */
export interface UserAgentInfo {
  device?: DeviceType;
  capabilities?: DeviceCapabilitiesInfo;
}

/**
 * User location information
 */
export interface UserLocationInfo {
  city?: string;
  region?: string;
  country?: string;
  timezone?: string;
}

/**
 * Safe area insets for mobile devices
 */
export interface SafeAreaInsetsInfo {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Viewport dimensions
 */
export interface ViewportInfo {
  width: number;
  height: number;
}

/**
 * Environment state for widget rendering and testing
 * This affects how widgets are rendered in both MCP and OpenAI protocols
 */
export interface EnvironmentState {
  /** UI theme (default: "light") */
  theme: "light" | "dark";

  /** BCP 47 locale code (default: "en-US") */
  locale: string;

  /** IANA timezone (default: "UTC") */
  timeZone: string;

  /** Widget display mode (default: "inline") */
  displayMode: "inline" | "fullscreen" | "pip";

  /** Screen dimensions (default: { width: 800, height: 600 }) */
  viewport: ViewportInfo;

  /** Max widget height in pixels (default: undefined) */
  maxHeight?: number;

  /** Safe area insets for mobile devices (default: all zeros) */
  safeAreaInsets: SafeAreaInsetsInfo;

  /** User agent information (default: desktop with hover) */
  userAgent: UserAgentInfo;

  /** User location information (default: undefined) */
  userLocation?: UserLocationInfo;
}

/**
 * Input for set_globals tool
 */
export interface SetGlobalsInput {
  theme?: "light" | "dark";
  locale?: string;
  timeZone?: string;
  displayMode?: "inline" | "fullscreen" | "pip";
  viewport?: ViewportInfo;
  maxHeight?: number | null;
  safeAreaInsets?: SafeAreaInsetsInfo;
  userAgent?: UserAgentInfo;
  userLocation?: UserLocationInfo | null;
}

/**
 * Output from set_globals tool
 */
export interface SetGlobalsOutput {
  updated: boolean;
  currentState: EnvironmentState;
  message?: string;
}

/**
 * Output from get_globals tool
 */
export interface GetGlobalsOutput {
  currentState: EnvironmentState;
}

/**
 * Output from reset_globals tool
 */
export interface ResetGlobalsOutput {
  reset: boolean;
  currentState: EnvironmentState;
}

// =============================================================================
// EVENT SYNC TYPES (for 1:1 widget state mirroring)
// =============================================================================

/**
 * All event types that can be synced between external and Playwright widgets
 */
export type SyncEventType =
  // Globals/Environment
  | "globals"
  | "host-context-changed"
  // Tool Events
  | "tool-input"
  | "tool-input-partial"
  | "tool-output"
  | "tool-result"
  | "tool-response-metadata"
  | "tool-cancelled"
  // Bidirectional Tool Calls
  | "call-tool"
  | "call-tool-response"
  // Lifecycle
  | "initialize"
  | "teardown"
  // DOM Interaction Events (external -> mirror)
  | "dom-click"
  | "dom-dblclick"
  | "dom-input"
  | "dom-change"
  | "dom-focus"
  | "dom-blur"
  | "dom-scroll"
  | "dom-keydown"
  | "dom-keyup"
  | "dom-select"
  | "dom-hover"
  | "dom-drag";

/**
 * Unified sync event payload for /sync-events endpoint
 */
export interface SyncEventPayload {
  /** Event type */
  type: SyncEventType;
  /** Event data (type-dependent) */
  data: unknown;
  /** Session ID to target (optional - broadcasts to all if omitted) */
  sessionId?: string;
  /** Protocol for delivery */
  protocol: "openai" | "mcp";
  /** Timestamp when event was captured */
  timestamp?: string;
}
