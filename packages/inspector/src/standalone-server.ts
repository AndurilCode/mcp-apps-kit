/**
 * Standalone Inspector Server
 *
 * Creates a standalone MCP inspector server with custom HTTP endpoints:
 * - /mcp: MCP protocol endpoint (all inspector tools available)
 * - /execute-tool: Execute widget tool calls on the connected MCP server
 * - /health: Health check endpoint
 *
 * This server is used for standalone mode where the agent owns the session flow
 * and can interact with widgets via widget_click, widget_fill, etc.
 */

import { createApp, type App, type ToolDefs } from "@mcp-apps-kit/core";
import type { Server } from "http";
import http from "http";
import { ConnectionManager } from "./connection";
import type { InspectorServerOptions } from "./types";

// =============================================================================
// TOOL FILTERING (for auto-connect mode)
// =============================================================================

/**
 * Connection tools to filter out when auto-connect mode is enabled
 */
const CONNECTION_TOOLS = ["connect_to_server", "disconnect"] as const;

/**
 * Filter connection tools from the tool definitions
 * @param tools - All inspector tools
 * @param exclude - Whether to exclude connection tools
 * @returns Filtered tool definitions
 */
function filterConnectionTools(tools: ToolDefs, exclude: boolean): ToolDefs {
  if (!exclude) return tools;

  const filtered: ToolDefs = {};
  for (const [name, tool] of Object.entries(tools)) {
    if (!CONNECTION_TOOLS.includes(name as (typeof CONNECTION_TOOLS)[number])) {
      filtered[name] = tool;
    }
  }
  return filtered;
}
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
  createWidgetDragTool,
  createWidgetRefreshTool,
  createGetWidgetStateTool,
} from "./tools";

/**
 * Options for creating a standalone inspector server
 */
export interface StandaloneInspectorServerOptions extends InspectorServerOptions {
  /** Port to run on. Default: 6274 */
  port?: number;
}

/**
 * Standalone inspector server instance
 */
export interface StandaloneInspectorServer {
  /** Start the server */
  start: (port?: number) => Promise<void>;
  /** Stop the server */
  stop: () => Promise<void>;
  /** Get the connection manager */
  getConnectionManager: () => ConnectionManager;
  /** Get the MCP app */
  getApp: () => App;
  /** Get the underlying HTTP server */
  getHttpServer: () => Server | null;
}

/**
 * Create all inspector tools with the shared connection manager
 */
function createInspectorTools(connectionManager: ConnectionManager): ToolDefs {
  return {
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
    widget_drag: createWidgetDragTool(connectionManager),
    widget_refresh: createWidgetRefreshTool(connectionManager),
    get_widget_state: createGetWidgetStateTool(connectionManager),
  };
}

/**
 * Create a standalone MCP Inspector Server with custom HTTP endpoints
 *
 * @example
 * ```typescript
 * import { createStandaloneInspectorServer } from "@mcp-apps-kit/inspector";
 *
 * const server = createStandaloneInspectorServer();
 * await server.start(6274);
 *
 * // MCP endpoint: http://localhost:6274/mcp
 * // Tool execution: http://localhost:6274/execute-tool
 * ```
 */
export function createStandaloneInspectorServer(
  options: StandaloneInspectorServerOptions = {}
): StandaloneInspectorServer {
  const connectionManager = new ConnectionManager(options);
  const defaultPort = options.port ?? 6274;
  const targetUrl = options.targetUrl;

  // Create MCP app with inspector tools
  // Filter out connection tools when auto-connect mode is enabled (targetUrl provided)
  const allTools = createInspectorTools(connectionManager);
  const tools = filterConnectionTools(allTools, !!targetUrl);
  const app = createApp({
    name: "mcp-inspector",
    version: "1.0.0",
    tools,
    config: {
      cors: { origin: true },
    },
  });

  // HTTP server (created on start)
  let httpServer: Server | null = null;

  // Helper to handle requests
  const handleRequest = async (
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> => {
    const url = req.url ?? "/";

    // Health check
    if (url === "/health") {
      const state = connectionManager.getState();
      const body = JSON.stringify({
        status: "ok",
        name: "mcp-inspector",
        mode: "standalone",
        connection: {
          connected: state.connected,
          serverUrl: state.serverUrl,
        },
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(body);
      return;
    }

    // Execute tool endpoint - for widget tool calls
    if (url === "/execute-tool") {
      // Handle CORS for cross-origin widget requests
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === "POST") {
        // Read body
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const bodyData = Buffer.concat(chunks);

        try {
          const { sessionId, toolName, args } = JSON.parse(bodyData.toString("utf-8")) as {
            sessionId?: string;
            toolName: string;
            args: Record<string, unknown>;
            messageId?: string | number;
            callId?: number;
          };

          // Check if connected to a server
          const state = connectionManager.getState();
          if (!state.connected) {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: "Not connected to server",
                message: "Use connect_to_server tool first",
              })
            );
            return;
          }

          // Execute the tool on the connected server
          const client = connectionManager.getClient();
          const result = await client.callTool(toolName, args);

          // Extract structured result for recording
          let toolResult: unknown;
          if (result.structuredContent) {
            toolResult = result.structuredContent;
          } else if (result.content.length > 0) {
            const textContent = result.content.find(
              (c: { type: string; text?: string }) => c.type === "text"
            );
            if (textContent?.text) {
              try {
                toolResult = JSON.parse(textContent.text);
              } catch {
                toolResult = textContent.text;
              }
            }
          }

          // Record the tool call with result in the session (if sessionId provided)
          if (sessionId) {
            const sessionManager = connectionManager.getWidgetSessionManager();
            sessionManager.recordToolCall(
              sessionId,
              toolName,
              args,
              toolResult,
              result.isError ?? false
            );
          }

          // Return the result in the format expected by the widget
          // MCP format: { content: [...], isError?: boolean }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              content: result.content,
              isError: result.isError,
              structuredContent: result.structuredContent,
            })
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "Tool execution failed",
              message,
            })
          );
        }
        return;
      }

      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    // Route MCP requests to the app
    if (url.startsWith("/mcp")) {
      // Convert to Web Request
      const protocol = "http";
      const host = req.headers.host ?? "localhost";
      const requestUrl = `${protocol}://${host}${url}`;

      // Read body
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const body = Buffer.concat(chunks);

      const webRequest = new Request(requestUrl, {
        method: req.method ?? "GET",
        headers: Object.entries(req.headers)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : v]) as [string, string][],
        body: body.length > 0 && req.method !== "GET" && req.method !== "HEAD" ? body : undefined,
      });

      const webResponse = await app.handleRequest(webRequest);

      // Convert Web Response to Node response
      res.writeHead(webResponse.status, Object.fromEntries(webResponse.headers.entries()));
      const responseBody = await webResponse.arrayBuffer();
      res.end(Buffer.from(responseBody));
      return;
    }

    // 404 for other paths
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  };

  return {
    start: async (port = defaultPort) => {
      return new Promise<void>((resolve, reject) => {
        try {
          httpServer = http.createServer((req, res) => {
            void handleRequest(req, res).catch((error: unknown) => {
              // eslint-disable-next-line no-console
              console.error("[inspector] Request error:", error);
              if (!res.headersSent) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Internal server error" }));
              }
            });
          });
          httpServer.listen(port, () => {
            // Set inspector URL for widget tool call execution
            connectionManager.setInspectorUrl(`http://localhost:${port}`);

            // Auto-connect if targetUrl is provided
            if (targetUrl) {
              void connectionManager
                .connect(targetUrl, { trackHistory: true })
                .then(() => {
                  if (options.debug) {
                    // eslint-disable-next-line no-console
                    console.log(`[inspector] Auto-connected to: ${targetUrl}`);
                  }
                  resolve();
                })
                .catch((error: unknown) => {
                  const message = error instanceof Error ? error.message : String(error);
                  // eslint-disable-next-line no-console
                  console.error(`[inspector] Auto-connect failed: ${message}`);
                  // Close the HTTP server since we can't proceed
                  httpServer?.close();
                  reject(new Error(`Auto-connect to ${targetUrl} failed: ${message}`));
                });
            } else {
              resolve();
            }
          });
          httpServer.on("error", (err: Error) => {
            reject(err);
          });
        } catch (error: unknown) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },

    stop: async () => {
      // Close all widget sessions
      await connectionManager.getWidgetSessionManager().dispose();

      // Disconnect from target if connected
      if (connectionManager.getState().connected) {
        await connectionManager.disconnect();
      }

      // Close HTTP server
      return new Promise<void>((resolve, reject) => {
        if (!httpServer) {
          resolve();
          return;
        }
        httpServer.close((err) => {
          if (err) {
            reject(err);
          } else {
            httpServer = null;
            resolve();
          }
        });
      });
    },

    getConnectionManager: () => connectionManager,
    getApp: () => app,
    getHttpServer: () => httpServer,
  };
}
