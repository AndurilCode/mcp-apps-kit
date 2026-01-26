/**
 * MCP Inspector Server
 *
 * A meta-MCP server that exposes testing functionality as MCP tools.
 */

import { createApp, type App, type ToolDefs } from "@mcp-apps-kit/core";
import { ConnectionManager } from "./connection";
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
  createTestWidgetInteractionTool,
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
  createWidgetLocatorTool,
  createGetWidgetStateTool,
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
  const connectionManager = new ConnectionManager(options);

  // Create all tools with the shared connection manager
  const tools: ToolDefs = {
    connect_to_server: createConnectTool(connectionManager),
    disconnect: createDisconnectTool(connectionManager),
    list_tools: createListToolsTool(connectionManager),
    call_tool: createCallToolTool(connectionManager),
    list_resources: createListResourcesTool(connectionManager),
    read_resource: createReadResourceTool(connectionManager),
    list_prompts: createListPromptsTool(connectionManager),
    get_prompt: createGetPromptTool(connectionManager),
    get_call_history: createGetCallHistoryTool(connectionManager),
    clear_history: createClearHistoryTool(connectionManager),
    run_test_suite: createRunTestSuiteTool(connectionManager),
    get_connection_status: createGetConnectionStatusTool(connectionManager),
    // UI Inspection tools
    list_ui_widgets: createListUIWidgetsTool(connectionManager),
    get_ui_widget: createGetUIWidgetTool(connectionManager),
    inspect_tool_ui: createInspectToolUITool(connectionManager),
    get_ui_metadata: createGetUIMetadataTool(connectionManager),
    // UI Rendering tools
    preview_ui: createPreviewUITool(connectionManager),
    screenshot_widget: createScreenshotWidgetTool(connectionManager),
    test_widget_interaction: createTestWidgetInteractionTool(connectionManager),
    get_console_logs: createGetConsoleLogsTool(connectionManager),
    // Environment Configuration tools
    set_globals: createSetGlobalsTool(connectionManager),
    get_globals: createGetGlobalsTool(connectionManager),
    reset_globals: createResetGlobalsTool(connectionManager),
    // Session Management tools
    list_sessions: createListSessionsTool(connectionManager),
    close_session: createCloseSessionTool(connectionManager),
    close_all_sessions: createCloseAllSessionsTool(connectionManager),
    // Widget control tools (standalone mode - agent owns session flow)
    widget_evaluate: createWidgetEvaluateTool(connectionManager),
    widget_click: createWidgetClickTool(connectionManager),
    widget_fill: createWidgetFillTool(connectionManager),
    widget_wait_for_selector: createWidgetWaitForSelectorTool(connectionManager),
    widget_locator: createWidgetLocatorTool(connectionManager),
    get_widget_state: createGetWidgetStateTool(connectionManager),
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
