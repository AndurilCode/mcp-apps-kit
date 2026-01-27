/**
 * Tool exports for MCP Inspector Server
 */

export { createConnectTool } from "./connect";
export { createDisconnectTool } from "./disconnect";
export { createListToolsTool } from "./list-tools";
export { createCallToolTool } from "./call-tool";
export { createListResourcesTool } from "./list-resources";
export { createReadResourceTool } from "./read-resource";
export { createListPromptsTool } from "./list-prompts";
export { createGetPromptTool } from "./get-prompt";
export { createGetCallHistoryTool, createClearHistoryTool } from "./history";
export { createRunTestSuiteTool } from "./test-suite";
export { createGetConnectionStatusTool } from "./status";

// UI Inspection tools
export { createListUIWidgetsTool } from "./list-ui-widgets";
export { createGetUIWidgetTool } from "./get-ui-widget";
export { createInspectToolUITool } from "./inspect-tool-ui";
export { createGetUIMetadataTool } from "./get-ui-metadata";

// UI Rendering tools
export { createPreviewUITool } from "./preview-ui";
export { createScreenshotWidgetTool } from "./screenshot-widget";
export { createTestWidgetInteractionTool } from "./test-widget-interaction";
export { createGetConsoleLogsTool } from "./get-console-logs";

// Session Management tools
export {
  createListSessionsTool,
  createCloseSessionTool,
  createCloseAllSessionsTool,
} from "./session-management";

// Environment Configuration tools
export { createSetGlobalsTool, createGetGlobalsTool, createResetGlobalsTool } from "./set-globals";

// Widget control tools (standalone mode - agent owns session flow)
// In standalone mode, the agent creates and owns widget sessions, making these tools useful.
// In dual mode, these tools are NOT exposed because the Playwright mirror is disconnected
// from the external widget's DOM state (no bidirectional sync).
export {
  createWidgetEvaluateTool,
  createWidgetClickTool,
  createWidgetFillTool,
  createWidgetWaitForSelectorTool,
  createWidgetLocatorTool,
  createWidgetDragTool,
  createWidgetRefreshTool,
} from "./widget-control";

// Widget state tool (available in both modes for observation)
export { createGetWidgetStateTool } from "./get-widget-state";

// Widget snapshot tool (accessibility tree - compact alternative to DOM)
export { createWidgetSnapshotTool } from "./widget-snapshot";

// Widget query tool (semantic element discovery)
export { createWidgetQueryTool } from "./widget-query";

// Helper exports (for advanced usage)
export {
  resolveLocator,
  hasLocatorOptions,
  describeLocatorStrategy,
  waitForDOMStability,
} from "./helpers";
export type { SemanticLocatorOptions, WaitForStabilityOptions } from "../types";
