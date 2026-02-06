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

import { createApp, type App, type ToolDefs, type ToolDef } from "@mcp-apps-kit/core";
import type { Server } from "http";
import http from "http";
import { z } from "zod";
import { ConnectionManager, inferProtocolType, type ProtocolType } from "./connection";
import { ConnectionRegistry } from "./connection-registry";
import type { InspectorServerOptions } from "./types";
import { handleDashboardRequest } from "./dashboard/dashboard-server";
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
  createWidgetDragTool,
  createWidgetRefreshTool,
  createGetWidgetStateTool,
  // Widget snapshot, query, and diff tools (widget_query supersedes widget_locator)
  createWidgetSnapshotTool,
  createWidgetQueryTool,
  createWidgetSnapshotDiffTool,
  createListConnectionsTool,
} from "./tools";
import type { InspectorEventType } from "./types";
import { handleOAuthRoutes } from "./oauth/callback-handler";
import type { InspectorOAuthProvider } from "./oauth/provider";

// =============================================================================
// VALID INSPECTOR EVENT TYPES (for validation)
// =============================================================================

/**
 * Set of valid InspectorEventType values for runtime validation
 */
const VALID_INSPECTOR_EVENT_TYPES: ReadonlySet<string> = new Set([
  "tool-input",
  "tool-input-partial",
  "tool-output",
  "tool-result",
  "tool-cancelled",
  "call-tool",
  "call-tool-response",
  "globals",
  "host-context-changed",
  "dom-click",
  "dom-dblclick",
  "dom-input",
  "dom-change",
  "dom-focus",
  "dom-blur",
  "dom-scroll",
  "dom-keydown",
  "dom-keyup",
  "dom-select",
  "dom-hover",
  "dom-drag",
  "initialize",
  "teardown",
  "session-created",
  "session-closed",
  "page-error",
  "dialog",
  "agent-tool-call",
  "agent-tool-result",
]);

/**
 * Type guard to check if a string is a valid InspectorEventType
 */
function isValidInspectorEventType(type: unknown): type is InspectorEventType {
  return typeof type === "string" && VALID_INSPECTOR_EVENT_TYPES.has(type);
}

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

// =============================================================================
// REASONING SCHEMA EXTENSION (for agent view)
// =============================================================================

/**
 * Description for the reasoning field added to all tools
 */
const REASONING_DESCRIPTION =
  "Brief explanation of why you're calling this tool. This helps with debugging and provides transparency in the agent view.";

/**
 * Reasoning field schema to be added to all tools
 */
const reasoningFieldShape = {
  reasoning: z.string().optional().describe(REASONING_DESCRIPTION),
};

/**
 * Extend each tool's input schema with an optional `reasoning` field.
 *
 * This allows the agent to provide context for why it's calling each tool,
 * which is displayed in the inspector's Agent panel for debugging and transparency.
 *
 * Uses ZodObject.extend() instead of z.intersection() because the core framework's
 * extractZodShape() only handles ZodObject instances. z.intersection() creates a
 * ZodIntersection which gets wrapped as { value: schema }, breaking all tool input parsing.
 *
 * @param tools - Original tool definitions
 * @returns Tool definitions with reasoning field added to each input schema
 */
function addReasoningToTools(tools: ToolDefs): ToolDefs {
  const enhanced: ToolDefs = {};
  for (const [name, tool] of Object.entries(tools)) {
    const originalTool = tool as ToolDef;
    // Use .extend() to preserve ZodObject type for extractZodShape() compatibility
    if (originalTool.input instanceof z.ZodObject) {
      const extendedInput = (originalTool.input as z.ZodObject<Record<string, z.ZodType>>).extend(
        reasoningFieldShape
      );
      enhanced[name] = {
        ...originalTool,
        input: extendedInput,
      } as ToolDef;
    } else {
      // Non-object schemas (shouldn't happen for inspector tools) - skip reasoning
      enhanced[name] = originalTool;
    }
  }
  return enhanced;
}

/**
 * Options for creating a standalone inspector server
 */
export interface StandaloneInspectorServerOptions extends InspectorServerOptions {
  /** Port to run on. Default: 6274 */
  port?: number;
  /** Maximum number of concurrent connections. Default: 20 */
  maxConnections?: number;
  /** Pre-built OAuth provider for auto-connect mode (e.g., from CLI preset flags) */
  oauthProvider?: InspectorOAuthProvider;
}

/**
 * Standalone inspector server instance
 */
export interface StandaloneInspectorServer {
  /** Start the server */
  start: (port?: number) => Promise<void>;
  /** Stop the server */
  stop: () => Promise<void>;
  /** Get the connection manager (active connection) */
  getConnectionManager: () => ConnectionManager;
  /** Get the connection registry */
  getRegistry: () => ConnectionRegistry;
  /** Get the MCP app */
  getApp: () => App;
  /** Get the underlying HTTP server */
  getHttpServer: () => Server | null;
}

/**
 * Create all inspector tools with the shared connection manager
 */
function createInspectorTools(registry: ConnectionRegistry): ToolDefs {
  return {
    connect_to_server: createConnectTool(registry),
    disconnect: createDisconnectTool(registry),
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
    list_connections: createListConnectionsTool(registry),
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
    widget_drag: createWidgetDragTool(registry),
    widget_refresh: createWidgetRefreshTool(registry),
    get_widget_state: createGetWidgetStateTool(registry),
    // Widget snapshot, query, and diff tools (widget_query supersedes widget_locator)
    widget_snapshot: createWidgetSnapshotTool(registry),
    widget_query: createWidgetQueryTool(registry),
    widget_snapshot_diff: createWidgetSnapshotDiffTool(registry),
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
  const registry = new ConnectionRegistry({
    connectionManagerOptions: options,
    maxConnections: options.maxConnections ?? 20,
  });
  // Keep a reference for backward-compat APIs that need a single ConnectionManager
  let connectionManager: ConnectionManager | null = null;
  registry.on("created", (_id: string, cm: ConnectionManager) => {
    connectionManager = cm;
  });

  /** Get the active connection manager, or null if none */
  const getActiveConnectionManager = (): ConnectionManager | null => {
    try {
      return registry.getActiveConnection();
    } catch {
      return connectionManager;
    }
  };

  const defaultPort = options.port ?? 6274;
  const targetUrl = options.targetUrl;
  const presetOAuthProvider = options.oauthProvider;

  // Create MCP app with inspector tools
  // Add reasoning field to all tools for agent view transparency
  // Filter out connection tools when auto-connect mode is enabled (targetUrl provided)
  const allTools = createInspectorTools(registry);
  const toolsWithReasoning = addReasoningToTools(allTools);
  const tools = filterConnectionTools(toolsWithReasoning, !!targetUrl);
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

  // Ready flag to prevent handling requests before auto-connect completes
  // When targetUrl is provided, server is not ready until connect succeeds
  let isReady = !targetUrl;

  // Helper to handle requests
  const handleRequest = async (
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> => {
    const url = req.url ?? "/";

    // Return 503 if server is not ready (auto-connect in progress)
    // Allow health check to always respond for monitoring purposes
    if (!isReady && url !== "/health") {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Service unavailable",
          message: "Server is starting up, auto-connect in progress",
        })
      );
      return;
    }

    // OAuth routes (/oauth/callback + /api/oauth/*)
    if (url.startsWith("/oauth/") || url.startsWith("/api/oauth/")) {
      const handled = await handleOAuthRoutes(req, res, registry, getActiveConnectionManager);
      if (handled) return;
    }

    // Health check
    if (url === "/health") {
      const cm = getActiveConnectionManager();
      const state = cm?.getState() ?? { connected: false, serverUrl: null, serverInfo: null };
      const schema = cm?.getTargetSchema() ?? null;
      const protocolType: ProtocolType | null =
        state.connected && schema ? inferProtocolType(schema.tools) : null;
      const body = JSON.stringify({
        status: "ok",
        name: "mcp-inspector",
        mode: "standalone",
        connectionCount: registry.listConnections().length,
        connection: {
          connected: state.connected,
          serverUrl: state.serverUrl,
          serverName: state.serverInfo?.name ?? null,
          toolCount: schema?.tools.length ?? 0,
          resourceCount: schema?.resources.length ?? 0,
          promptCount: schema?.prompts.length ?? 0,
          protocolType,
        },
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(body);
      return;
    }

    // API: Connect to a target server
    if (url === "/api/connect") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === "POST") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const bodyData = Buffer.concat(chunks);

        try {
          const data = JSON.parse(bodyData.toString("utf-8")) as {
            url?: string;
            force?: boolean;
          };

          if (!data.url) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: "Missing url parameter" }));
            return;
          }

          // Create a new connection via registry
          const { id, connectionManager: cm } = await registry.createConnection({
            transport: "http",
            url: data.url,
          });
          const schema = cm.getTargetSchema();
          const protocolType = schema ? inferProtocolType(schema.tools) : "mcp";

          const result = cm.getState();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: true,
              connectionId: id,
              connected: true,
              serverUrl: data.url,
              serverInfo: result.serverInfo,
              toolCount: schema?.tools.length ?? 0,
              resourceCount: schema?.resources.length ?? 0,
              promptCount: schema?.prompts.length ?? 0,
              protocolType,
            })
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: message }));
        }
        return;
      }

      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    // API: Disconnect from current server
    if (url === "/api/disconnect") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === "POST") {
        try {
          const cm = getActiveConnectionManager();
          if (!cm) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: "No active connection" }));
            return;
          }
          const previousUrl = cm.getState().serverUrl;
          await registry.closeConnection(cm.id);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: true,
              disconnected: true,
              previousUrl,
            })
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: message }));
        }
        return;
      }

      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
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

        // Parse body outside of try/catch so toolName is available in catch
        let sessionId: string | undefined;
        let toolName: string;
        let args: Record<string, unknown>;

        try {
          const parsed = JSON.parse(bodyData.toString("utf-8")) as {
            sessionId?: string;
            toolName: string;
            args: Record<string, unknown>;
            messageId?: string | number;
            callId?: number;
          };
          sessionId = parsed.sessionId;
          toolName = parsed.toolName;
          args = parsed.args;
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON body" }));
          return;
        }

        try {
          const connectionManager = getActiveConnectionManager();
          if (!connectionManager) {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: "No active connection",
                message: "Use connect_to_server tool first",
              })
            );
            return;
          }

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

    // Record event endpoint - for host pages to report lifecycle and DOM events
    if (url === "/record-event") {
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
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const bodyData = Buffer.concat(chunks);

        try {
          const { sessionId, type, payload, source, protocol } = JSON.parse(
            bodyData.toString("utf-8")
          ) as {
            sessionId: string;
            type: string;
            payload: unknown;
            source?: "widget" | "host" | "server";
            protocol?: "mcp" | "openai";
          };

          // Validate that type is a valid InspectorEventType
          if (!isValidInspectorEventType(type)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: "Invalid event type",
                message: `Type "${type}" is not a valid InspectorEventType`,
              })
            );
            return;
          }

          const connectionManager = getActiveConnectionManager();
          if (!connectionManager) {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: "No active connection",
                message: "Use connect_to_server tool first",
              })
            );
            return;
          }
          const sessionManager = connectionManager.getWidgetSessionManager();
          sessionManager.recordEvent(sessionId, type, payload, source ?? "host", protocol);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid payload" }));
        }
        return;
      }

      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    // Environment update endpoint - for standalone mode widgets to update displayMode/viewport
    if (url === "/update-environment") {
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
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const bodyData = Buffer.concat(chunks);

        try {
          const data = JSON.parse(bodyData.toString("utf-8")) as {
            sessionId: string;
            globals: Record<string, unknown>;
          };

          const connectionManager = getActiveConnectionManager();
          if (!connectionManager) {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: "No active connection",
                message: "Use connect_to_server tool first",
              })
            );
            return;
          }

          // Update the connection manager's environment state
          connectionManager.updateEnvironmentFromGlobals(data.globals);

          // Resize the Playwright viewport for the specific session
          const sessionManager = connectionManager.getWidgetSessionManager();
          const currentEnvState = connectionManager.getEnvironmentState();

          // Clamp viewport height to maxHeight for inline mode
          // Fullscreen mode has maxHeight=null so no clamping occurs
          if (
            currentEnvState.displayMode !== "fullscreen" &&
            currentEnvState.maxHeight !== null &&
            currentEnvState.maxHeight !== undefined &&
            currentEnvState.viewport
          ) {
            const clampedViewport = {
              ...currentEnvState.viewport,
              height: Math.min(currentEnvState.viewport.height, currentEnvState.maxHeight),
            };
            currentEnvState.viewport = clampedViewport;
            // Persist clamped viewport back to shared environment state
            connectionManager.updateEnvironmentFromGlobals({ viewport: clampedViewport });
          }

          // Use the environment state which now includes the updated displayMode/viewport
          const updated = await sessionManager.updateSessionGlobals(
            data.sessionId,
            currentEnvState
          );

          if (options.debug) {
            // eslint-disable-next-line no-console
            console.log(
              `[inspector] Environment updated from widget, session ${data.sessionId}, resized: ${updated}`
            );
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, updated, environmentState: currentEnvState }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: message }));
        }
        return;
      }

      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    // Handle /mcp/primitives before routing to MCP app (supports ?connectionId=...)
    if (url.startsWith("/mcp/primitives") && req.method === "GET") {
      const handled = await handleDashboardRequest(
        req,
        res,
        getActiveConnectionManager(),
        registry
      );
      if (handled) return;
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

      // Track inspector tool calls and agent initialization for the Agent panel
      let inspectorToolCall: { name: string; arguments: unknown; startTime: number } | null = null;
      if (body.length > 0) {
        try {
          const parsed = JSON.parse(body.toString("utf-8")) as {
            method?: string;
            params?: { name?: string; arguments?: unknown };
          };

          const connectionManager = getActiveConnectionManager();

          // Check for MCP initialize request (agent detection)
          if (connectionManager) {
            connectionManager.maybeRecordInitialize(parsed);
          }

          // Check if this is a tools/call request (MCP JSON-RPC)
          if (parsed.method === "tools/call" && parsed.params?.name) {
            inspectorToolCall = {
              name: parsed.params.name,
              arguments: parsed.params.arguments,
              startTime: Date.now(),
            };
            // Record inspector tool call event
            if (connectionManager) {
              const eventPayload: Record<string, unknown> = {
                name: inspectorToolCall.name,
                arguments: inspectorToolCall.arguments,
                source: "inspector",
              };
              // Extract reasoning from tool arguments (it's part of the input schema)
              const args = parsed.params.arguments as Record<string, unknown> | undefined;
              if (args && typeof args.reasoning === "string" && args.reasoning.length > 0) {
                eventPayload.reasoning = args.reasoning;
              }
              connectionManager.recordAgentEvent("agent-tool-call", eventPayload);
            }
          }
        } catch {
          // Parse failures handled silently — non-JSON bodies on MCP endpoints are expected
          // (e.g., SSE connections, partial uploads). Debug logging omitted to avoid noise.
        }
      }

      const webRequest = new Request(requestUrl, {
        method: req.method ?? "GET",
        headers: Object.entries(req.headers)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : v]) as [string, string][],
        body: body.length > 0 && req.method !== "GET" && req.method !== "HEAD" ? body : undefined,
      });

      const webResponse = await app.handleRequest(webRequest);

      // Record inspector tool result if this was a tool call
      if (inspectorToolCall) {
        const duration = Date.now() - inspectorToolCall.startTime;
        // Try to parse response to check for errors and extract result
        let isError = webResponse.status >= 400;
        let result: unknown;
        try {
          const responseClone = webResponse.clone();
          const responseText = await responseClone.text();
          const responseJson = JSON.parse(responseText) as {
            error?: unknown;
            result?: { isError?: boolean };
          };
          if (responseJson.error) {
            isError = true;
            result = responseJson.error;
          } else if (responseJson.result) {
            if (
              typeof responseJson.result === "object" &&
              responseJson.result !== null &&
              "isError" in responseJson.result &&
              responseJson.result.isError
            ) {
              isError = true;
            }
            result = responseJson.result;
          }
        } catch {
          // Ignore parse errors
        }
        const connectionManager = getActiveConnectionManager();
        if (connectionManager) {
          connectionManager.recordAgentEvent("agent-tool-result", {
            name: inspectorToolCall.name,
            isError,
            duration,
            result,
            source: "inspector",
          });
        }
      }

      // Convert Web Response to Node response
      res.writeHead(webResponse.status, Object.fromEntries(webResponse.headers.entries()));
      const responseBody = await webResponse.arrayBuffer();
      res.end(Buffer.from(responseBody));
      return;
    }

    // Dashboard routes
    if (url.startsWith("/dashboard")) {
      const handled = await handleDashboardRequest(
        req,
        res,
        getActiveConnectionManager(),
        registry
      );
      if (handled) return;
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
            // Use 127.0.0.1 instead of localhost to match widget server origin (avoids CORS issues)
            // Set inspector URL on any future connections
            const inspectorUrl = `http://127.0.0.1:${port}`;
            registry.on("created", (_id: string, cm: ConnectionManager) => {
              cm.setInspectorUrl(inspectorUrl);
            });

            // Auto-connect if targetUrl is provided
            if (targetUrl) {
              void registry
                .createConnection(
                  { transport: "http", url: targetUrl },
                  { trackHistory: true, authProvider: presetOAuthProvider }
                )
                .then(({ id, connectionManager: cm }) => {
                  // Check if connect() silently detected auth requirement
                  // (returns zero counts + stores discovery results for dashboard panel)
                  // In CLI auto-connect, this should be treated as a failure
                  // so the CLI's handleAutoAuth can trigger the browser auth flow.
                  const discovery = cm.getDiscoveryResults();
                  if (discovery) {
                    // Clean up the unusable connection
                    void registry.closeConnection(id).catch(() => {});
                    httpServer?.close();
                    // Use "Unauthorized" so isAuthError() in the CLI catch block matches
                    reject(
                      new Error(
                        `Auto-connect to ${targetUrl} failed: Unauthorized (server requires OAuth authentication)`
                      )
                    );
                    return;
                  }

                  // Mark server as ready now that auto-connect succeeded
                  isReady = true;
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
      // Close all connections (including their widget sessions)
      await registry.closeAll();

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

    getConnectionManager: () => {
      if (!connectionManager) {
        throw new Error("No active connection. Call connect_to_server first.");
      }
      return connectionManager;
    },
    getRegistry: () => registry,
    getApp: () => app,
    getHttpServer: () => httpServer,
  };
}
