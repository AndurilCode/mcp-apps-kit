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
  // UI Inspection types
  UIProtocol,
  UIWidgetInfo,
  ListUIWidgetsOutput,
  GetUIWidgetInput,
  GetUIWidgetOutput,
  UIWidgetMetadata,
  UIWidgetCSP,
  InspectToolUIInput,
  InspectToolUIOutput,
  UIBinding,
  GetUIMetadataInput,
  GetUIMetadataOutput,
  // Preview/Rendering types
  ElementInfo,
  PreviewUIInput,
  PreviewUIOutput,
  ScreenshotWidgetInput,
  ScreenshotWidgetOutput,
  InteractionAction,
  TestWidgetInteractionInput,
  TestWidgetInteractionOutput,
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
  // UI Inspection tools
  createListUIWidgetsTool,
  createGetUIWidgetTool,
  createInspectToolUITool,
  createGetUIMetadataTool,
  // UI Rendering tools
  createPreviewUITool,
  createScreenshotWidgetTool,
  createTestWidgetInteractionTool,
} from "./tools";
