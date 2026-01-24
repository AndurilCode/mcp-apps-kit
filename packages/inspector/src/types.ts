/**
 * Types for MCP Inspector Server
 */

import type { TestClient } from "@mcp-apps-kit/testing";

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
  /** Tool name to preview */
  tool: string;
  /** Arguments to pass to the tool */
  arguments: Record<string, unknown>;
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
  /** Tool name */
  tool: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
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
  /** Tool name */
  tool: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
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
