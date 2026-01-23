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
