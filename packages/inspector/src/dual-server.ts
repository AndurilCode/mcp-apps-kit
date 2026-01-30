/**
 * Dual Inspector Server
 *
 * Creates a dual-endpoint MCP inspector where:
 * - /apps/mcp: Dynamically proxies connected target server's tools (for ChatGPT/MCP Apps)
 * - /agent/mcp: Has observation-only inspector tools (for coding agents like Claude Code)
 *
 * Both endpoints share the same ConnectionManager and session state.
 *
 * Lifecycle:
 * - On start: Only /agent/mcp is available
 * - On connect_to_server: /apps/mcp is created with proxy tools and resources
 * - /apps/mcp supports ONE target connection per lifecycle (restart to change target)
 */

import { createApp, type App, type ToolDefs } from "@mcp-apps-kit/core";
import type { Server } from "http";
import http from "http";
import { ConnectionManager, inferProtocolType, type ProtocolType } from "./connection";
import { ConnectionRegistry } from "./connection-registry";
import type {
  InspectorServerOptions,
  TargetServerSchema,
  McpServerLike,
  SyncEventPayload,
} from "./types";
import { registerProxyToolsDirectly } from "./proxy-tools";
import { registerProxyResources } from "./proxy-resources";
import { handleDashboardRequest } from "./dashboard/dashboard-server";
import {
  createConnectTool,
  createDisconnectTool,
  createListToolsTool,
  createListResourcesTool,
  createListPromptsTool,
  createGetConnectionStatusTool,
  createListConnectionsTool,
  createGetCallHistoryTool,
  createListSessionsTool,
  createGetConsoleLogsTool,
  createScreenshotWidgetTool,
  createGetGlobalsTool,
  // Widget state observation (read-only, kept in dual mode)
  createGetWidgetStateTool,
} from "./tools";

/**
 * Options for creating a dual inspector server
 */
export interface DualInspectorServerOptions extends InspectorServerOptions {
  /** Port to run on. Default: 6274 */
  port?: number;
  /** Maximum number of concurrent connections. Default: 20 */
  maxConnections?: number;
}

/**
 * Dual inspector server instance
 */
export interface DualInspectorServer {
  /** Start the server */
  start: (port?: number) => Promise<void>;
  /** Stop the server */
  stop: () => Promise<void>;
  /** Get the connection manager (active connection) */
  getConnectionManager: () => ConnectionManager;
  /** Get the connection registry */
  getRegistry: () => ConnectionRegistry;
  /** Get the agent app (/agent/mcp) */
  getAgentApp: () => App;
  /** Get the apps app (/apps/mcp) - null until connected to target */
  getAppsApp: () => App | null;
  /** Get the underlying HTTP server */
  getHttpServer: () => Server | null;
}

/**
 * Create observation-only tools for the agent endpoint
 *
 * In dual mode, the agent can only observe sessions created by /apps/mcp.
 * Widget control tools (widget_click, widget_fill, etc.) are NOT available here
 * because the Playwright mirror is disconnected from the external widget's DOM state.
 * Without bidirectional sync, clicking/filling in the mirror doesn't affect the external widget.
 *
 * Observation tools available:
 * - connect_to_server: Connect to a target server
 * - disconnect: Disconnect from current server
 * - list_tools: List target server tools
 * - list_resources: List target server resources
 * - list_prompts: List target server prompts
 * - get_connection_status: Get connection state
 * - get_call_history: Get call history
 * - list_sessions: List active widget sessions
 * - get_console_logs: Get console logs from a session
 * - screenshot_widget: Take screenshot of a session
 * - get_globals: Get current environment state
 * - get_widget_state: Get current widget DOM/form state (read-only)
 *
 * NOT available (no bidirectional sync with external widget):
 * - widget_click, widget_fill, widget_evaluate, widget_locator, widget_wait_for_selector
 * - set_globals, reset_globals
 * - call_tool (use /apps/mcp instead)
 * - test_widget_interaction
 * - preview_ui
 */
function createAgentTools(registry: ConnectionRegistry): ToolDefs {
  return {
    // Connection management
    connect_to_server: createConnectTool(registry),
    disconnect: createDisconnectTool(registry),
    list_connections: createListConnectionsTool(registry),

    // Read-only inspection tools
    list_tools: createListToolsTool(registry),
    list_resources: createListResourcesTool(registry),
    list_prompts: createListPromptsTool(registry),
    get_connection_status: createGetConnectionStatusTool(registry),

    // History observation (read-only)
    get_call_history: createGetCallHistoryTool(registry),

    // Session observation (read-only)
    list_sessions: createListSessionsTool(registry),
    get_console_logs: createGetConsoleLogsTool(registry),
    screenshot_widget: createScreenshotWidgetTool(registry),

    // Environment reading (no mutation)
    get_globals: createGetGlobalsTool(registry),

    // Widget state observation (read-only) - can observe but not interact
    get_widget_state: createGetWidgetStateTool(registry),
  };
}

/**
 * Create a dual-endpoint MCP inspector server
 *
 * @example
 * ```typescript
 * import { createDualInspectorServer } from "@mcp-apps-kit/inspector";
 *
 * const server = createDualInspectorServer();
 * await server.start(6274);
 *
 * // Coding agent connects to: http://localhost:6274/agent/mcp
 * // ChatGPT connects to: http://localhost:6274/apps/mcp
 *
 * // Agent calls connect_to_server to connect to target
 * // ChatGPT then sees target's tools proxied on /apps/mcp
 * ```
 */
export function createDualInspectorServer(
  options: DualInspectorServerOptions = {}
): DualInspectorServer {
  const registry = new ConnectionRegistry({
    connectionManagerOptions: options,
    maxConnections: options.maxConnections ?? 20,
  });
  let connectionManager: ConnectionManager | null = null;
  registry.on("created", (_id: string, cm: ConnectionManager) => {
    connectionManager = cm;
  });

  const getActiveConnectionManager = (): ConnectionManager | null => {
    try {
      return registry.getActiveConnection();
    } catch {
      return connectionManager;
    }
  };

  const defaultPort = options.port ?? 6274;

  // Create agent app with observation-only tools (always available)
  const agentTools = createAgentTools(registry);
  const agentApp = createApp({
    name: "mcp-inspector-agent",
    version: "1.0.0",
    tools: agentTools,
    config: {
      cors: { origin: true },
      serverRoute: "/agent/mcp",
    },
  });

  // Apps app - created lazily when target is connected
  // Supports ONE target connection per lifecycle (restart to change target)
  let appsApp: App | null = null;

  // Create apps app when target schema is available
  // When any connection updates its schema, create the apps proxy
  registry.on("created", (_regId: string, newCm: ConnectionManager) => {
    newCm.on("schemaUpdated", (schema: TargetServerSchema) => {
      // Only create once per lifecycle
      if (appsApp !== null) {
        // eslint-disable-next-line no-console
        console.warn(
          `[dual-inspector] Target already connected. Restart inspector to connect to a different target.`
        );
        return;
      }

      // Create the apps app with NO tools initially
      // We register proxy tools directly with the MCP server to preserve input schemas
      appsApp = createApp({
        name: "mcp-inspector-apps",
        version: "1.0.0",
        tools: {}, // Empty - tools registered directly below
        config: {
          cors: { origin: true },
          serverRoute: "/apps/mcp",
        },
      });

      // Get MCP server for direct tool/resource registration
      // Cast through unknown as McpServer is an opaque type in core
      const mcpServer = appsApp.getServer() as unknown as McpServerLike;

      // Register proxy tools directly with the MCP server
      // This bypasses the core's extractZodShape which strips unknown properties
      registerProxyToolsDirectly(mcpServer, newCm, schema.tools);

      // Register proxy resources on the MCP server
      const registeredResources = registerProxyResources(mcpServer, newCm, schema.resources);

      // eslint-disable-next-line no-console
      console.log(
        `[dual-inspector] /apps/mcp ready with ${schema.tools.length} proxy tools and ${registeredResources.length} proxy resources`
      );
    }); // end schemaUpdated
  }); // end registry.on("created")

  // HTTP server (created on start)
  let httpServer: Server | null = null;

  // Helper to handle requests
  const handleRequest = async (
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> => {
    const url = req.url ?? "/";

    // Debug: log all incoming requests
    if (options.debug) {
      // eslint-disable-next-line no-console
      console.log(`[inspector] Request: ${req.method} ${url}`);
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
        name: "mcp-inspector-dual",
        mode: "dual",
        endpoints: {
          agent: "/agent/mcp",
          apps: appsApp ? "/apps/mcp" : null,
        },
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

          // Validate URL format and protocol
          const trimmedUrl = data.url.trim();
          let parsedUrl: URL;
          try {
            parsedUrl = new URL(trimmedUrl);
          } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: "Invalid URL format" }));
            return;
          }

          const allowedProtocols = ["http:", "https:", "ws:", "wss:"];
          if (!allowedProtocols.includes(parsedUrl.protocol)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                success: false,
                error: `Invalid protocol: ${parsedUrl.protocol}. Allowed: ${allowedProtocols.join(", ")}`,
              })
            );
            return;
          }

          if (!parsedUrl.hostname) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: "URL must have a hostname" }));
            return;
          }

          // Use validated URL
          const validatedUrl = trimmedUrl;

          // Check if already connected
          const currentCm = getActiveConnectionManager();
          const currentState = currentCm?.getState() ?? {
            connected: false,
            serverUrl: null,
            serverInfo: null,
          };
          if (currentState.connected && currentState.serverUrl) {
            // If same URL, return success
            if (currentState.serverUrl === validatedUrl) {
              const schema = currentCm?.getTargetSchema() ?? null;
              const protocolType = schema ? inferProtocolType(schema.tools) : "mcp";
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  success: true,
                  connected: true,
                  serverUrl: validatedUrl,
                  serverInfo: currentState.serverInfo,
                  toolCount: schema?.tools.length ?? 0,
                  resourceCount: schema?.resources.length ?? 0,
                  promptCount: schema?.prompts.length ?? 0,
                  protocolType,
                })
              );
              return;
            }

            // If different URL without force, return error
            if (!data.force) {
              res.writeHead(409, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  success: false,
                  error: `Already connected to ${currentState.serverUrl}. Use force=true to disconnect and connect to ${validatedUrl}.`,
                })
              );
              return;
            }
          }

          // Connect (will disconnect first if force=true and already connected)
          const { id: newConnId, connectionManager: newCm } =
            await registry.createConnection(validatedUrl);
          const connSchema = newCm.getTargetSchema();
          const protocolType = connSchema ? inferProtocolType(connSchema.tools) : "mcp";

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: true,
              connectionId: newConnId,
              connected: true,
              serverUrl: validatedUrl,
              serverInfo: newCm.getState().serverInfo,
              toolCount: connSchema?.tools.length ?? 0,
              resourceCount: connSchema?.resources.length ?? 0,
              promptCount: connSchema?.prompts.length ?? 0,
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
          const activeCm = getActiveConnectionManager();
          if (!activeCm) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "No active connection" }));
            return;
          }
          const previousUrl = activeCm.getState().serverUrl;
          await registry.closeConnection(activeCm.id);
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

    // Unified event sync endpoint (for 1:1 widget state mirroring)
    // Handles ALL event types: globals, tool-input, tool-output, tool-result, etc.
    if (url === "/sync-events") {
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
        // Read body for POST
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const bodyData = Buffer.concat(chunks);

        try {
          const payload = JSON.parse(bodyData.toString("utf-8")) as SyncEventPayload;

          // For globals/host-context-changed events, also update the environment state
          const syncCm = getActiveConnectionManager();
          if (syncCm) {
            if (payload.type === "globals" || payload.type === "host-context-changed") {
              syncCm.updateEnvironmentFromGlobals(payload.data as Record<string, unknown>);
            }

            // Route to widget session manager for delivery to Playwright widgets
            await syncCm.getWidgetSessionManager().syncEvent(payload);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, type: payload.type }));
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

    // Environment update endpoint (for standalone mode widgets)
    // Called when the widget requests display mode or other environment changes
    if (url === "/update-environment") {
      // eslint-disable-next-line no-console
      console.log(`[inspector] /update-environment request: method=${req.method}`);

      // Handle CORS
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        // eslint-disable-next-line no-console
        console.log(`[inspector] /update-environment OPTIONS preflight - sending CORS headers`);
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

          // Update the connection manager's environment state
          const connectionManager = getActiveConnectionManager();
          if (!connectionManager) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "No active connection" }));
            return;
          }
          connectionManager.updateEnvironmentFromGlobals(data.globals);

          // Resize the Playwright viewport for the specific session
          const sessionManager = connectionManager.getWidgetSessionManager();
          const currentEnvState = connectionManager.getEnvironmentState();

          // Clamp viewport height to maxHeight for inline mode
          // Fullscreen mode has maxHeight=null so no clamping occurs
          if (
            currentEnvState.displayMode !== "fullscreen" &&
            currentEnvState.maxHeight != null &&
            currentEnvState.viewport
          ) {
            currentEnvState.viewport = {
              ...currentEnvState.viewport,
              height: Math.min(currentEnvState.viewport.height, currentEnvState.maxHeight),
            };
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

    // Legacy endpoint for backwards compatibility (redirects to /sync-events)
    if (url === "/sync-globals") {
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
        // Read body for POST
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const bodyData = Buffer.concat(chunks);

        try {
          const data = JSON.parse(bodyData.toString("utf-8")) as {
            globals?: Record<string, unknown>;
          };
          if (data.globals) {
            // Convert to new SyncEventPayload format
            const payload: SyncEventPayload = {
              type: "globals",
              data: data.globals,
              protocol: "openai", // Legacy endpoint assumed OpenAI protocol
              timestamp: new Date().toISOString(),
            };
            const legacyCm = getActiveConnectionManager();
            if (legacyCm) {
              legacyCm.updateEnvironmentFromGlobals(data.globals);
              await legacyCm.getWidgetSessionManager().syncEvent(payload);
            }
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
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

    // Dashboard routes (including /mcp/primitives with optional ?connectionId=...)
    if (url.startsWith("/dashboard") || url.startsWith("/mcp/primitives")) {
      const handled = await handleDashboardRequest(
        req,
        res,
        getActiveConnectionManager(),
        registry
      );
      if (handled) return;
    }

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

    // Route to appropriate app
    let webResponse: Response;
    if (url.startsWith("/agent/mcp")) {
      webResponse = await agentApp.handleRequest(webRequest);
    } else if (url.startsWith("/apps/mcp")) {
      if (appsApp === null) {
        // Not connected to target yet
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Service Unavailable",
            message:
              "Not connected to target server. Use /agent/mcp to call connect_to_server first.",
          })
        );
        return;
      }
      webResponse = await appsApp.handleRequest(webRequest);
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    // Convert Web Response to Node response
    res.writeHead(webResponse.status, Object.fromEntries(webResponse.headers.entries()));
    const responseBody = await webResponse.arrayBuffer();
    res.end(Buffer.from(responseBody));
  };

  return {
    start: async (port = defaultPort) => {
      return new Promise<void>((resolve, reject) => {
        try {
          httpServer = http.createServer((req, res) => {
            void handleRequest(req, res).catch((error: unknown) => {
              // eslint-disable-next-line no-console
              console.error("[dual-inspector] Request error:", error);
              if (!res.headersSent) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Internal server error" }));
              }
            });
          });
          httpServer.listen(port, () => {
            // Set inspector URL for sync script injection
            // Use 127.0.0.1 instead of localhost to match widget server origin (avoids CORS issues)
            getActiveConnectionManager()?.setInspectorUrl(`http://127.0.0.1:${port}`);

            // eslint-disable-next-line no-console
            console.log(`[dual-inspector] Started on port ${port}`);
            // eslint-disable-next-line no-console
            console.log(`  Agent endpoint: http://localhost:${port}/agent/mcp`);
            // eslint-disable-next-line no-console
            console.log(`  Apps endpoint:  http://localhost:${port}/apps/mcp (after connect)`);
            resolve();
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
            // eslint-disable-next-line no-console
            console.log(`[dual-inspector] Stopped`);
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
    getAgentApp: () => agentApp,
    getAppsApp: () => appsApp,
    getHttpServer: () => httpServer,
  };
}
