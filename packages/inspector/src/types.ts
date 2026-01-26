/**
 * Types for MCP Inspector Server
 */

import type { TestClient } from "@mcp-apps-kit/testing";
import type { z } from "zod";

// Export session types
export type {
  ActiveWidgetSession,
  SessionInfo,
  SessionSource,
  ProxyMetadata,
} from "./widget-session-manager";

// =============================================================================
// MCP SERVER INTERFACE (for direct registration)
// =============================================================================

/**
 * Resource metadata for registration
 */
export interface ResourceMetadata {
  description?: string;
  mimeType?: string;
  _meta?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

/**
 * Resource read result
 */
export interface ResourceContents {
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
    _meta?: Record<string, unknown>;
  }>;
}

/**
 * Tool call result
 */
export interface ToolCallResult {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  structuredContent?: unknown;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

/**
 * MCP Server interface for direct tool and resource registration
 * Uses the same API as @modelcontextprotocol/sdk McpServer
 */
export interface McpServerLike {
  registerTool(
    name: string,
    metadata: {
      title?: string;
      description?: string;
      inputSchema?: Record<string, z.ZodType> | Record<string, unknown>;
      outputSchema?: Record<string, z.ZodType> | Record<string, unknown>;
      _meta?: Record<string, unknown>;
      annotations?: Record<string, unknown>;
    },
    handler: (args: Record<string, unknown>) => ToolCallResult | Promise<ToolCallResult>
  ): void;

  registerResource(
    name: string,
    uri: string,
    metadata: ResourceMetadata,
    handler: () => ResourceContents | Promise<ResourceContents>
  ): void;
}

// =============================================================================
// TARGET SERVER SCHEMA TYPES (for dual-mode proxy)
// =============================================================================

/**
 * Full metadata for a target server tool (preserves all MCP metadata for proxying)
 */
export interface TargetToolInfo {
  /** Tool name */
  name: string;
  /** Tool title (display name) */
  title?: string;
  /** Tool description */
  description?: string;
  /** JSON Schema for tool input */
  inputSchema?: Record<string, unknown>;
  /** JSON Schema for tool output */
  outputSchema?: Record<string, unknown>;
  /** MCP metadata (ui binding, etc.) */
  _meta?: Record<string, unknown>;
  /** Tool annotations */
  annotations?: Record<string, unknown>;
}

/**
 * Full metadata for a target server resource (preserves all MCP metadata for proxying)
 */
export interface TargetResourceInfo {
  /** Resource URI */
  uri: string;
  /** Resource name */
  name?: string;
  /** Resource description */
  description?: string;
  /** Resource MIME type */
  mimeType?: string;
  /** MCP metadata (UI bindings, etc.) */
  _meta?: Record<string, unknown>;
  /** Resource annotations */
  annotations?: Record<string, unknown>;
}

/**
 * Full metadata for a target server prompt
 */
export interface TargetPromptInfo {
  /** Prompt name */
  name: string;
  /** Prompt description */
  description?: string;
  /** Prompt arguments */
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
  /** MCP metadata */
  _meta?: Record<string, unknown>;
}

/**
 * Cached schema from a connected target server
 *
 * Used for:
 * - Generating proxy tools on /apps/mcp endpoint
 * - Full metadata preservation for transparent proxying
 */
export interface TargetServerSchema {
  /** Target server tools with full metadata */
  tools: TargetToolInfo[];
  /** Target server resources with full metadata */
  resources: TargetResourceInfo[];
  /** Target server prompts with full metadata */
  prompts: TargetPromptInfo[];
  /** Server info (name, version) */
  serverInfo: ServerInfo | null;
  /** When the schema was captured */
  capturedAt: number;
}

// =============================================================================
// SERVER OPTIONS
// =============================================================================

/**
 * Options for creating the inspector server
 */
export interface InspectorServerOptions {
  /** Maximum call history entries. Default: 1000 */
  maxHistorySize?: number;

  /** Default timeout for tool calls in ms. Default: 30000 */
  defaultTimeout?: number;

  /** Enable debug logging. Default: false */
  debug?: boolean;

  /** Session TTL in milliseconds. Default: 300000 (5 minutes) */
  sessionTtl?: number;
}

// =============================================================================
// CONNECTION TYPES
// =============================================================================

/**
 * Options for connecting to a target server
 */
export interface ConnectOptions {
  /** Track call history. Default: true */
  trackHistory?: boolean;

  /** Connection timeout in ms. Default: 30000 */
  timeout?: number;
}

/**
 * Server info returned after connection
 */
export interface ServerInfo {
  name: string;
  version: string;
}

/**
 * Connection state
 */
export interface ConnectionState {
  /** Whether connected to a target server */
  connected: boolean;

  /** URL of the connected server */
  serverUrl: string | null;

  /** Server info from the connected server */
  serverInfo: ServerInfo | null;

  /** Whether history tracking is enabled */
  historyEnabled: boolean;

  /** Number of calls made */
  callCount: number;

  /** The test client (if connected) */
  client: TestClient | null;
}

// =============================================================================
// TOOL INPUT/OUTPUT TYPES
// =============================================================================

/**
 * Input for connect_to_server tool
 */
export interface ConnectInput {
  url: string;
  options?: ConnectOptions;
}

/**
 * Output from connect_to_server tool
 */
export interface ConnectOutput {
  connected: boolean;
  serverUrl: string;
  serverInfo: ServerInfo | null;
  toolCount: number;
  resourceCount: number;
  promptCount: number;
}

/**
 * Output from disconnect tool
 */
export interface DisconnectOutput {
  disconnected: boolean;
  previousUrl: string | null;
}

/**
 * Tool info from list_tools
 */
export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * Input for call_tool
 */
export interface CallToolInput {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Content block in tool result
 */
export interface ContentBlock {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;
  mimeType?: string;
}

/**
 * Output from call_tool
 */
export interface CallToolOutput {
  content: ContentBlock[];
  isError: boolean;
  structuredContent?: unknown;
  error?: { code: string; message: string };
  duration: number;
  sessionId?: string;
}

/**
 * Resource info from list_resources
 */
export interface ResourceInfo {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

/**
 * Input for read_resource
 */
export interface ReadResourceInput {
  uri: string;
}

/**
 * Output from read_resource
 */
export interface ReadResourceOutput {
  contents: ContentBlock[];
}

/**
 * Prompt info from list_prompts
 */
export interface PromptInfo {
  name: string;
  description?: string;
}

/**
 * Input for get_prompt
 */
export interface GetPromptInput {
  name: string;
  arguments?: Record<string, string>;
}

/**
 * Prompt message
 */
export interface PromptMessage {
  role: "user" | "assistant";
  content: {
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
  };
}

/**
 * Output from get_prompt
 */
export interface GetPromptOutput {
  description?: string;
  messages: PromptMessage[];
}

// =============================================================================
// HISTORY TYPES
// =============================================================================

/**
 * A recorded tool call
 */
export interface HistoryEntry {
  name: string;
  args: Record<string, unknown>;
  result: {
    content: ContentBlock[];
    isError: boolean;
  };
  duration: number;
  timestamp: string;
}

/**
 * Output from get_call_history
 */
export interface HistoryOutput {
  history: HistoryEntry[];
  totalCalls: number;
  errorCount: number;
  averageDuration: number;
  message?: string;
}

/**
 * Output from clear_history
 */
export interface ClearHistoryOutput {
  cleared: boolean;
  previousCount: number;
}

// =============================================================================
// TEST SUITE TYPES
// =============================================================================

/**
 * Test case in a suite
 */
export interface TestCaseInput {
  name: string;
  input: Record<string, unknown>;
  expected?: Record<string, unknown>;
  skip?: boolean;
}

/**
 * Test suite input
 */
export interface TestSuiteInput {
  name: string;
  tool: string;
  cases: TestCaseInput[];
}

/**
 * Input for run_test_suite
 */
export interface RunTestSuiteInput {
  suite: TestSuiteInput;
}

/**
 * Test case result
 */
export interface TestCaseResultOutput {
  name: string;
  status: "passed" | "failed" | "skipped";
  duration: number;
  error?: string;
  actual?: unknown;
  expected?: unknown;
}

/**
 * Output from run_test_suite
 */
export interface RunTestSuiteOutput {
  suiteName: string;
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  duration: number;
  results: TestCaseResultOutput[];
}

// =============================================================================
// STATUS TYPES
// =============================================================================

/**
 * Output from get_connection_status
 */
export interface ConnectionStatusOutput {
  connected: boolean;
  serverUrl: string | null;
  serverInfo: ServerInfo | null;
  historyEnabled: boolean;
  callCount: number;
}

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
  | "teardown";

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
