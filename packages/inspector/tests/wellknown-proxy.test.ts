/**
 * Well-Known Endpoint Proxy tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import http from "http";
import { createWellKnownProxy } from "../src/oauth/wellknown-proxy";
import type { WellKnownProxyContext } from "../src/oauth/wellknown-proxy";

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Create a mock http.IncomingMessage
 */
function mockRequest(method: string, url: string): http.IncomingMessage {
  const req = {
    method,
    url,
    headers: {},
  } as unknown as http.IncomingMessage;
  return req;
}

/**
 * Create a mock http.ServerResponse that captures writeHead/end calls.
 */
function mockResponse(): http.ServerResponse & {
  _status: number;
  _headers: Record<string, string>;
  _body: string;
} {
  const res = {
    _status: 0,
    _headers: {} as Record<string, string>,
    _body: "",
    writeHead(statusCode: number, headers?: Record<string, string>) {
      res._status = statusCode;
      if (headers) {
        Object.assign(res._headers, headers);
      }
      return res;
    },
    end(body?: string) {
      if (body) res._body = body;
      return res;
    },
    setHeader(name: string, value: string) {
      res._headers[name] = value;
      return res;
    },
  } as unknown as http.ServerResponse & {
    _status: number;
    _headers: Record<string, string>;
    _body: string;
  };
  return res;
}

// Sample upstream metadata fixtures
const sampleResourceMetadata = {
  resource: "https://mcp.example.com",
  authorization_servers: ["https://auth.example.com"],
  scopes_supported: ["read", "write"],
  bearer_methods_supported: ["header"],
  resource_name: "MCP Server",
};

const sampleAuthServerMetadata = {
  issuer: "https://auth.example.com",
  authorization_endpoint: "https://auth.example.com/authorize",
  token_endpoint: "https://auth.example.com/token",
  response_types_supported: ["code"],
  scopes_supported: ["read", "write"],
};

// =============================================================================
// TESTS
// =============================================================================

describe("createWellKnownProxy", () => {
  let proxy: ReturnType<typeof createWellKnownProxy>;
  const defaultCtx: WellKnownProxyContext = {
    upstreamUrl: "https://mcp.example.com",
    proxyUrl: "http://localhost:6274",
    authToken: null,
  };

  beforeEach(() => {
    proxy = createWellKnownProxy({ cacheTtlMs: 5000 });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    proxy.clearCache();
  });

  // ===========================================================================
  // Route matching
  // ===========================================================================

  describe("route matching", () => {
    it("should not handle non-well-known paths", async () => {
      const req = mockRequest("GET", "/api/connect");
      const res = mockResponse();

      const handled = await proxy.handleWellKnownRequest(req, res, defaultCtx);
      expect(handled).toBe(false);
    });

    it("should not handle unrelated well-known paths", async () => {
      const req = mockRequest("GET", "/.well-known/openid-configuration");
      const res = mockResponse();

      const handled = await proxy.handleWellKnownRequest(req, res, defaultCtx);
      expect(handled).toBe(false);
    });

    it("should handle /.well-known/oauth-protected-resource", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(sampleResourceMetadata), { status: 200 })
      );

      const req = mockRequest("GET", "/.well-known/oauth-protected-resource");
      const res = mockResponse();

      const handled = await proxy.handleWellKnownRequest(req, res, defaultCtx);
      expect(handled).toBe(true);
    });

    it("should handle /.well-known/oauth-authorization-server", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(sampleAuthServerMetadata), { status: 200 })
      );

      const req = mockRequest("GET", "/.well-known/oauth-authorization-server");
      const res = mockResponse();

      const handled = await proxy.handleWellKnownRequest(req, res, defaultCtx);
      expect(handled).toBe(true);
    });
  });

  // ===========================================================================
  // No context (no OAuth-protected upstream)
  // ===========================================================================

  describe("no OAuth context", () => {
    it("should return 404 when context is null", async () => {
      const req = mockRequest("GET", "/.well-known/oauth-protected-resource");
      const res = mockResponse();

      const handled = await proxy.handleWellKnownRequest(req, res, null);
      expect(handled).toBe(true);
      expect(res._status).toBe(404);
      expect(JSON.parse(res._body)).toEqual(expect.objectContaining({ error: "Not found" }));
    });
  });

  // ===========================================================================
  // Method validation
  // ===========================================================================

  describe("method validation", () => {
    it("should reject POST requests with 405", async () => {
      const req = mockRequest("POST", "/.well-known/oauth-protected-resource");
      const res = mockResponse();

      const handled = await proxy.handleWellKnownRequest(req, res, defaultCtx);
      expect(handled).toBe(true);
      expect(res._status).toBe(405);
    });

    it("should reject PUT requests with 405", async () => {
      const req = mockRequest("PUT", "/.well-known/oauth-authorization-server");
      const res = mockResponse();

      const handled = await proxy.handleWellKnownRequest(req, res, defaultCtx);
      expect(handled).toBe(true);
      expect(res._status).toBe(405);
    });
  });

  // ===========================================================================
  // Protected resource metadata
  // ===========================================================================

  describe("protected resource metadata", () => {
    it("should proxy and rewrite resource field", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(sampleResourceMetadata), { status: 200 })
      );

      const req = mockRequest("GET", "/.well-known/oauth-protected-resource");
      const res = mockResponse();

      await proxy.handleWellKnownRequest(req, res, defaultCtx);
      expect(res._status).toBe(200);

      const body = JSON.parse(res._body);
      // Resource field should be rewritten to proxy URL
      expect(body.resource).toBe("http://localhost:6274");
      // Other fields should remain intact
      expect(body.authorization_servers).toEqual(["https://auth.example.com"]);
      expect(body.scopes_supported).toEqual(["read", "write"]);
      expect(body.resource_name).toBe("MCP Server");
    });

    it("should return 502 when upstream returns error", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Not Found", { status: 404 })
      );

      const req = mockRequest("GET", "/.well-known/oauth-protected-resource");
      const res = mockResponse();

      await proxy.handleWellKnownRequest(req, res, defaultCtx);
      expect(res._status).toBe(502);
      expect(JSON.parse(res._body)).toEqual(expect.objectContaining({ error: "Bad Gateway" }));
    });

    it("should return 502 when upstream fetch throws", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

      const req = mockRequest("GET", "/.well-known/oauth-protected-resource");
      const res = mockResponse();

      await proxy.handleWellKnownRequest(req, res, defaultCtx);
      expect(res._status).toBe(502);
    });
  });

  // ===========================================================================
  // Authorization server metadata
  // ===========================================================================

  describe("authorization server metadata", () => {
    it("should proxy auth server metadata without rewriting", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(sampleAuthServerMetadata), { status: 200 })
      );

      const req = mockRequest("GET", "/.well-known/oauth-authorization-server");
      const res = mockResponse();

      await proxy.handleWellKnownRequest(req, res, defaultCtx);
      expect(res._status).toBe(200);

      const body = JSON.parse(res._body);
      // Should pass through unchanged
      expect(body.issuer).toBe("https://auth.example.com");
      expect(body.authorization_endpoint).toBe("https://auth.example.com/authorize");
      expect(body.token_endpoint).toBe("https://auth.example.com/token");
    });

    it("should return 502 when upstream returns error", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Server Error", { status: 500 })
      );

      const req = mockRequest("GET", "/.well-known/oauth-authorization-server");
      const res = mockResponse();

      await proxy.handleWellKnownRequest(req, res, defaultCtx);
      expect(res._status).toBe(502);
    });
  });

  // ===========================================================================
  // Caching
  // ===========================================================================

  describe("caching", () => {
    it("should cache resource metadata and not re-fetch within TTL", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(sampleResourceMetadata), { status: 200 }));

      const req = mockRequest("GET", "/.well-known/oauth-protected-resource");

      // First request: should fetch
      const res1 = mockResponse();
      await proxy.handleWellKnownRequest(req, res1, defaultCtx);
      expect(res1._status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Second request: should use cache
      const res2 = mockResponse();
      await proxy.handleWellKnownRequest(req, res2, defaultCtx);
      expect(res2._status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1); // Still 1 — not re-fetched
    });

    it("should cache auth server metadata separately", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(JSON.stringify(sampleResourceMetadata), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(sampleAuthServerMetadata), { status: 200 })
        );

      // Fetch resource metadata
      const req1 = mockRequest("GET", "/.well-known/oauth-protected-resource");
      const res1 = mockResponse();
      await proxy.handleWellKnownRequest(req1, res1, defaultCtx);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Fetch auth server metadata (different endpoint)
      const req2 = mockRequest("GET", "/.well-known/oauth-authorization-server");
      const res2 = mockResponse();
      await proxy.handleWellKnownRequest(req2, res2, defaultCtx);
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      // Both should now be cached
      const res3 = mockResponse();
      await proxy.handleWellKnownRequest(req1, res3, defaultCtx);
      const res4 = mockResponse();
      await proxy.handleWellKnownRequest(req2, res4, defaultCtx);
      expect(fetchSpy).toHaveBeenCalledTimes(2); // No additional fetches
    });

    it("should re-fetch after cache TTL expires", async () => {
      // Create proxy with very short TTL
      const shortTtlProxy = createWellKnownProxy({ cacheTtlMs: 50 });

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(sampleResourceMetadata), { status: 200 }));

      const req = mockRequest("GET", "/.well-known/oauth-protected-resource");

      // First fetch
      const res1 = mockResponse();
      await shortTtlProxy.handleWellKnownRequest(req, res1, defaultCtx);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Should re-fetch
      const res2 = mockResponse();
      await shortTtlProxy.handleWellKnownRequest(req, res2, defaultCtx);
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      shortTtlProxy.clearCache();
    });

    it("should invalidate cache when upstream URL changes", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(sampleResourceMetadata), { status: 200 }));

      const req = mockRequest("GET", "/.well-known/oauth-protected-resource");

      // Fetch for first upstream
      const res1 = mockResponse();
      await proxy.handleWellKnownRequest(req, res1, defaultCtx);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Switch upstream URL
      const newCtx: WellKnownProxyContext = {
        upstreamUrl: "https://other-mcp.example.com",
        proxyUrl: "http://localhost:6274",
        authToken: null,
      };

      // Should re-fetch for new upstream
      const res2 = mockResponse();
      await proxy.handleWellKnownRequest(req, res2, newCtx);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("should clear cache when clearCache is called", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(sampleResourceMetadata), { status: 200 }));

      const req = mockRequest("GET", "/.well-known/oauth-protected-resource");

      const res1 = mockResponse();
      await proxy.handleWellKnownRequest(req, res1, defaultCtx);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      proxy.clearCache();

      const res2 = mockResponse();
      await proxy.handleWellKnownRequest(req, res2, defaultCtx);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // Auth token pass-through
  // ===========================================================================

  describe("auth token pass-through", () => {
    it("should include Bearer token in upstream fetch when authToken is provided", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(JSON.stringify(sampleResourceMetadata), { status: 200 })
        );

      const ctxWithToken: WellKnownProxyContext = {
        ...defaultCtx,
        authToken: "test-bearer-token",
      };

      const req = mockRequest("GET", "/.well-known/oauth-protected-resource");
      const res = mockResponse();

      await proxy.handleWellKnownRequest(req, res, ctxWithToken);
      expect(res._status).toBe(200);

      // Verify Authorization header was sent
      const fetchArgs = fetchSpy.mock.calls[0];
      const fetchOptions = fetchArgs[1] as RequestInit;
      const headers = fetchOptions.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer test-bearer-token");
    });

    it("should not include Authorization header when authToken is null", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(JSON.stringify(sampleResourceMetadata), { status: 200 })
        );

      const req = mockRequest("GET", "/.well-known/oauth-protected-resource");
      const res = mockResponse();

      await proxy.handleWellKnownRequest(req, res, defaultCtx);
      expect(res._status).toBe(200);

      const fetchArgs = fetchSpy.mock.calls[0];
      const fetchOptions = fetchArgs[1] as RequestInit;
      const headers = fetchOptions.headers as Record<string, string>;
      expect(headers["Authorization"]).toBeUndefined();
    });
  });

  // ===========================================================================
  // Direct function access
  // ===========================================================================

  describe("direct metadata access", () => {
    it("getProtectedResourceMetadata should return rewritten metadata", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(sampleResourceMetadata), { status: 200 })
      );

      const metadata = await proxy.getProtectedResourceMetadata(defaultCtx);
      expect(metadata).not.toBeNull();
      expect(metadata!.resource).toBe("http://localhost:6274");
      expect(metadata!.resource_name).toBe("MCP Server");
    });

    it("getAuthServerMetadata should return metadata as-is", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(sampleAuthServerMetadata), { status: 200 })
      );

      const metadata = await proxy.getAuthServerMetadata(defaultCtx);
      expect(metadata).not.toBeNull();
      expect(metadata!.issuer).toBe("https://auth.example.com");
    });

    it("should return null when upstream fails", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Not Found", { status: 404 })
      );

      const metadata = await proxy.getProtectedResourceMetadata(defaultCtx);
      expect(metadata).toBeNull();
    });
  });

  // ===========================================================================
  // URL construction
  // ===========================================================================

  describe("URL construction", () => {
    it("should strip path from upstream URL when building well-known URL", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(JSON.stringify(sampleResourceMetadata), { status: 200 })
        );

      const ctxWithPath: WellKnownProxyContext = {
        upstreamUrl: "https://mcp.example.com/v1/mcp",
        proxyUrl: "http://localhost:6274",
        authToken: null,
      };

      const req = mockRequest("GET", "/.well-known/oauth-protected-resource");
      const res = mockResponse();

      await proxy.handleWellKnownRequest(req, res, ctxWithPath);

      // Should fetch from origin, not including the /v1/mcp path
      const fetchUrl = fetchSpy.mock.calls[0][0] as string;
      expect(fetchUrl).toBe("https://mcp.example.com/.well-known/oauth-protected-resource");
    });
  });
});
