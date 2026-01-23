/**
 * @mcp-apps-kit/inspector
 *
 * MCP Inspector Server - Test and debug MCP servers through any MCP client.
 *
 * @example
 * ```typescript
 * import { createInspectorServer } from "@mcp-apps-kit/inspector";
 *
 * const app = createInspectorServer();
 * await app.start({ port: 6274 });
 * ```
 */

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type {
  InspectorServerOptions,
  ConnectOptions,
  ServerInfo,
  ConnectionState,
  ConnectInput,
  ConnectOutput,
  DisconnectOutput,
  ToolInfo,
  CallToolInput,
  CallToolOutput,
  ContentBlock,
  ResourceInfo,
  ReadResourceInput,
  ReadResourceOutput,
  PromptInfo,
  GetPromptInput,
  GetPromptOutput,
  PromptMessage,
  HistoryEntry,
  HistoryOutput,
  ClearHistoryOutput,
  TestCaseInput,
  TestSuiteInput,
  RunTestSuiteInput,
  RunTestSuiteOutput,
  TestCaseResultOutput,
  ConnectionStatusOutput,
} from "./types";

// =============================================================================
// MAIN EXPORTS
// =============================================================================

export { createInspectorServer } from "./server";
export { ConnectionManager } from "./connection";

// =============================================================================
// TOOL CREATORS (for advanced usage)
// =============================================================================

export {
  createConnectTool,
  createDisconnectTool,
  createListToolsTool,
  createCallToolTool,
  createListResourcesTool,
  createReadResourceTool,
  createListPromptsTool,
  createGetPromptTool,
  createGetCallHistoryTool,
  createClearHistoryTool,
  createRunTestSuiteTool,
  createGetConnectionStatusTool,
} from "./tools";
