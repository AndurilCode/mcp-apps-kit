/**
 * OAuth Callback Handler tests
 *
 * Tests the handleOAuthRoutes dispatcher and its sub-routes:
 *   GET  /oauth/callback          — auth code → token exchange
 *   POST /api/oauth/configure     — set OAuth config on a connection
 *   GET  /api/oauth/status        — get current OAuth state
 *   POST /api/oauth/revoke        — revoke tokens
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import http from "http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventEmitter } from "node:events";

// Mock the SDK auth module before importing the handler
const mockAuth = vi.fn();
vi.mock("@modelcontextprotocol/sdk/client/auth.js", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

import { handleOAuthRoutes } from "../src/oauth/callback-handler";
import { InspectorOAuthProvider } from "../src/oauth/provider";
import { TokenStore } from "../src/oauth/token-store";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { ConnectionManager } from "../src/connection";
import type { ConnectionRegistry } from "../src/connection-registry";

// =============================================================================
// MOCKS
// =============================================================================

function mockRequest(
  method: string,
  url: string,
  body?: string,
  headers: Record<string, string> = {}
): http.IncomingMessage {
  const req = new http.IncomingMessage(null as never);
  req.method = method;
  req.url = url;
  req.headers = { host: "127.0.0.1:6274", ...headers };

  // Make the request stream yield the body if provided
  if (body) {
    const buf = Buffer.from(body, "utf-8");
    // Override async iteration for readBody()
    (req as unknown as { [Symbol.asyncIterator]: () => AsyncIterator<Buffer> })[
      Symbol.asyncIterator
    ] = function () {
      let done = false;
      return {
        next(): Promise<IteratorResult<Buffer>> {
          if (!done) {
            done = true;
            return Promise.resolve({ value: buf, done: false });
          }
          return Promise.resolve({ value: undefined as unknown as Buffer, done: true });
        },
      };
    };
  } else {
    (req as unknown as { [Symbol.asyncIterator]: () => AsyncIterator<Buffer> })[
      Symbol.asyncIterator
    ] = function () {
      return {
        next(): Promise<IteratorResult<Buffer>> {
          return Promise.resolve({ value: undefined as unknown as Buffer, done: true });
        },
      };
    };
  }
  return req;
}

function mockResponse(): http.ServerResponse & {
  _statusCode: number;
  _headers: Record<string, string>;
  _body: string;
} {
  const res = {
    _statusCode: 200,
    _headers: {} as Record<string, string>,
    _body: "",
    writeHead(statusCode: number, headers?: Record<string, string>) {
      res._statusCode = statusCode;
      if (headers) Object.assign(res._headers, headers);
      return res;
    },
    setHeader(name: string, value: string) {
      res._headers[name] = value;
    },
    end(body?: string) {
      if (body) res._body = body;
    },
    headersSent: false,
  };
  return res as unknown as http.ServerResponse & {
    _statusCode: number;
    _headers: Record<string, string>;
    _body: string;
  };
}

/** Create a minimal ConnectionManager mock */
function mockConnectionManager(
  overrides: {
    provider?: InspectorOAuthProvider | null;
    serverUrl?: string | null;
    inspectorUrl?: string | null;
    id?: string;
  } = {}
): ConnectionManager {
  const cm = new EventEmitter() as unknown as ConnectionManager;
  const provider = overrides.provider ?? null;
  Object.assign(cm, {
    id: overrides.id ?? "conn-1",
    getOAuthProvider: () => provider,
    setOAuthProvider: vi.fn(),
    getState: () => ({
      connected: !!overrides.serverUrl,
      serverUrl: overrides.serverUrl ?? null,
      serverInfo: null,
      historyEnabled: false,
      callCount: 0,
      client: null,
      connectionParams: null,
    }),
    getInspectorUrl: () => overrides.inspectorUrl ?? "http://127.0.0.1:6274",
  });
  return cm;
}

/** Create a minimal ConnectionRegistry mock */
function mockRegistry(connectionMap: Record<string, ConnectionManager> = {}): ConnectionRegistry {
  return {
    getConnection: (id: string) => {
      const cm = connectionMap[id];
      if (!cm) throw new Error(`Connection not found: ${id}`);
      return cm;
    },
    listConnections: () => [],
  } as unknown as ConnectionRegistry;
}

// =============================================================================
// TESTS
// =============================================================================

describe("OAuth Callback Handler", () => {
  let tempDir: string;
  let tokenStore: TokenStore;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), "oauth-callback-test-"));
    tokenStore = new TokenStore(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function createProvider(serverUrl = "http://localhost:3000/mcp"): InspectorOAuthProvider {
    return new InspectorOAuthProvider({
      serverUrl,
      config: {
        clientId: "test-client",
        redirectUri: "http://127.0.0.1:6274/oauth/callback",
      },
      callbackPort: 6274,
      tokenStore,
    });
  }

  // ===========================================================================
  // Route dispatcher
  // ===========================================================================

  describe("handleOAuthRoutes", () => {
    it("should return false for unrelated paths", async () => {
      const req = mockRequest("GET", "/health");
      const res = mockResponse();
      const handled = await handleOAuthRoutes(req, res, mockRegistry(), () => null);
      expect(handled).toBe(false);
    });
  });

  // ===========================================================================
  // GET /oauth/callback
  // ===========================================================================

  describe("/oauth/callback", () => {
    it("should handle OPTIONS preflight", async () => {
      const req = mockRequest("OPTIONS", "/oauth/callback");
      const res = mockResponse();
      const handled = await handleOAuthRoutes(req, res, mockRegistry(), () => null);
      expect(handled).toBe(true);
      expect(res._statusCode).toBe(204);
      expect(res._headers["Access-Control-Allow-Origin"]).toBe("*");
    });

    it("should reject non-GET methods", async () => {
      const req = mockRequest("POST", "/oauth/callback");
      const res = mockResponse();
      const handled = await handleOAuthRoutes(req, res, mockRegistry(), () => null);
      expect(handled).toBe(true);
      expect(res._statusCode).toBe(405);
    });

    it("should handle error response from auth server", async () => {
      const provider = createProvider();
      const cm = mockConnectionManager({ provider });
      const req = mockRequest(
        "GET",
        "/oauth/callback?error=access_denied&error_description=User+denied"
      );
      const res = mockResponse();

      const handled = await handleOAuthRoutes(req, res, mockRegistry(), () => cm);
      expect(handled).toBe(true);
      expect(res._statusCode).toBe(200);
      expect(res._body).toContain("User denied");
      expect(provider.getOAuthState().status).toBe("error");
    });

    it("should return 400 when code is missing", async () => {
      const req = mockRequest("GET", "/oauth/callback");
      const res = mockResponse();
      const handled = await handleOAuthRoutes(req, res, mockRegistry(), () => null);
      expect(handled).toBe(true);
      expect(res._statusCode).toBe(400);
      expect(res._body).toContain("Missing authorization code");
    });

    it("should return 400 when no provider is configured", async () => {
      const cm = mockConnectionManager({ provider: null });
      const req = mockRequest("GET", "/oauth/callback?code=abc123");
      const res = mockResponse();
      const handled = await handleOAuthRoutes(req, res, mockRegistry(), () => cm);
      expect(handled).toBe(true);
      expect(res._statusCode).toBe(400);
      expect(res._body).toContain("No OAuth provider configured");
    });

    it("should complete token exchange on successful callback", async () => {
      mockAuth.mockResolvedValue("AUTHORIZED");
      const provider = createProvider();
      const cm = mockConnectionManager({ provider, serverUrl: "http://localhost:3000/mcp" });

      const req = mockRequest("GET", "/oauth/callback?code=auth-code-123");
      const res = mockResponse();

      const handled = await handleOAuthRoutes(req, res, mockRegistry(), () => cm);
      expect(handled).toBe(true);
      expect(res._statusCode).toBe(200);
      expect(res._body).toContain("Authorization successful");
      expect(mockAuth).toHaveBeenCalledWith(
        provider,
        expect.objectContaining({
          serverUrl: "http://localhost:3000/mcp",
          authorizationCode: "auth-code-123",
        })
      );
    });

    it("should handle unexpected redirect from auth()", async () => {
      mockAuth.mockResolvedValue("REDIRECT");
      const provider = createProvider();
      const cm = mockConnectionManager({ provider, serverUrl: "http://localhost:3000/mcp" });

      const req = mockRequest("GET", "/oauth/callback?code=code-456");
      const res = mockResponse();
      await handleOAuthRoutes(req, res, mockRegistry(), () => cm);
      expect(res._body).toContain("Unexpected redirect");
    });

    it("should handle token exchange errors", async () => {
      mockAuth.mockRejectedValue(new Error("Token endpoint returned 400"));
      const provider = createProvider();
      const cm = mockConnectionManager({ provider, serverUrl: "http://localhost:3000/mcp" });

      const req = mockRequest("GET", "/oauth/callback?code=bad-code");
      const res = mockResponse();
      await handleOAuthRoutes(req, res, mockRegistry(), () => cm);
      expect(res._body).toContain("Token exchange failed");
      expect(provider.getOAuthState().status).toBe("error");
    });

    it("should escape HTML in error messages", async () => {
      const provider = createProvider();
      const cm = mockConnectionManager({ provider });
      const req = mockRequest(
        "GET",
        "/oauth/callback?error=xss&error_description=%3Cscript%3Ealert(1)%3C/script%3E"
      );
      const res = mockResponse();
      await handleOAuthRoutes(req, res, mockRegistry(), () => cm);
      expect(res._body).not.toContain("<script>alert(1)</script>");
      expect(res._body).toContain("&lt;script&gt;");
    });
  });

  // ===========================================================================
  // GET /api/oauth/status
  // ===========================================================================

  describe("/api/oauth/status", () => {
    it("should handle OPTIONS preflight", async () => {
      const req = mockRequest("OPTIONS", "/api/oauth/status");
      const res = mockResponse();
      const handled = await handleOAuthRoutes(req, res, mockRegistry(), () => null);
      expect(handled).toBe(true);
      expect(res._statusCode).toBe(204);
    });

    it("should return configured=false when no active connection", async () => {
      const req = mockRequest("GET", "/api/oauth/status");
      const res = mockResponse();
      await handleOAuthRoutes(req, res, mockRegistry(), () => null);
      const body = JSON.parse(res._body);
      expect(body.configured).toBe(false);
    });

    it("should return configured=false when no provider on connection", async () => {
      const cm = mockConnectionManager({ provider: null });
      const req = mockRequest("GET", "/api/oauth/status");
      const res = mockResponse();
      await handleOAuthRoutes(req, res, mockRegistry(), () => cm);
      const body = JSON.parse(res._body);
      expect(body.configured).toBe(false);
    });

    it("should return OAuth state when provider exists", async () => {
      const provider = createProvider();
      const cm = mockConnectionManager({ provider });
      const req = mockRequest("GET", "/api/oauth/status");
      const res = mockResponse();
      await handleOAuthRoutes(req, res, mockRegistry(), () => cm);
      const body = JSON.parse(res._body);
      expect(body.configured).toBe(true);
      expect(body.status).toBe("unauthenticated");
      expect(body.authorizationUrl).toBeNull();
    });

    it("should include pending authorization URL", async () => {
      const provider = createProvider();
      const authUrl = new URL("https://auth.example.com/authorize?client_id=test");
      await provider.redirectToAuthorization(authUrl);
      const cm = mockConnectionManager({ provider });

      const req = mockRequest("GET", "/api/oauth/status");
      const res = mockResponse();
      await handleOAuthRoutes(req, res, mockRegistry(), () => cm);
      const body = JSON.parse(res._body);
      expect(body.status).toBe("authenticating");
      expect(body.authorizationUrl).toBe(authUrl.toString());
    });

    it("should look up connection by connectionId query param", async () => {
      const provider = createProvider();
      const cm = mockConnectionManager({ provider, id: "specific-conn" });
      const registry = mockRegistry({ "specific-conn": cm });

      const req = mockRequest("GET", "/api/oauth/status?connectionId=specific-conn");
      const res = mockResponse();
      await handleOAuthRoutes(req, res, registry, () => null);
      const body = JSON.parse(res._body);
      expect(body.configured).toBe(true);
      expect(body.connectionId).toBe("specific-conn");
    });
  });

  // ===========================================================================
  // POST /api/oauth/revoke
  // ===========================================================================

  describe("/api/oauth/revoke", () => {
    it("should handle OPTIONS preflight", async () => {
      const req = mockRequest("OPTIONS", "/api/oauth/revoke");
      const res = mockResponse();
      const handled = await handleOAuthRoutes(req, res, mockRegistry(), () => null);
      expect(handled).toBe(true);
      expect(res._statusCode).toBe(204);
    });

    it("should reject non-POST methods", async () => {
      const req = mockRequest("GET", "/api/oauth/revoke");
      const res = mockResponse();
      await handleOAuthRoutes(req, res, mockRegistry(), () => null);
      expect(res._statusCode).toBe(405);
    });

    it("should return revoked=false when no active connection", async () => {
      const req = mockRequest("POST", "/api/oauth/revoke");
      const res = mockResponse();
      await handleOAuthRoutes(req, res, mockRegistry(), () => null);
      const body = JSON.parse(res._body);
      expect(body.revoked).toBe(false);
    });

    it("should return revoked=false when no provider configured", async () => {
      const cm = mockConnectionManager({ provider: null });
      const req = mockRequest("POST", "/api/oauth/revoke");
      const res = mockResponse();
      await handleOAuthRoutes(req, res, mockRegistry(), () => cm);
      const body = JSON.parse(res._body);
      expect(body.revoked).toBe(false);
    });

    it("should return revoked=false when no tokens exist", async () => {
      const provider = createProvider();
      const cm = mockConnectionManager({ provider });
      const req = mockRequest("POST", "/api/oauth/revoke");
      const res = mockResponse();
      await handleOAuthRoutes(req, res, mockRegistry(), () => cm);
      const body = JSON.parse(res._body);
      expect(body.revoked).toBe(false);
      expect(body.reason).toContain("No tokens");
    });

    it("should revoke existing tokens", async () => {
      const provider = createProvider();
      await provider.saveTokens({
        access_token: "test-access-token",
        token_type: "bearer",
        refresh_token: "test-refresh-token",
      } as OAuthTokens);
      const cm = mockConnectionManager({ provider });

      const req = mockRequest("POST", "/api/oauth/revoke");
      const res = mockResponse();
      await handleOAuthRoutes(req, res, mockRegistry(), () => cm);
      const body = JSON.parse(res._body);
      expect(body.revoked).toBe(true);
      expect(provider.getOAuthState().status).toBe("unauthenticated");
    });
  });

  // ===========================================================================
  // POST /api/oauth/configure
  // ===========================================================================

  describe("/api/oauth/configure", () => {
    it("should handle OPTIONS preflight", async () => {
      const req = mockRequest("OPTIONS", "/api/oauth/configure");
      const res = mockResponse();
      const handled = await handleOAuthRoutes(req, res, mockRegistry(), () => null);
      expect(handled).toBe(true);
      expect(res._statusCode).toBe(204);
    });

    it("should reject non-POST methods", async () => {
      const req = mockRequest("GET", "/api/oauth/configure");
      const res = mockResponse();
      await handleOAuthRoutes(req, res, mockRegistry(), () => null);
      expect(res._statusCode).toBe(405);
    });

    it("should return 400 for invalid JSON body", async () => {
      const req = mockRequest("POST", "/api/oauth/configure", "not json");
      const res = mockResponse();
      await handleOAuthRoutes(req, res, mockRegistry(), () => null);
      expect(res._statusCode).toBe(400);
    });

    it("should return 400 when config is missing", async () => {
      const req = mockRequest("POST", "/api/oauth/configure", JSON.stringify({}));
      const res = mockResponse();
      await handleOAuthRoutes(req, res, mockRegistry(), () => null);
      expect(res._statusCode).toBe(400);
      const body = JSON.parse(res._body);
      expect(body.error).toContain("config");
    });

    it("should return 404 when no active connection", async () => {
      const req = mockRequest(
        "POST",
        "/api/oauth/configure",
        JSON.stringify({ config: { clientId: "test" } })
      );
      const res = mockResponse();
      await handleOAuthRoutes(req, res, mockRegistry(), () => null);
      expect(res._statusCode).toBe(404);
    });

    it("should configure OAuth on active connection", async () => {
      const cm = mockConnectionManager({
        serverUrl: "http://localhost:3000/mcp",
        provider: null,
      });
      const req = mockRequest(
        "POST",
        "/api/oauth/configure",
        JSON.stringify({
          config: { clientId: "new-client", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
        })
      );
      const res = mockResponse();
      await handleOAuthRoutes(req, res, mockRegistry(), () => cm);

      expect(res._statusCode).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.configured).toBe(true);
      expect(cm.setOAuthProvider).toHaveBeenCalled();
    });
  });
});
