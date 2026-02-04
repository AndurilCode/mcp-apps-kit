/**
 * OAuth Callback & API Route Handlers
 *
 * Handles OAuth-related HTTP routes for the inspector servers:
 *
 * Browser redirect:
 *   GET  /oauth/callback          — receives auth redirect, exchanges code for tokens
 *
 * API endpoints:
 *   POST /api/oauth/configure     — set OAuth config for a connection
 *   GET  /api/oauth/status        — get current OAuth state (?connectionId=X optional)
 *   POST /api/oauth/revoke        — revoke tokens (?connectionId=X optional)
 *   GET  /api/oauth/discover      — discover auth requirements for a server URL
 */

import type http from "http";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { discoverAuthRequirements } from "./discovery";
import { InspectorOAuthProvider } from "./provider";
import type { OAuthClientConfig } from "./types";
import type { ConnectionRegistry } from "../connection-registry";
import type { ConnectionManager } from "../connection";

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Read the full request body as a UTF-8 string.
 */
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB limit

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += (chunk as Buffer).length;
    if (totalBytes > MAX_BODY_BYTES) {
      req.destroy();
      throw new Error("Request body too large");
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/**
 * Set standard CORS headers on the response.
 * Restricts origin to localhost/127.0.0.1 to prevent cross-site mutation attacks.
 */
function setCorsHeaders(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  methods: string
): void {
  const origin = req.headers.origin;
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        res.setHeader("Access-Control-Allow-Origin", origin);
      }
    } catch {
      // Invalid origin — don't set CORS header
    }
  }
  res.setHeader("Access-Control-Allow-Methods", `${methods}, OPTIONS`);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/**
 * Write a JSON response.
 */
function jsonResponse(
  res: http.ServerResponse,
  statusCode: number,
  body: Record<string, unknown>
): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * Resolve a connection manager from an optional connectionId or the active connection.
 */
function resolveConnectionManager(
  connectionId: string | null,
  registry: ConnectionRegistry,
  getActiveConnectionManager: () => ConnectionManager | null
): ConnectionManager | null {
  if (connectionId) {
    try {
      return registry.getConnection(connectionId);
    } catch {
      return null;
    }
  }
  return getActiveConnectionManager();
}

// =============================================================================
// ROUTE DISPATCHER
// =============================================================================

/**
 * Handle all OAuth-related HTTP requests.
 *
 * Dispatches to the appropriate handler based on the request path.
 * Returns true if the request was handled, false to pass to the next handler.
 *
 * @param req - HTTP incoming request
 * @param res - HTTP server response
 * @param registry - Connection registry for multi-connection lookup
 * @param getActiveConnectionManager - Fallback to get the active connection
 * @returns true if the request was handled
 */
export async function handleOAuthRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  registry: ConnectionRegistry,
  getActiveConnectionManager: () => ConnectionManager | null
): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === "/oauth/callback") {
    return handleOAuthCallback(req, res, url, getActiveConnectionManager);
  }

  if (url.pathname === "/api/oauth/configure") {
    return handleOAuthConfigure(req, res, registry, getActiveConnectionManager);
  }

  if (url.pathname === "/api/oauth/status") {
    return handleOAuthStatus(req, res, url, registry, getActiveConnectionManager);
  }

  if (url.pathname === "/api/oauth/revoke") {
    return handleOAuthRevoke(req, res, url, registry, getActiveConnectionManager);
  }

  if (url.pathname === "/api/oauth/discover") {
    return handleOAuthDiscover(req, res, url);
  }

  return false;
}

// =============================================================================
// GET /oauth/callback — Browser redirect from auth server
// =============================================================================

/**
 * Handle the OAuth authorization callback.
 *
 * The auth server redirects the user's browser here with an authorization code.
 * We exchange the code for tokens using the MCP SDK's auth() function and
 * respond with an HTML success/error page.
 */
async function handleOAuthCallback(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  getActiveConnectionManager: () => ConnectionManager | null
): Promise<boolean> {
  setCorsHeaders(req, res, "GET");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }

  if (req.method !== "GET") {
    jsonResponse(res, 405, { error: "Method not allowed" });
    return true;
  }

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // Handle error response from auth server
  if (error) {
    const provider = getActiveConnectionManager()?.getOAuthProvider() ?? null;
    if (provider) {
      provider.setError(errorDescription ?? error);
      provider.onAuthorizationComplete();
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(renderCallbackPage(false, `Authorization failed: ${errorDescription ?? error}`));
    return true;
  }

  // Missing authorization code
  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(renderCallbackPage(false, "Missing authorization code"));
    return true;
  }

  // No provider configured
  const provider = getActiveConnectionManager()?.getOAuthProvider() ?? null;
  if (!provider) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(renderCallbackPage(false, "No OAuth provider configured. Connect to a server first."));
    return true;
  }

  // Exchange code for tokens
  try {
    const result = await auth(provider, {
      serverUrl: provider.getServerUrl(),
      authorizationCode: code,
    });

    provider.onAuthorizationComplete();

    if (result === "AUTHORIZED") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(renderCallbackPage(true, "Authorization successful! You can close this tab."));
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(renderCallbackPage(false, "Unexpected redirect during authorization"));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    provider.setError(message);
    provider.onAuthorizationComplete();
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(renderCallbackPage(false, `Token exchange failed: ${message}`));
  }

  return true;
}

// =============================================================================
// POST /api/oauth/configure — Set OAuth config for a connection
// =============================================================================

/**
 * Handle OAuth configuration for a connection.
 *
 * Accepts an OAuthClientConfig and creates/replaces the OAuth provider on
 * the specified connection (or active connection).
 *
 * Body: { connectionId?: string, config: OAuthClientConfig }
 */
async function handleOAuthConfigure(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  registry: ConnectionRegistry,
  getActiveConnectionManager: () => ConnectionManager | null
): Promise<boolean> {
  setCorsHeaders(req, res, "POST");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }

  if (req.method !== "POST") {
    jsonResponse(res, 405, { error: "Method not allowed" });
    return true;
  }

  let body: { connectionId?: string; config?: OAuthClientConfig };
  try {
    body = JSON.parse(await readBody(req)) as {
      connectionId?: string;
      config?: OAuthClientConfig;
    };
  } catch {
    jsonResponse(res, 400, { error: "Invalid JSON body" });
    return true;
  }

  if (!body.config) {
    jsonResponse(res, 400, { error: "Missing 'config' field" });
    return true;
  }

  const config = body.config;

  // Require at least clientId or enableDynamicRegistration
  if (!config.clientId && !config.enableDynamicRegistration) {
    jsonResponse(res, 400, {
      error: "Config must include clientId or enableDynamicRegistration",
    });
    return true;
  }

  const cm = resolveConnectionManager(
    body.connectionId ?? null,
    registry,
    getActiveConnectionManager
  );

  if (!cm) {
    jsonResponse(res, 404, {
      error: body.connectionId
        ? `Connection not found: ${body.connectionId}`
        : "No active connection",
    });
    return true;
  }

  // Determine callback port from connection manager's inspector URL
  const serverUrl = cm.getState().serverUrl;
  if (!serverUrl) {
    jsonResponse(res, 400, { error: "Connection has no server URL" });
    return true;
  }

  // Default callback port to 6274 (standard inspector port)
  let callbackPort = 6274;
  try {
    const inspectorUrl = cm.getInspectorUrl();
    if (inspectorUrl) {
      callbackPort = parseInt(new URL(inspectorUrl).port, 10) || 6274;
    }
  } catch {
    // Use default
  }

  // Construct redirect URI from config or generate one
  const redirectUri = config.redirectUri || `http://127.0.0.1:${callbackPort}/oauth/callback`;

  const provider = new InspectorOAuthProvider({
    serverUrl,
    config: { ...config, redirectUri },
    callbackPort,
  });

  cm.setOAuthProvider(provider);

  // Initiate the OAuth auth flow so the authorization URL is available immediately.
  // This avoids a race where the dashboard would need to poll /api/oauth/status
  // before the URL is ready.
  let authorizationUrl: string | null = null;
  try {
    const result = await auth(provider, { serverUrl });
    if (result === "REDIRECT") {
      const pendingUrl = provider.getPendingAuthUrl();
      authorizationUrl = pendingUrl?.toString() ?? null;
    }
    // "AUTHORIZED" means tokens already exist — no redirect needed
  } catch {
    // Auth discovery/initiation may fail (e.g., server unreachable).
    // Not fatal — URL will appear in subsequent status polls once the
    // transport triggers auth on the next request.
  }

  // Discover supported scopes from auth server metadata (non-blocking).
  // Results are cached on the provider and included in status polls.
  void provider.discoverSupportedScopes().catch(() => {
    // Scope discovery is best-effort — don't block configure response
  });

  jsonResponse(res, 200, {
    configured: true,
    connectionId: cm.id,
    state: provider.getOAuthState(),
    authorizationUrl,
  });
  return true;
}

// =============================================================================
// GET /api/oauth/status — Get current OAuth state
// =============================================================================

/**
 * Handle OAuth status queries.
 *
 * Returns the current OAuth state for the specified connection (or active).
 * Dashboard can poll this to track auth flow progress.
 *
 * Query: ?connectionId=X (optional)
 */
async function handleOAuthStatus(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  registry: ConnectionRegistry,
  getActiveConnectionManager: () => ConnectionManager | null
): Promise<boolean> {
  setCorsHeaders(req, res, "GET");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }

  if (req.method !== "GET") {
    jsonResponse(res, 405, { error: "Method not allowed" });
    return true;
  }

  const connectionId = url.searchParams.get("connectionId");
  const cm = resolveConnectionManager(connectionId, registry, getActiveConnectionManager);

  if (!cm) {
    jsonResponse(res, 200, {
      configured: false,
      connectionId: connectionId ?? null,
    });
    return true;
  }

  const provider = cm.getOAuthProvider();
  if (!provider) {
    jsonResponse(res, 200, {
      configured: false,
      connectionId: cm.id,
    });
    return true;
  }

  const state = provider.getOAuthState();
  const pendingUrl = provider.getPendingAuthUrl();
  const supportedScopes = provider.getSupportedScopes();

  jsonResponse(res, 200, {
    configured: true,
    connectionId: cm.id,
    ...state,
    ...(supportedScopes.length > 0 ? { supportedScopes } : {}),
    authorizationUrl: pendingUrl?.toString() ?? null,
  });
  return true;
}

// =============================================================================
// POST /api/oauth/revoke — Revoke OAuth tokens
// =============================================================================

/**
 * Handle OAuth token revocation.
 *
 * Invalidates the stored tokens for the specified connection (or active).
 * The provider is reset to unauthenticated state.
 *
 * Query: ?connectionId=X (optional)
 */
async function handleOAuthRevoke(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  registry: ConnectionRegistry,
  getActiveConnectionManager: () => ConnectionManager | null
): Promise<boolean> {
  setCorsHeaders(req, res, "POST");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }

  if (req.method !== "POST") {
    jsonResponse(res, 405, { error: "Method not allowed" });
    return true;
  }

  const connectionId = url.searchParams.get("connectionId");
  const cm = resolveConnectionManager(connectionId, registry, getActiveConnectionManager);

  if (!cm) {
    jsonResponse(res, 200, {
      revoked: false,
      reason: connectionId ? `Connection not found: ${connectionId}` : "No active connection",
    });
    return true;
  }

  const provider = cm.getOAuthProvider();
  if (!provider) {
    jsonResponse(res, 200, { revoked: false, reason: "No OAuth provider configured" });
    return true;
  }

  try {
    const tokens = await provider.tokens();
    if (!tokens?.access_token) {
      jsonResponse(res, 200, { revoked: false, reason: "No tokens to revoke" });
      return true;
    }

    // Revoke server-side first (RFC 7009), then clean up locally
    const serverRevoked = await provider.revokeTokens();

    // Always invalidate tokens locally regardless of server-side result
    await provider.invalidateCredentials("tokens");

    jsonResponse(res, 200, { revoked: true, serverRevoked, connectionId: cm.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    jsonResponse(res, 500, { revoked: false, error: message });
  }

  return true;
}

// =============================================================================
// GET /api/oauth/discover — Discover auth requirements for a server URL
// =============================================================================

/**
 * Handle OAuth discovery requests.
 *
 * Server-side proxy for .well-known endpoint discovery, bypassing CORS
 * restrictions when called from the browser dashboard.
 *
 * Query: ?url=<serverUrl> (required)
 */
async function handleOAuthDiscover(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL
): Promise<boolean> {
  setCorsHeaders(req, res, "GET");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }

  if (req.method !== "GET") {
    jsonResponse(res, 405, { error: "Method not allowed" });
    return true;
  }

  const serverUrl = url.searchParams.get("url");
  if (!serverUrl) {
    jsonResponse(res, 400, { error: "Missing required 'url' query parameter" });
    return true;
  }

  // Validate URL format
  try {
    new URL(serverUrl);
  } catch {
    jsonResponse(res, 400, { error: "Invalid URL format" });
    return true;
  }

  try {
    const result = await discoverAuthRequirements(serverUrl);
    jsonResponse(res, 200, result as unknown as Record<string, unknown>);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    jsonResponse(res, 502, { error: "Discovery failed", message });
  }

  return true;
}

// =============================================================================
// HTML RENDERING
// =============================================================================

/**
 * Render a simple HTML page for the OAuth callback redirect.
 */
function renderCallbackPage(success: boolean, message: string): string {
  const color = success ? "#20b2aa" : "#ef4444";
  const icon = success ? "✓" : "✗";

  return `<!DOCTYPE html>
<html>
<head>
  <title>MCP Inspector - OAuth</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #0a0a0a;
      color: #e8e8e8;
    }
    .card {
      text-align: center;
      padding: 2rem 3rem;
      background: #111;
      border: 1px solid #2d2f2f;
      border-radius: 12px;
      max-width: 400px;
    }
    .icon {
      font-size: 3rem;
      color: ${color};
      margin-bottom: 1rem;
    }
    .message {
      font-size: 0.95rem;
      line-height: 1.5;
      color: #9aa0a6;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <p class="message">${escapeHtml(message)}</p>
  </div>
  <script>
    // Auto-close after success
    ${success ? "setTimeout(() => window.close(), 3000);" : ""}
  </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
