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
  // Tool types (with hints)
  ToolHints,
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
  // Target server schema types (for dual-mode proxy)
  TargetServerSchema,
  TargetToolInfo,
  TargetResourceInfo,
  TargetPromptInfo,
  // Session source tracking
  SessionSource,
  ProxyMetadata,
  // Event sync types (for 1:1 widget state mirroring in dual mode)
  SyncEventType,
  SyncEventPayload,
  // Accessibility tree types (widget_snapshot)
  AccessibilityNode,
  InteractiveElementSummary,
  WidgetSnapshotInput,
  WidgetSnapshotOutput,
  // Semantic locator types
  SemanticLocatorOptions,
  WaitForStabilityOptions,
  // Widget query types
  WidgetQueryInput,
  QueryElementInfo,
  WidgetQueryOutput,
  // Widget snapshot diff types
  ElementChange,
  WidgetSnapshotDiffInput,
  WidgetSnapshotDiffOutput,
} from "./types";

// =============================================================================
// MAIN EXPORTS
// =============================================================================

export { createInspectorServer } from "./server";
export {
  createStandaloneInspectorServer,
  type StandaloneInspectorServer,
  type StandaloneInspectorServerOptions,
} from "./standalone-server";
export { ConnectionManager } from "./connection";
export { ConnectionRegistry } from "./connection-registry";
export { WidgetServer, type WidgetSession, type CreateSessionResult } from "./widget-server";

// =============================================================================
// DUAL-MODE INSPECTOR (for real testing with ChatGPT)
// =============================================================================

export {
  createDualInspectorServer,
  type DualInspectorServer,
  type DualInspectorServerOptions,
} from "./dual-server";

// Proxy tool generation (for advanced usage)
export { hasTargetSchema, registerProxyToolsDirectly } from "./proxy-tools";

// Proxy resource generation (for advanced usage)
export { registerProxyResources, hasUIResources, type ProxyResourceInfo } from "./proxy-resources";

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
  createListConnectionsTool,
  // UI Inspection tools
  createListUIWidgetsTool,
  createGetUIWidgetTool,
  createInspectToolUITool,
  createGetUIMetadataTool,
  // UI Rendering tools
  createPreviewUITool,
  createScreenshotWidgetTool,
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Exported for backwards compatibility
  createTestWidgetInteractionTool,
  // Widget snapshot, query, and diff tools
  createWidgetSnapshotTool,
  createWidgetQueryTool,
  createWidgetSnapshotDiffTool,
  // Semantic locator helpers
  resolveLocator,
  hasLocatorOptions,
  describeLocatorStrategy,
  waitForDOMStability,
} from "./tools";

// Debug / logging
export { createLogger, defaultLogger } from "./debug/logger";
export type { Logger, LogLevel } from "./debug/logger";
