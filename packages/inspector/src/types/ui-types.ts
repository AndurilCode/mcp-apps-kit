/**
 * UI Types
 *
 * Types for UI widget inspection, preview, rendering, and interaction.
 */

import type { EnvironmentState } from "./environment-types";

// =============================================================================
// UI INSPECTION TYPES
// =============================================================================

/**
 * Protocol type for UI widgets
 */
export type UIProtocol = "mcp-app" | "openai" | "unknown";

/**
 * Info about a UI widget
 */
export interface UIWidgetInfo {
  uri: string;
  name?: string;
  description?: string;
  protocol: UIProtocol;
  mimeType: string;
}

/**
 * Output from list_ui_widgets tool
 */
export interface ListUIWidgetsOutput {
  widgets: UIWidgetInfo[];
  count: number;
}

/**
 * Input for get_ui_widget tool
 */
export interface GetUIWidgetInput {
  uri: string;
}

/**
 * CSP metadata for a UI widget
 */
export interface UIWidgetCSP {
  connectDomains?: string[];
  resourceDomains?: string[];
  redirectDomains?: string[];
  frameDomains?: string[];
}

/**
 * Metadata for a UI widget
 */
export interface UIWidgetMetadata {
  prefersBorder?: boolean;
  autoResize?: boolean;
  domain?: string;
  widgetDescription?: string;
  csp?: UIWidgetCSP;
}

/**
 * Output from get_ui_widget tool
 */
export interface GetUIWidgetOutput {
  uri: string;
  name?: string;
  description?: string;
  mimeType: string;
  html: string;
  htmlLength: number;
  metadata: UIWidgetMetadata;
}

/**
 * Input for inspect_tool_ui tool
 */
export interface InspectToolUIInput {
  toolName: string;
}

/**
 * UI binding info for a tool
 */
export interface UIBinding {
  resourceUri: string;
  visibility: string[];
}

/**
 * Output from inspect_tool_ui tool
 */
export interface InspectToolUIOutput {
  toolName: string;
  hasUI: boolean;
  uiBinding: UIBinding | null;
  mcpMeta: Record<string, unknown> | null;
  openaiMeta: Record<string, unknown> | null;
}

/**
 * Input for get_ui_metadata tool
 */
export interface GetUIMetadataInput {
  uri: string;
}

/**
 * Output from get_ui_metadata tool
 */
export interface GetUIMetadataOutput {
  uri: string;
  mimeType: string;
  detectedProtocol: UIProtocol;
  mcpFormat: Record<string, unknown>;
  openaiFormat: Record<string, unknown>;
  raw: Record<string, unknown>;
}

// =============================================================================
// PREVIEW / RENDERING TYPES
// =============================================================================

/**
 * Element info from DOM inspection
 */
export interface ElementInfo {
  tagName: string;
  id?: string;
  className?: string;
  textContent?: string;
  attributes: Record<string, string>;
  children: number;
  rect?: { x: number; y: number; width: number; height: number };
}

/**
 * Input for preview_ui tool
 */
export interface PreviewUIInput {
  /** Use existing widget session (optional) */
  sessionId?: string;
  /** Tool name to preview (required if no sessionId) */
  tool?: string;
  /** Arguments to pass to the tool (required if no sessionId) */
  arguments?: Record<string, unknown>;
  /** Protocol to use (auto-detect if not specified) */
  protocol?: "mcp" | "openai" | "auto";
  /** Time to wait for render (ms, default: 100) */
  waitMs?: number;
}

/**
 * Output from preview_ui tool
 */
export interface PreviewUIOutput {
  /** Whether UI resource was found */
  hasUI: boolean;
  /** Reason if no UI found */
  noUIReason?: string;
  /** Detected/used protocol */
  protocol?: "mcp" | "openai";
  /** Resource URI */
  resourceUri?: string;
  /** Serialized HTML */
  dom?: string;
  /** Extracted text content */
  textContent?: string;
  /** Key elements found */
  elements?: ElementInfo[];
  /** Whether tool result data appears in DOM */
  toolResultDisplayed?: boolean;
  /** Console errors during render */
  errors: string[];
  /** Render duration (ms) */
  renderDuration?: number;
}

/**
 * Input for screenshot_widget tool
 */
export interface ScreenshotWidgetInput {
  /** Use existing widget session (optional) */
  sessionId?: string;
  /** Tool name (required if no sessionId) */
  tool?: string;
  /** Tool arguments (required if no sessionId) */
  arguments?: Record<string, unknown>;
  /** Protocol */
  protocol?: "mcp" | "openai" | "auto";
  /** Screenshot format */
  format?: "png" | "jpeg";
  /** Full page or viewport only */
  fullPage?: boolean;
  /** Viewport size */
  viewport?: { width: number; height: number };
}

/**
 * Output from screenshot_widget tool
 */
export interface ScreenshotWidgetOutput {
  hasUI: boolean;
  noUIReason?: string;
  protocol?: "mcp" | "openai";
  /** Path to the screenshot file */
  screenshotPath?: string;
  /** Screenshot format */
  format?: "png" | "jpeg";
  /** Screenshot dimensions */
  dimensions?: { width: number; height: number };
  errors: string[];
}

/**
 * Interaction action for test_widget_interaction
 */
export interface InteractionAction {
  action: "click" | "type" | "hover" | "wait" | "snapshot" | "scroll";
  selector?: string;
  text?: string;
  ms?: number;
  position?: { x: number; y: number };
}

/**
 * Input for test_widget_interaction tool
 */
export interface TestWidgetInteractionInput {
  /** Use existing widget session (optional) */
  sessionId?: string;
  /** Tool name (required if no sessionId) */
  tool?: string;
  /** Tool arguments (required if no sessionId) */
  arguments?: Record<string, unknown>;
  /** Interactions to perform */
  interactions: InteractionAction[];
  /** Protocol */
  protocol?: "mcp" | "openai" | "auto";
  /** Viewport size */
  viewport?: { width: number; height: number };
}

/**
 * Output from test_widget_interaction tool
 */
export interface TestWidgetInteractionOutput {
  hasUI: boolean;
  noUIReason?: string;
  protocol?: "mcp" | "openai";
  /** DOM snapshots taken during interactions */
  snapshots: Array<{
    afterAction: number;
    dom: string;
    textContent: string;
  }>;
  /** Tool calls made by widget (bidirectional) */
  toolCalls: Array<{ name: string; args: unknown }>;
  /** State changes (OpenAI setState calls) */
  stateChanges: Array<{ state: unknown; timestamp: number }>;
  errors: string[];
}

/**
 * Console log entry captured from the browser
 */
export interface ConsoleLogEntry {
  /** Log level (log, info, warn, error, debug) */
  level: "log" | "info" | "warn" | "error" | "debug";
  /** The message text */
  text: string;
  /** Source of the log (widget, host, or unknown) */
  source: "widget" | "host" | "unknown";
  /** Timestamp when the log was captured */
  timestamp: number;
  /** Optional URL where the log originated */
  url?: string;
  /** Optional line number */
  lineNumber?: number;
}

/**
 * Input for get_console_logs tool
 */
export interface GetConsoleLogsInput {
  /** Use existing widget session (optional) */
  sessionId?: string;
  /** Tool name to render (required if no sessionId) */
  tool?: string;
  /** Arguments to pass to the tool (required if no sessionId) */
  arguments?: Record<string, unknown>;
  /** Protocol to use (auto-detect if not specified) */
  protocol?: "mcp" | "openai" | "auto";
  /** Time to wait for widget to render and log (default: 500ms) */
  waitMs?: number;
  /** Viewport size */
  viewport?: { width: number; height: number };
}

/**
 * Output from get_console_logs tool
 */
export interface GetConsoleLogsOutput {
  /** Whether the UI was rendered successfully */
  hasUI: boolean;
  /** Reason if no UI found */
  noUIReason?: string;
  /** Detected/used protocol */
  protocol?: "mcp" | "openai";
  /** Array of console log entries */
  logs: ConsoleLogEntry[];
  /** Summary counts by level */
  summary: {
    total: number;
    log: number;
    info: number;
    warn: number;
    error: number;
    debug: number;
  };
  /** Page errors (uncaught exceptions) */
  pageErrors: string[];
  /** Any errors during the process */
  errors: string[];
}

// =============================================================================
// WIDGET CONTROL TYPES (for dual mode agent tools)
// =============================================================================

/**
 * Input for widget_evaluate tool
 */
export interface WidgetEvaluateInput {
  /** Session ID of the widget to evaluate in */
  sessionId: string;
  /** JavaScript code to evaluate in the widget iframe */
  expression: string;
}

/**
 * Output from widget_evaluate tool
 */
export interface WidgetEvaluateOutput {
  /** Whether the evaluation was successful */
  success: boolean;
  /** Result of the evaluation (JSON-serializable) */
  result?: unknown;
  /** Error message if evaluation failed */
  error?: string;
}

/**
 * Input for widget_click tool
 */
export interface WidgetClickInput {
  /** Session ID of the widget */
  sessionId: string;
  /** CSS selector of the element to click */
  selector: string;
  /** Optional timeout in ms (default: 5000) */
  timeout?: number;
}

/**
 * Output from widget_click tool
 */
export interface WidgetClickOutput {
  /** Whether the click was successful */
  success: boolean;
  /** Error message if click failed */
  error?: string;
}

/**
 * Input for widget_fill tool
 */
export interface WidgetFillInput {
  /** Session ID of the widget */
  sessionId: string;
  /** CSS selector of the input element */
  selector: string;
  /** Value to fill in the input */
  value: string;
  /** Optional timeout in ms (default: 5000) */
  timeout?: number;
}

/**
 * Output from widget_fill tool
 */
export interface WidgetFillOutput {
  /** Whether the fill was successful */
  success: boolean;
  /** Error message if fill failed */
  error?: string;
  /** Element type that was filled (input, textarea, contenteditable, select) */
  elementType?: string;
  /** The method used to fill (fill, type, selectOption) */
  fillMethod?: "fill" | "type" | "selectOption" | "contenteditable";
}

/**
 * Output from widget_drag tool
 */
export interface WidgetDragOutput {
  /** Whether the drag was successful */
  success: boolean;
  /** Error message if drag failed */
  error?: string;
  /** Starting position of the drag */
  startPosition?: { x: number; y: number };
  /** Ending position of the drag */
  endPosition?: { x: number; y: number };
}

/**
 * Tracked dialog from widget interactions
 */
export interface TrackedDialog {
  /** Dialog type (alert, confirm, prompt, beforeunload) */
  type: "alert" | "confirm" | "prompt" | "beforeunload";
  /** Dialog message text */
  message: string;
  /** Default value for prompt dialogs */
  defaultValue?: string;
  /** How it was handled (accepted, dismissed) */
  handled: "accepted" | "dismissed";
  /** Timestamp when dialog appeared */
  timestamp: number;
}

/**
 * Output from widget_refresh tool
 */
export interface WidgetRefreshOutput {
  /** Whether the refresh was successful */
  success: boolean;
  /** Error message if refresh failed */
  error?: string;
  /** The new tool result after refresh */
  newToolResult?: unknown;
  /** Whether the widget was updated */
  widgetUpdated?: boolean;
}

/**
 * Input for widget_wait_for_selector tool
 */
export interface WidgetWaitForSelectorInput {
  /** Session ID of the widget */
  sessionId: string;
  /** CSS selector to wait for */
  selector: string;
  /** State to wait for (default: "visible") */
  state?: "attached" | "detached" | "visible" | "hidden";
  /** Optional timeout in ms (default: 5000) */
  timeout?: number;
}

/**
 * Output from widget_wait_for_selector tool
 */
export interface WidgetWaitForSelectorOutput {
  /** Whether the selector was found in the expected state */
  success: boolean;
  /** Error message if wait failed */
  error?: string;
}

/**
 * Input for widget_locator tool
 */
export interface WidgetLocatorInput {
  /** Session ID of the widget */
  sessionId: string;
  /** CSS selector to query */
  selector: string;
  /** Optional timeout in ms (default: 5000) */
  timeout?: number;
}

/**
 * Element info returned by widget_locator
 */
export interface LocatorElementInfo {
  /** Tag name of the element */
  tagName: string;
  /** Element text content */
  textContent: string;
  /** Element id attribute */
  id?: string;
  /** Element class attribute */
  className?: string;
  /** Whether the element is visible */
  isVisible: boolean;
  /** Whether the element is enabled */
  isEnabled: boolean;
  /** Bounding box of the element */
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Output from widget_locator tool
 */
export interface WidgetLocatorOutput {
  /** Whether the query was successful */
  success: boolean;
  /** Number of matching elements */
  count?: number;
  /** Info about matching elements (first 10) */
  elements?: LocatorElementInfo[];
  /** Error message if query failed */
  error?: string;
}

/**
 * Input for get_widget_state tool
 */
export interface GetWidgetStateInput {
  /** Session ID of the widget */
  sessionId: string;
  /** Whether to include DOM snapshot (default: false) */
  includeDOM?: boolean;
}

/**
 * A recorded tool call made by the widget
 */
export interface WidgetToolCall {
  /** Tool name */
  name: string;
  /** Tool arguments */
  args: unknown;
  /** Tool result (if captured from /execute-tool) */
  result?: unknown;
  /** Whether the call resulted in an error */
  isError?: boolean;
  /** Timestamp when the call was made */
  timestamp: number;
}

/**
 * A recorded state change (OpenAI setState)
 */
export interface WidgetStateChange {
  /** The state that was set */
  state: unknown;
  /** Timestamp when the state was set */
  timestamp: number;
}

/**
 * DOM snapshot for widget state
 */
export interface WidgetDOMSnapshot {
  /** Serialized HTML */
  html: string;
  /** Text content of the body */
  textContent: string;
}

/**
 * Comprehensive widget state snapshot
 */
export interface WidgetStateSnapshot {
  /** Session ID */
  sessionId: string;
  /** Tool name that created this session */
  toolName: string;
  /** Protocol used (mcp or openai) */
  protocol: "mcp" | "openai";
  /** Current environment/globals state */
  globals: EnvironmentState;
  /** Original tool input arguments */
  toolInput: Record<string, unknown>;
  /** Tool result that was rendered */
  toolOutput: unknown;
  /** Tool response metadata (if available) */
  toolResponseMetadata?: Record<string, unknown>;
  /** Tool calls made by the widget */
  toolCalls: WidgetToolCall[];
  /** State changes (OpenAI setState history) */
  stateChanges: WidgetStateChange[];
  /** Optional DOM snapshot */
  dom?: WidgetDOMSnapshot;
  /** Console logs captured from the widget */
  consoleLogs: ConsoleLogEntry[];
  /** Page errors captured from the widget */
  pageErrors: string[];
  /** Native dialogs that were auto-handled (confirm, alert, prompt) */
  dialogs: TrackedDialog[];
  /** When the session was created */
  createdAt: number;
  /** Which endpoint created this session */
  source: "apps" | "agent";
  /** Proxy metadata (for sessions created via /apps/mcp) */
  proxyMetadata?: {
    targetServerUrl: string;
    targetToolName: string;
  };
}

/**
 * Output from get_widget_state tool
 */
export interface GetWidgetStateOutput {
  /** Whether the state was retrieved successfully */
  success: boolean;
  /** The widget state snapshot */
  state?: WidgetStateSnapshot;
  /** Error message if retrieval failed */
  error?: string;
}
