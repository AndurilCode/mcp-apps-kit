/**
 * Dashboard Server
 *
 * HTTP route handlers for the real-time browser dashboard.
 * Routes:
 * - GET /dashboard - Serve dashboard HTML
 * - GET /dashboard/stream?sessionId={id}&connectionId={id} - SSE screencast stream
 * - GET /dashboard/logs?sessionId={id}&connectionId={id} - SSE log stream
 * - GET /dashboard/events?sessionId={id}&connectionId={id} - SSE event stream
 * - GET /dashboard/sessions?connectionId={id} - List active sessions (JSON)
 * - GET /dashboard/globals?connectionId={id} - Get current environment state (JSON)
 * - GET /dashboard/widget-url?sessionId={id}&connectionId={id} - Get widget iframe URL (JSON)
 * - GET /mcp/primitives?connectionId={id} - Get MCP server primitives (tools, resources, prompts)
 */

import type { IncomingMessage, ServerResponse } from "http";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import type { ConnectionParams } from "@mcp-apps-kit/testing";
import type { ConnectionManager } from "../connection";
import type { ConnectionRegistry } from "../connection-registry";
import type { InspectorEvent, AgnosticInspectorEvent } from "../types";
import { CDPStreamer } from "./cdp-streamer";
import { UIHostManager } from "../ui-host";
import {
  findUIResourceForTool,
  fetchWidgetHTML,
  extractToolResult,
  type MCPCallToolResponse,
} from "../tools/helpers";

// ===== Dashboard Mode State =====

/** Current dashboard mode — "agent" (default) or "human" */
let dashboardMode: "human" | "agent" = "agent";

/**
 * Get the current dashboard mode.
 *
 * Exported for use by tool handlers (e.g. to block agent tool calls in human mode).
 */
export function getDashboardMode(): "human" | "agent" {
  return dashboardMode;
}

// ===== Agent Takeover State =====

/** Pending agent takeover request */
let pendingTakeover: {
  id: string;
  agentId?: string;
  reason?: string;
  timestamp: number;
} | null = null;

/** Resolved takeover results (kept briefly so polling can retrieve the outcome) */
let lastTakeoverResult: {
  requestId: string;
  allowed: boolean;
  resolvedAt: number;
} | null = null;

/** SSE clients listening for takeover events */
const takeoverSSEClients = new Set<ServerResponse>();

/** Emit an event to all takeover SSE clients */
function emitTakeoverEvent(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of takeoverSSEClients) {
    if (!client.writableEnded) {
      client.write(payload);
    }
  }
}

/**
 * Request agent takeover — callable from MCP tools (avoids HTTP overhead).
 *
 * Only valid when dashboard is in "human" mode.
 */
export function requestTakeover(
  agentId?: string,
  reason?: string
): { requestId: string; status: "pending" } {
  if (dashboardMode !== "human") {
    throw new Error("Takeover requests are only valid in human mode");
  }
  if (pendingTakeover) {
    throw new Error("A takeover request is already pending");
  }
  const id = crypto.randomUUID();
  pendingTakeover = { id, agentId, reason, timestamp: Date.now() };
  lastTakeoverResult = null;

  emitTakeoverEvent("takeover-request", {
    id,
    agentId,
    reason,
    timestamp: pendingTakeover.timestamp,
  });

  return { requestId: id, status: "pending" };
}

/**
 * Get the status of a takeover request by ID.
 */
export function getTakeoverStatus(
  requestId: string
): "pending" | "approved" | "denied" | "expired" {
  // Check if it's the currently pending request
  if (pendingTakeover && pendingTakeover.id === requestId) {
    return "pending";
  }
  // Check resolved results
  if (lastTakeoverResult && lastTakeoverResult.requestId === requestId) {
    return lastTakeoverResult.allowed ? "approved" : "denied";
  }
  // Not found — expired or never existed
  return "expired";
}

/**
 * Resolve a ConnectionManager from an optional connection ID.
 * Falls back to the provided default connectionManager if no ID given.
 */
function resolveConnectionManager(
  connectionId: string | null,
  defaultConnectionManager: ConnectionManager | null,
  registry?: ConnectionRegistry
): ConnectionManager | null {
  if (connectionId && registry) {
    try {
      return registry.getConnection(connectionId);
    } catch {
      // Connection not found, fall through to default
    }
  }
  return defaultConnectionManager;
}

// Dashboard HTML file path (built by Vite into dist/dashboard/index.html)
// When bundled by tsup, __dirname can be either:
// - dist/ (when imported as library from dist/index.js)
// - dist/bin/ (when running CLI from dist/bin/mcp-inspector.js)
// We try both possible paths to handle either case.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findDashboardHtml(): string {
  // Try relative paths for different bundle locations
  const candidates = [
    path.join(__dirname, "./dashboard/index.html"), // from dist/
    path.join(__dirname, "../dashboard/index.html"), // from dist/bin/
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  // Return first candidate as fallback (will trigger "not built" message)
  return candidates[0] ?? "";
}

const DASHBOARD_HTML_PATH = findDashboardHtml();

// Cached dashboard HTML content
let cachedDashboardHtml: string | null = null;

// Singleton CDP streamer (shared across all requests)
let cdpStreamer: CDPStreamer | null = null;

/**
 * Get or create the CDP streamer
 */
function getCDPStreamer(debug: boolean): CDPStreamer {
  cdpStreamer ??= new CDPStreamer({ debug });
  return cdpStreamer;
}

/**
 * Clean up the CDP streamer singleton
 *
 * Should be called during server shutdown to properly stop all active
 * screencasts and release resources. After cleanup, a new streamer will
 * be created on the next getCDPStreamer call.
 */
export async function cleanupCDPStreamer(): Promise<void> {
  if (cdpStreamer) {
    await cdpStreamer.stopAll();
    cdpStreamer = null;
  }
}

/**
 * Handle dashboard requests
 *
 * @param req - Incoming HTTP request
 * @param res - Server response
 * @param connectionManager - Connection manager for accessing sessions
 * @returns true if the request was handled, false otherwise
 */
/**
 * Apply CORS headers for dashboard connection endpoints.
 *
 * @param res - Server response to mutate.
 */
function setCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export async function handleDashboardRequest(
  req: IncomingMessage,
  res: ServerResponse,
  connectionManager: ConnectionManager | null,
  registry?: ConnectionRegistry
): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const pathname = url.pathname;

  // ===== Connection management endpoints =====

  /**
   * GET /dashboard/connections — list all connections.
   */
  if (pathname === "/dashboard/connections" && req.method === "GET") {
    setCorsHeaders(res);
    if (!registry) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ connections: [] }));
      return true;
    }
    const connections = registry.listConnections().map((c) => ({
      id: c.id,
      connected: c.connected,
      serverUrl: c.serverUrl,
      serverInfo: c.serverInfo,
    }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ connections }));
    return true;
  }

  /**
   * POST /dashboard/connections — create new connection.
   *
   * Accepts ConnectionParams body:
   *   - { transport: "http", url: string }
   *   - { transport: "stdio", command: string, args?: string[], env?: Record<string,string>, cwd?: string }
   *   - { url: string } (backward compat — defaults to transport: "http")
   */
  if (pathname === "/dashboard/connections" && req.method === "POST") {
    setCorsHeaders(res);
    if (!registry) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Registry not available" }));
      return true;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as Record<string, unknown>;

      // Normalize to ConnectionParams (backward compat: { url } → { transport: "http", url })
      let params: ConnectionParams;
      const transport = (body.transport as string | undefined) ?? (body.url ? "http" : undefined);

      if (transport === "stdio") {
        // Validate stdio params
        const command = body.command;
        if (typeof command !== "string" || command.trim().length === 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing or empty command for stdio transport" }));
          return true;
        }
        params = {
          transport: "stdio",
          command: command.trim(),
          ...(Array.isArray(body.args) ? { args: body.args as string[] } : {}),
          ...(body.env && typeof body.env === "object"
            ? { env: body.env as Record<string, string> }
            : {}),
          ...(typeof body.cwd === "string" ? { cwd: body.cwd } : {}),
        };
      } else if (transport === "http") {
        // Validate HTTP/WS URL
        const urlStr = body.url;
        if (typeof urlStr !== "string" || urlStr.trim().length === 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing url" }));
          return true;
        }
        try {
          const parsedUrl = new URL(urlStr);
          const allowedProtocols = new Set(["http:", "https:", "ws:", "wss:"]);
          if (!allowedProtocols.has(parsedUrl.protocol)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: "Unsupported URL protocol. Use http, https, ws, or wss.",
              })
            );
            return true;
          }
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid URL format" }));
          return true;
        }
        params = { transport: "http", url: urlStr };
      } else {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing transport type or url" }));
        return true;
      }

      const { id, connectionManager: cm } = await registry.createConnection(params);
      const state = cm.getState();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id,
          url: state.serverUrl,
          transport: params.transport,
          serverInfo: state.serverInfo,
        })
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const isBadInput = e instanceof SyntaxError || message.includes("Invalid URL");
      res.writeHead(isBadInput ? 400 : 500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
    return true;
  }

  /**
   * DELETE /dashboard/connections/:id — close connection.
   */
  if (pathname.startsWith("/dashboard/connections/") && req.method === "DELETE") {
    setCorsHeaders(res);
    if (!registry) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Registry not available" }));
      return true;
    }
    const connId = pathname.replace("/dashboard/connections/", "");
    try {
      await registry.closeConnection(connId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
    return true;
  }

  /**
   * OPTIONS /dashboard/connections — CORS preflight for connection endpoints.
   */
  if (pathname.startsWith("/dashboard/connections") && req.method === "OPTIONS") {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return true;
  }

  // ===== Dashboard mode endpoints =====

  /**
   * GET /dashboard/mode — return current dashboard mode.
   */
  if (pathname === "/dashboard/mode" && req.method === "GET") {
    setCorsHeaders(res);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ mode: dashboardMode }));
    return true;
  }

  /**
   * PUT /dashboard/mode — update dashboard mode.
   *
   * Accepts: { mode: "human" | "agent" }
   */
  if (pathname === "/dashboard/mode" && req.method === "PUT") {
    setCorsHeaders(res);
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as Record<string, unknown>;
      const newMode = body.mode;
      if (newMode !== "human" && newMode !== "agent") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: 'Invalid mode. Expected "human" or "agent".' }));
        return true;
      }
      dashboardMode = newMode;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ mode: dashboardMode }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const isBadInput = e instanceof SyntaxError;
      res.writeHead(isBadInput ? 400 : 500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
    return true;
  }

  /**
   * OPTIONS /dashboard/mode — CORS preflight for mode endpoints.
   */
  if (pathname === "/dashboard/mode" && req.method === "OPTIONS") {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return true;
  }

  // ===== Widget URL endpoint =====

  /**
   * GET /dashboard/widget-url?sessionId={id}&connectionId={id}
   *
   * Returns the direct URL for embedding a widget session in an iframe.
   * Used by the dashboard to render interactive widget content in human mode.
   */
  if (pathname === "/dashboard/widget-url" && req.method === "GET") {
    setCorsHeaders(res);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing sessionId parameter" }));
      return true;
    }
    const connId = url.searchParams.get("connectionId");
    const cm = resolveConnectionManager(connId, connectionManager, registry);
    if (!cm) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No active connection" }));
      return true;
    }
    const sessionMgr = cm.getWidgetSessionManager();
    const session = sessionMgr.getSession(sessionId);
    if (!session) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return true;
    }
    try {
      const widgetServer = await cm.getWidgetServer();
      const port = widgetServer.getPort();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ url: `http://127.0.0.1:${port}/host/${sessionId}` }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Failed to get widget server: ${message}` }));
    }
    return true;
  }

  /**
   * OPTIONS /dashboard/widget-url — CORS preflight.
   */
  if (pathname === "/dashboard/widget-url" && req.method === "OPTIONS") {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return true;
  }

  // ===== Agent Takeover endpoints =====

  /**
   * POST /dashboard/takeover-request — agent requests to take over from human mode.
   */
  if (pathname === "/dashboard/takeover-request" && req.method === "POST") {
    setCorsHeaders(res);
    if (dashboardMode !== "human") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Takeover requests are only valid in human mode" }));
      return true;
    }
    if (pendingTakeover) {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "A takeover request is already pending" }));
      return true;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as Record<string, unknown>;
      const result = requestTakeover(
        body.agentId as string | undefined,
        body.reason as string | undefined
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
    return true;
  }

  /**
   * PUT /dashboard/takeover-response — human responds to a pending takeover request.
   */
  if (pathname === "/dashboard/takeover-response" && req.method === "PUT") {
    setCorsHeaders(res);
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as Record<string, unknown>;
      const requestId = body.requestId as string | undefined;
      const allow = body.allow as boolean | undefined;

      if (!requestId || typeof allow !== "boolean") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing requestId or allow" }));
        return true;
      }
      if (!pendingTakeover || pendingTakeover.id !== requestId) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No matching pending takeover request" }));
        return true;
      }

      // Resolve the takeover
      lastTakeoverResult = { requestId, allowed: allow, resolvedAt: Date.now() };
      if (allow) {
        dashboardMode = "agent";
      }
      pendingTakeover = null;

      emitTakeoverEvent("takeover-response", {
        requestId,
        allowed: allow,
        mode: dashboardMode,
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ mode: dashboardMode, requestId, allowed: allow }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
    return true;
  }

  /**
   * GET /dashboard/takeover-stream — SSE stream for takeover events.
   */
  if (pathname === "/dashboard/takeover-stream" && req.method === "GET") {
    setCorsHeaders(res);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // If there's a pending request, emit it immediately
    if (pendingTakeover) {
      res.write(
        `event: takeover-request\ndata: ${JSON.stringify({
          id: pendingTakeover.id,
          agentId: pendingTakeover.agentId,
          reason: pendingTakeover.reason,
          timestamp: pendingTakeover.timestamp,
        })}\n\n`
      );
    }

    takeoverSSEClients.add(res);

    // Keepalive every 30s
    const keepalive = setInterval(() => {
      if (!res.writableEnded) {
        res.write(":keepalive\n\n");
      }
    }, 30_000);

    const cleanup = (): void => {
      clearInterval(keepalive);
      takeoverSSEClients.delete(res);
    };

    req.on("close", cleanup);
    req.on("error", cleanup);
    return true;
  }

  /**
   * OPTIONS preflights for takeover endpoints.
   */
  if (
    (pathname === "/dashboard/takeover-request" ||
      pathname === "/dashboard/takeover-response" ||
      pathname === "/dashboard/takeover-stream") &&
    req.method === "OPTIONS"
  ) {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return true;
  }

  // GET /dashboard - Serve HTML
  if (pathname === "/dashboard" && req.method === "GET") {
    serveDashboardHtml(res);
    return true;
  }

  // GET /dashboard/sessions?connectionId={id} - List active sessions
  if (pathname === "/dashboard/sessions" && req.method === "GET") {
    const connId = url.searchParams.get("connectionId");
    const cm = resolveConnectionManager(connId, connectionManager, registry);
    if (!cm) {
      serveEmptySessions(res);
      return true;
    }
    serveSessionList(res, cm);
    return true;
  }

  // GET /dashboard/stream?sessionId={id}&connectionId={id} - SSE screencast stream
  if (pathname === "/dashboard/stream" && req.method === "GET") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing sessionId parameter" }));
      return true;
    }
    const connId = url.searchParams.get("connectionId");
    const cm = resolveConnectionManager(connId, connectionManager, registry);
    if (!cm) {
      writeNoSessionStream(res, "No active connection");
      return true;
    }
    await startScreencastStream(req, res, cm, sessionId);
    return true;
  }

  // GET /dashboard/logs?sessionId={id}&connectionId={id} - SSE log stream
  if (pathname === "/dashboard/logs" && req.method === "GET") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing sessionId parameter" }));
      return true;
    }
    const connId = url.searchParams.get("connectionId");
    const cm = resolveConnectionManager(connId, connectionManager, registry);
    if (!cm) {
      writeNoSessionStream(res, "No active connection");
      return true;
    }
    await startLogStream(req, res, cm, sessionId);
    return true;
  }

  // GET /dashboard/events?sessionId={id}&connectionId={id} - SSE event stream
  if (pathname === "/dashboard/events" && req.method === "GET") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing sessionId parameter" }));
      return true;
    }
    const connId = url.searchParams.get("connectionId");
    const cm = resolveConnectionManager(connId, connectionManager, registry);
    if (!cm) {
      writeNoSessionStream(res, "No active connection");
      return true;
    }
    startEventStream(req, res, cm, sessionId);
    return true;
  }

  // GET /dashboard/globals?connectionId={id} - Get current environment state
  if (pathname === "/dashboard/globals" && req.method === "GET") {
    const connId = url.searchParams.get("connectionId");
    const cm = resolveConnectionManager(connId, connectionManager, registry);
    if (!cm) {
      serveEmptyGlobals(res);
      return true;
    }
    serveGlobals(res, cm);
    return true;
  }

  // GET /dashboard/agent-events?connectionId={id} - SSE agent event stream (session-agnostic)
  if (pathname === "/dashboard/agent-events" && req.method === "GET") {
    const connId = url.searchParams.get("connectionId");
    const cm = resolveConnectionManager(connId, connectionManager, registry);
    if (!cm) {
      startEmptyAgentEventStream(res);
      return true;
    }
    startAgentEventStream(req, res, cm);
    return true;
  }

  // GET /mcp/primitives?connectionId={id} - Get MCP server primitives (tools, resources, prompts)
  if (pathname === "/mcp/primitives" && req.method === "GET") {
    const connId = url.searchParams.get("connectionId");
    const cm = resolveConnectionManager(connId, connectionManager, registry);
    await serveMcpPrimitives(res, cm);
    return true;
  }

  // ===== Human-mode execution endpoints =====

  /**
   * POST /dashboard/execute-tool — execute an MCP tool (human mode only).
   *
   * Body: { connectionId?: string, toolName: string, arguments: Record<string, unknown> }
   */
  if (pathname === "/dashboard/execute-tool" && req.method === "POST") {
    setCorsHeaders(res);
    if (getDashboardMode() !== "human") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Tool execution is only available in human mode" }));
      return true;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as Record<string, unknown>;
      const toolName = body.toolName as string | undefined;
      if (!toolName) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing toolName" }));
        return true;
      }
      const cm = resolveConnectionManager(
        (body.connectionId as string | undefined) ?? null,
        connectionManager,
        registry
      );
      if (!cm) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No active connection" }));
        return true;
      }
      const toolArgs = (body.arguments ?? {}) as Record<string, unknown>;
      const start = Date.now();
      const result = await cm.getClient().callTool(toolName, toolArgs);
      const duration = Date.now() - start;

      // Try to render widget session if tool has a UI resource
      let sessionId: string | undefined;
      try {
        const rawClient = cm.getClient().raw;
        const uiResource = await findUIResourceForTool(rawClient, toolName);
        if (uiResource) {
          const html = await fetchWidgetHTML(rawClient, uiResource.uri);
          if (html) {
            const sharedWidgetServer = await cm.getWidgetServer();
            const uiHostManager = new UIHostManager(cm.getClient(), { sharedWidgetServer });
            const environmentState = cm.getEnvironmentState();
            const viewport = environmentState.viewport;
            const inspectorUrl = cm.getInspectorUrl();

            const toolResult = extractToolResult(result as MCPCallToolResponse);

            const renderResult = await uiHostManager.renderInBrowser(
              html,
              uiResource.protocol,
              toolResult,
              toolName,
              toolArgs,
              environmentState,
              viewport,
              undefined,
              inspectorUrl ?? undefined
            );

            const pageUrl = renderResult.page.url();
            const urlMatch = pageUrl.match(/\/host\/([a-f0-9-]+)/);
            const widgetSessionId = urlMatch?.[1];

            if (widgetSessionId) {
              const widgetServerTouch = uiHostManager.createSessionTouchCallback(widgetSessionId);
              const sessionManager = cm.getWidgetSessionManager();
              const session = await sessionManager.createSession(
                toolName,
                toolArgs,
                toolResult,
                renderResult.page,
                widgetSessionId,
                uiResource.protocol,
                "agent",
                undefined,
                widgetServerTouch
              );
              sessionId = session.id;
            }
          }
        }
      } catch (widgetError) {
        // Widget rendering failed, but tool call succeeded — continue without session
        console.warn("[dashboard/execute-tool] Widget rendering failed:", widgetError);
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          content: result.content,
          isError: !!result.isError,
          duration,
          sessionId,
        })
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
    return true;
  }

  /**
   * OPTIONS /dashboard/execute-tool — CORS preflight.
   */
  if (pathname === "/dashboard/execute-tool" && req.method === "OPTIONS") {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return true;
  }

  /**
   * POST /dashboard/read-resource — read an MCP resource (human mode only).
   *
   * Body: { connectionId?: string, uri: string }
   */
  if (pathname === "/dashboard/read-resource" && req.method === "POST") {
    setCorsHeaders(res);
    if (getDashboardMode() !== "human") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Resource reading is only available in human mode" }));
      return true;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as Record<string, unknown>;
      const uri = body.uri as string | undefined;
      if (!uri) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing uri" }));
        return true;
      }
      const cm = resolveConnectionManager(
        (body.connectionId as string | undefined) ?? null,
        connectionManager,
        registry
      );
      if (!cm) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No active connection" }));
        return true;
      }
      const result = await cm.getClient().readResource(uri);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ contents: result.contents }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
    return true;
  }

  /**
   * OPTIONS /dashboard/read-resource — CORS preflight.
   */
  if (pathname === "/dashboard/read-resource" && req.method === "OPTIONS") {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return true;
  }

  /**
   * POST /dashboard/get-prompt — get an MCP prompt (human mode only).
   *
   * Body: { connectionId?: string, promptName: string, arguments?: Record<string, string> }
   */
  if (pathname === "/dashboard/get-prompt" && req.method === "POST") {
    setCorsHeaders(res);
    if (getDashboardMode() !== "human") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Prompt execution is only available in human mode" }));
      return true;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as Record<string, unknown>;
      const promptName = body.promptName as string | undefined;
      if (!promptName) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing promptName" }));
        return true;
      }
      const cm = resolveConnectionManager(
        (body.connectionId as string | undefined) ?? null,
        connectionManager,
        registry
      );
      if (!cm) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No active connection" }));
        return true;
      }
      const promptArgs = (body.arguments ?? {}) as Record<string, string>;
      const result = await cm.getClient().getPrompt(promptName, promptArgs);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ messages: result.messages, description: result.description }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
    return true;
  }

  /**
   * OPTIONS /dashboard/get-prompt — CORS preflight.
   */
  if (pathname === "/dashboard/get-prompt" && req.method === "OPTIONS") {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return true;
  }

  return false;
}

/**
 * Get the dashboard HTML content, loading from file on first access.
 *
 * @returns The dashboard HTML content, or a fallback error page if not built
 */
function getDashboardHtml(): string {
  if (cachedDashboardHtml === null) {
    try {
      cachedDashboardHtml = fs.readFileSync(DASHBOARD_HTML_PATH, "utf-8");
    } catch {
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard Not Built</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #191a1a;
      color: #e8e8e8;
    }
    .container { text-align: center; padding: 2rem; }
    h1 { color: #20b2aa; margin-bottom: 1rem; }
    code { background: #2d2f2f; padding: 0.25rem 0.5rem; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Dashboard Not Built</h1>
    <p>Run <code>pnpm build:dashboard</code> to build the dashboard.</p>
  </div>
</body>
</html>`;
    }
  }
  return cachedDashboardHtml;
}

/**
 * Serve the dashboard HTML page
 */
function serveDashboardHtml(res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(getDashboardHtml());
}

function serveEmptySessions(res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify({ sessions: [] }));
}

function serveEmptyGlobals(res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify({ globals: {} }));
}

function writeNoSessionStream(res: ServerResponse, message: string): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  res.write(`event: noSession\\ndata: ${JSON.stringify({ message })}\\n\\n`);
  setTimeout(() => {
    if (!res.writableEnded) {
      res.end();
    }
  }, 100);
}

function startEmptyAgentEventStream(res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  res.write(`event: events\\ndata: ${JSON.stringify({ events: [] })}\\n\\n`);
  setTimeout(() => {
    if (!res.writableEnded) {
      res.end();
    }
  }, 100);
}

/**
 * Serve the current environment/globals state
 */
function serveGlobals(res: ServerResponse, connectionManager: ConnectionManager): void {
  const environmentState = connectionManager.getEnvironmentState();

  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify({ globals: environmentState }));
}

/**
 * Serve the list of active sessions
 */
function serveSessionList(res: ServerResponse, connectionManager: ConnectionManager): void {
  const sessionManager = connectionManager.getWidgetSessionManager();
  const sessions = sessionManager.listSessions();

  // Return session info relevant to dashboard
  const sessionList = sessions.map((s) => ({
    id: s.id,
    toolName: s.toolName,
    protocol: s.protocol,
    createdAt: s.createdAt,
    lastAccessedAt: s.lastAccessedAt,
    source: s.source,
  }));

  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify({ sessions: sessionList }));
}

/**
 * Start SSE screencast stream for a session
 */
async function startScreencastStream(
  req: IncomingMessage,
  res: ServerResponse,
  connectionManager: ConnectionManager,
  sessionId: string
): Promise<void> {
  const sessionManager = connectionManager.getWidgetSessionManager();
  const page = sessionManager.getPageForStreaming(sessionId);

  // Set up SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // If no session or page, send noSession event and close after a short delay
  if (!page) {
    res.write(
      `event: noSession\ndata: ${JSON.stringify({ message: "Session not found or closed" })}\n\n`
    );
    // Close connection after a brief delay to allow the event to be sent
    setTimeout(() => {
      if (!res.writableEnded) {
        res.end();
      }
    }, 100);
    return;
  }

  // Get the CDP streamer
  const streamer = getCDPStreamer(false);

  // Create a unique stream ID for this connection (session + timestamp)
  const streamId = `${sessionId}-${Date.now()}`;

  // Set up cleanup handler
  const cleanup = (): void => {
    void streamer.stopScreencast(streamId);
  };

  req.on("close", cleanup);
  req.on("error", cleanup);

  try {
    // Start screencast
    await streamer.startScreencast(
      streamId,
      page,
      // On frame
      (frame) => {
        if (!res.writableEnded) {
          const data = JSON.stringify({
            timestamp: frame.timestamp,
            image: `data:image/jpeg;base64,${frame.data}`,
          });
          res.write(`event: frame\ndata: ${data}\n\n`);
        }
      },
      // On error
      (error) => {
        if (!res.writableEnded) {
          res.write(
            `event: error\ndata: ${JSON.stringify({ message: `Screencast error: ${error.message}` })}\n\n`
          );
        }
        cleanup();
      },
      // On touch (keep session alive)
      () => {
        sessionManager.touchSession(sessionId);
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.write(
      `event: error\ndata: ${JSON.stringify({ message: `Failed to start screencast: ${message}` })}\n\n`
    );
  }
}

/**
 * Start SSE log stream for a session
 */
async function startLogStream(
  req: IncomingMessage,
  res: ServerResponse,
  connectionManager: ConnectionManager,
  sessionId: string
): Promise<void> {
  const sessionManager = connectionManager.getWidgetSessionManager();
  const session = sessionManager.getSession(sessionId);

  // Set up SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // If no session, send noSession event
  if (!session) {
    res.write(
      `event: noSession\ndata: ${JSON.stringify({ message: "Session not found or closed" })}\n\n`
    );
    return;
  }

  // Send initial batch of existing logs
  const existingLogs = session.consoleLogs;
  if (existingLogs.length > 0) {
    res.write(`event: logs\ndata: ${JSON.stringify({ logs: existingLogs })}\n\n`);
  }

  // Track how many logs we've sent
  let sentLogCount = existingLogs.length;

  // Set up polling for new logs
  const pollInterval = setInterval(() => {
    const currentSession = sessionManager.getSession(sessionId);

    // If session no longer exists, send disconnect and clean up
    if (!currentSession) {
      res.write(`event: disconnected\ndata: ${JSON.stringify({ message: "Session ended" })}\n\n`);
      clearInterval(pollInterval);
      if (!res.writableEnded) {
        res.end();
      }
      return;
    }

    // Check for new logs
    const currentLogs = currentSession.consoleLogs;
    if (currentLogs.length > sentLogCount) {
      // Send only the new logs
      const newLogs = currentLogs.slice(sentLogCount);
      for (const log of newLogs) {
        if (!res.writableEnded) {
          res.write(`event: log\ndata: ${JSON.stringify(log)}\n\n`);
        }
      }
      sentLogCount = currentLogs.length;
    }
  }, 100); // Poll every 100ms

  // Clean up on connection close
  const cleanup = (): void => {
    clearInterval(pollInterval);
  };

  req.on("close", cleanup);
  req.on("error", cleanup);
}

/**
 * Start SSE event stream for a session
 *
 * Events are streamed via EventEmitter from WidgetSessionManager.
 * Initial batch of existing events is sent, then real-time events are pushed.
 */
function startEventStream(
  req: IncomingMessage,
  res: ServerResponse,
  connectionManager: ConnectionManager,
  sessionId: string
): void {
  const sessionManager = connectionManager.getWidgetSessionManager();
  const session = sessionManager.getSession(sessionId);

  // Set up SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // If no session, send noSession event
  if (!session) {
    res.write(
      `event: noSession\ndata: ${JSON.stringify({ message: "Session not found or closed" })}\n\n`
    );
    return;
  }

  // Send initial batch of existing events
  const existingEvents = sessionManager.getEvents(sessionId);
  if (existingEvents.length > 0) {
    res.write(`event: events\ndata: ${JSON.stringify({ events: existingEvents })}\n\n`);
  }

  // Subscribe to real-time events via EventEmitter
  const eventHandler = (event: InspectorEvent): void => {
    // Only send events for this session
    if (event.sessionId !== sessionId) {
      return;
    }
    if (!res.writableEnded) {
      res.write(`event: event\ndata: ${JSON.stringify(event)}\n\n`);
    }
  };

  sessionManager.on("event", eventHandler);

  // Clean up on connection close
  const cleanup = (): void => {
    sessionManager.off("event", eventHandler);
  };

  req.on("close", cleanup);
  req.on("error", cleanup);
}

/**
 * Serve MCP server primitives (tools, resources, prompts)
 *
 * Fetches the current primitives from the connected MCP server.
 * Returns empty arrays if not connected or if the server doesn't support a capability.
 */
async function serveMcpPrimitives(
  res: ServerResponse,
  connectionManager: ConnectionManager | null
): Promise<void> {
  let tools: unknown[] = [];
  let resources: unknown[] = [];
  let prompts: unknown[] = [];

  if (connectionManager) {
    try {
      const client = connectionManager.getClient();

      // Fetch each primitive type, handling individual failures gracefully
      try {
        tools = await client.listTools();
      } catch {
        // Server doesn't support tools capability or error occurred
      }

      try {
        resources = await client.listResources();
      } catch {
        // Server doesn't support resources capability or error occurred
      }

      try {
        prompts = await client.listPrompts();
      } catch {
        // Server doesn't support prompts capability or error occurred
      }
    } catch {
      // Not connected - return empty arrays (already initialized)
    }
  }

  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify({ tools, resources, prompts }));
}

/**
 * Start SSE stream for session-agnostic agent events
 *
 * Agent events are tool calls made by the inspector agent on the connected
 * MCP server that are not tied to a specific widget session.
 */
function startAgentEventStream(
  req: IncomingMessage,
  res: ServerResponse,
  connectionManager: ConnectionManager
): void {
  // Set up SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // Send initial batch of existing agent events
  const existingEvents = connectionManager.getAgentEvents();
  if (existingEvents.length > 0) {
    res.write(`event: events\ndata: ${JSON.stringify({ events: existingEvents })}\n\n`);
  }

  // Subscribe to real-time agent events via EventEmitter
  const eventHandler = (event: AgnosticInspectorEvent): void => {
    if (!res.writableEnded) {
      res.write(`event: event\ndata: ${JSON.stringify(event)}\n\n`);
    }
  };

  connectionManager.on("agentEvent", eventHandler);

  // Clean up on connection close
  const cleanup = (): void => {
    connectionManager.off("agentEvent", eventHandler);
  };

  req.on("close", cleanup);
  req.on("error", cleanup);
}
