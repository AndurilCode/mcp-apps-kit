/**
 * MCP Inspector Server
 *
 * A meta-MCP server that exposes testing functionality as MCP tools.
 */

import { createApp, type App, type ToolDefs } from "@mcp-apps-kit/core";
import { ConnectionRegistry } from "./connection-registry";
import type { InspectorServerOptions } from "./types";
import {
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
  createListUIWidgetsTool,
  createGetUIWidgetTool,
  createInspectToolUITool,
  createGetUIMetadataTool,
  createPreviewUITool,
  createScreenshotWidgetTool,
  createGetConsoleLogsTool,
  createSetGlobalsTool,
  createGetGlobalsTool,
  createResetGlobalsTool,
  createListSessionsTool,
  createCloseSessionTool,
  createCloseAllSessionsTool,
  // Widget control tools (standalone mode - agent owns session flow)
  createWidgetEvaluateTool,
  createWidgetClickTool,
  createWidgetFillTool,
  createWidgetWaitForSelectorTool,
  createGetWidgetStateTool,
  // Widget snapshot, query, and diff tools (widget_query supersedes widget_locator)
  createWidgetSnapshotTool,
  createWidgetQueryTool,
  createWidgetSnapshotDiffTool,
  createListConnectionsTool,
} from "./tools";

/**
 * Create an MCP Inspector Server
 *
 * @param options - Server options
 * @returns An mcp-apps-kit App instance
 *
 * @example
 * ```typescript
 * import { createInspectorServer } from "@mcp-apps-kit/inspector";
 *
 * const app = createInspectorServer();
 * await app.start({ port: 6274 });
 * ```
 */
export function createInspectorServer(options: InspectorServerOptions = {}): App {
  const registry = new ConnectionRegistry({
    connectionManagerOptions: options,
  });

  // Create all tools with the shared connection registry
  const tools: ToolDefs = {
    connect_to_server: createConnectTool(registry),
    disconnect: createDisconnectTool(registry),
    list_connections: createListConnectionsTool(registry),
    list_tools: createListToolsTool(registry),
    call_tool: createCallToolTool(registry),
    list_resources: createListResourcesTool(registry),
    read_resource: createReadResourceTool(registry),
    list_prompts: createListPromptsTool(registry),
    get_prompt: createGetPromptTool(registry),
    get_call_history: createGetCallHistoryTool(registry),
    clear_history: createClearHistoryTool(registry),
    run_test_suite: createRunTestSuiteTool(registry),
    get_connection_status: createGetConnectionStatusTool(registry),
    // UI Inspection tools
    list_ui_widgets: createListUIWidgetsTool(registry),
    get_ui_widget: createGetUIWidgetTool(registry),
    inspect_tool_ui: createInspectToolUITool(registry),
    get_ui_metadata: createGetUIMetadataTool(registry),
    // UI Rendering tools
    preview_ui: createPreviewUITool(registry),
    screenshot_widget: createScreenshotWidgetTool(registry),
    get_console_logs: createGetConsoleLogsTool(registry),
    // Environment Configuration tools
    set_globals: createSetGlobalsTool(registry),
    get_globals: createGetGlobalsTool(registry),
    reset_globals: createResetGlobalsTool(registry),
    // Session Management tools
    list_sessions: createListSessionsTool(registry),
    close_session: createCloseSessionTool(registry),
    close_all_sessions: createCloseAllSessionsTool(registry),
    // Widget control tools (standalone mode - agent owns session flow)
    widget_evaluate: createWidgetEvaluateTool(registry),
    widget_click: createWidgetClickTool(registry),
    widget_fill: createWidgetFillTool(registry),
    widget_wait_for_selector: createWidgetWaitForSelectorTool(registry),
    get_widget_state: createGetWidgetStateTool(registry),
    // Widget snapshot, query, and diff tools (widget_query supersedes widget_locator)
    widget_snapshot: createWidgetSnapshotTool(registry),
    widget_query: createWidgetQueryTool(registry),
    widget_snapshot_diff: createWidgetSnapshotDiffTool(registry),
  };

  const app = createApp({
    name: "mcp-inspector",
    version: "1.0.0",
    tools,
    config: {
      cors: {
        origin: true,
      },
    },
  });

  return app;
}
