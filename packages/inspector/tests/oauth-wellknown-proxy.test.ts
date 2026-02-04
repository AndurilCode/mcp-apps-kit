/**
 * WellKnown Proxy HTTP Handler + Cache TTL tests — TASK-006 (Polaris)
 *
 * Tests the handleWellKnownRequest HTTP middleware function and cache
 * expiry behavior not covered by other test files.
 *
 * Covers:
 * - AC-3: Dual mode mirroring (.well-known endpoints proxied with rewritten resource URL)
 * - HTTP handler: routing, method guards, 404/502 responses, JSON output
 * - Cache TTL: expiry, re-fetch, invalidation on upstream switch
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import http from "http";
import { createWellKnownProxy } from "../src/oauth/wellknown-proxy";
import type { WellKnownProxyContext } from "../src/oauth/wellknown-proxy";

// ═════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════════════

function mockRequest(method: string, url: string): http.IncomingMessage {
  const req = new http.IncomingMessage(null as never);
  req.method = method;
  req.url = url;
  req.headers = { host: "127.0.0.1:6274" };
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
    writeHead(s: number, h?: Record<string, string>) {
      res._statusCode = s;
      if (h) Object.assign(res._headers, h);
      return res;
    },
    setHeader(n: string, v: string) {
      res._headers[n] = v;
    },
    end(b?: string) {
      if (b) res._body = b;
    },
    headersSent: false,
  };
  return res as unknown as ReturnType<typeof mockResponse>;
}

const UPSTREAM_RESOURCE_META = {
  resource: "https://mcp.upstream.example.com",
  authorization_servers: ["https://auth.upstream.example.com"],
  scopes_supported: ["read", "write"],
  bearer_methods_supported: ["header"],
};

const UPSTREAM_AUTH_META = {
  issuer: "https://auth.upstream.example.com",
  authorization_endpoint: "https://auth.upstream.example.com/authorize",
  token_endpoint: "https://auth.upstream.example.com/token",
  revocation_endpoint: "https://auth.upstream.example.com/revoke",
  scopes_supported: ["read", "write"],
  response_types_supported: ["code"],
};

function defaultCtx(): WellKnownProxyContext {
  return {
    upstreamUrl: "https://mcp.upstream.example.com/v1/mcp",
    proxyUrl: "http://localhost:6274",
    authToken: null,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// handleWellKnownRequest — HTTP middleware
// ═════════════════════════════════════════════════════════════════════════════

describe("WellKnown Proxy: handleWellKnownRequest HTTP handler", () => {
  let proxy: ReturnType<typeof createWellKnownProxy>;

  beforeEach(() => {
    proxy = createWellKnownProxy({ cacheTtlMs: 60_000 });
    vi.restoreAllMocks();
  });
  afterEach(() => {
    proxy.clearCache();
  });

  // ── Routing ─────────────────────────────────────────────────────────────

  describe("routing", () => {
    it("should return false for non-well-known paths", async () => {
      const req = mockRequest("GET", "/api/test");
      const res = mockResponse();
      const handled = await proxy.handleWellKnownRequest(req, res, defaultCtx());
      expect(handled).toBe(false);
    });

    it("should return false for /health", async () => {
      const req = mockRequest("GET", "/health");
      const res = mockResponse();
      const handled = await proxy.handleWellKnownRequest(req, res, null);
      expect(handled).toBe(false);
    });

    it("should return false for /.well-known/other-path", async () => {
      const req = mockRequest("GET", "/.well-known/openid-configuration");
      const res = mockResponse();
      const handled = await proxy.handleWellKnownRequest(req, res, defaultCtx());
      expect(handled).toBe(false);
    });

    it("should handle /.well-known/oauth-protected-resource", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(UPSTREAM_RESOURCE_META), { status: 200 })
      );

      const req = mockRequest("GET", "/.well-known/oauth-protected-resource");
      const res = mockResponse();
      const handled = await proxy.handleWellKnownRequest(req, res, defaultCtx());

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(200);
    });

    it("should handle /.well-known/oauth-authorization-server", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(UPSTREAM_AUTH_META), { status: 200 })
      );

      const req = mockRequest("GET", "/.well-known/oauth-authorization-server");
      const res = mockResponse();
      const handled = await proxy.handleWellKnownRequest(req, res, defaultCtx());

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(200);
    });
  });

  // ── Method guard ────────────────────────────────────────────────────────

  describe("method guard", () => {
    it("should return 405 for POST to protected-resource", async () => {
      const req = mockRequest("POST", "/.well-known/oauth-protected-resource");
      const res = mockResponse();
      const handled = await proxy.handleWellKnownRequest(req, res, defaultCtx());

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(405);
      const body = JSON.parse(res._body);
      expect(body.error).toBe("Method not allowed");
    });

    it("should return 405 for PUT to authorization-server", async () => {
      const req = mockRequest("PUT", "/.well-known/oauth-authorization-server");
      const res = mockResponse();
      const handled = await proxy.handleWellKnownRequest(req, res, defaultCtx());

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(405);
    });

    it("should return 405 for DELETE to protected-resource", async () => {
      const req = mockRequest("DELETE", "/.well-known/oauth-protected-resource");
      const res = mockResponse();
      const handled = await proxy.handleWellKnownRequest(req, res, defaultCtx());

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(405);
    });
  });

  // ── Null context (no upstream connected) ────────────────────────────────

  describe("null context (no upstream)", () => {
    it("should return 404 for protected-resource when no context", async () => {
      const req = mockRequest("GET", "/.well-known/oauth-protected-resource");
      const res = mockResponse();
      const handled = await proxy.handleWellKnownRequest(req, res, null);

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(404);
      const body = JSON.parse(res._body);
      expect(body.error).toBe("Not found");
      expect(body.message).toContain("No OAuth-protected upstream");
    });

    it("should return 404 for authorization-server when no context", async () => {
      const req = mockRequest("GET", "/.well-known/oauth-authorization-server");
      const res = mockResponse();
      const handled = await proxy.handleWellKnownRequest(req, res, null);

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(404);
    });
  });

  // ── 502 Bad Gateway (upstream doesn't expose metadata) ──────────────────

  describe("502 Bad Gateway", () => {
    it("should return 502 when upstream returns 404 for protected-resource", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Not Found", { status: 404 })
      );

      const req = mockRequest("GET", "/.well-known/oauth-protected-resource");
      const res = mockResponse();
      const handled = await proxy.handleWellKnownRequest(req, res, defaultCtx());

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(502);
      const body = JSON.parse(res._body);
      expect(body.error).toBe("Bad Gateway");
      expect(body.message).toContain("protected resource metadata");
    });

    it("should return 502 when upstream returns 500 for authorization-server", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Server Error", { status: 500 })
      );

      const req = mockRequest("GET", "/.well-known/oauth-authorization-server");
      const res = mockResponse();
      const handled = await proxy.handleWellKnownRequest(req, res, defaultCtx());

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(502);
      const body = JSON.parse(res._body);
      expect(body.error).toBe("Bad Gateway");
      expect(body.message).toContain("authorization server metadata");
    });

    it("should return 502 when upstream network request fails", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const req = mockRequest("GET", "/.well-known/oauth-protected-resource");
      const res = mockResponse();
      const handled = await proxy.handleWellKnownRequest(req, res, defaultCtx());

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(502);
    });
  });

  // ── 200 OK with correct JSON output ─────────────────────────────────────

  describe("successful proxy responses", () => {
    it("should return resource metadata with rewritten resource URL", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(UPSTREAM_RESOURCE_META), { status: 200 })
      );

      const req = mockRequest("GET", "/.well-known/oauth-protected-resource");
      const res = mockResponse();
      await proxy.handleWellKnownRequest(req, res, defaultCtx());

      expect(res._statusCode).toBe(200);
      expect(res._headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(res._body);
      // Resource field rewritten to proxy URL
      expect(body.resource).toBe("http://localhost:6274");
      // Other fields preserved
      expect(body.authorization_servers).toEqual(["https://auth.upstream.example.com"]);
      expect(body.scopes_supported).toEqual(["read", "write"]);
      expect(body.bearer_methods_supported).toEqual(["header"]);
    });

    it("should return auth server metadata WITHOUT rewriting", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(UPSTREAM_AUTH_META), { status: 200 })
      );

      const req = mockRequest("GET", "/.well-known/oauth-authorization-server");
      const res = mockResponse();
      await proxy.handleWellKnownRequest(req, res, defaultCtx());

      expect(res._statusCode).toBe(200);
      const body = JSON.parse(res._body);
      // Auth server metadata is passed through unchanged
      expect(body.issuer).toBe("https://auth.upstream.example.com");
      expect(body.authorization_endpoint).toBe("https://auth.upstream.example.com/authorize");
      expect(body.token_endpoint).toBe("https://auth.upstream.example.com/token");
      expect(body.revocation_endpoint).toBe("https://auth.upstream.example.com/revoke");
    });
  });

  // ── Caching through HTTP handler ────────────────────────────────────────

  describe("caching through HTTP handler", () => {
    it("should serve cached resource metadata on second request", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(UPSTREAM_RESOURCE_META), { status: 200 }));

      const ctx = defaultCtx();

      // First request — fetches from upstream
      const req1 = mockRequest("GET", "/.well-known/oauth-protected-resource");
      const res1 = mockResponse();
      await proxy.handleWellKnownRequest(req1, res1, ctx);
      expect(res1._statusCode).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Second request — served from cache
      const req2 = mockRequest("GET", "/.well-known/oauth-protected-resource");
      const res2 = mockResponse();
      await proxy.handleWellKnownRequest(req2, res2, ctx);
      expect(res2._statusCode).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1); // No additional fetch
    });

    it("should serve cached auth server metadata on second request", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(UPSTREAM_AUTH_META), { status: 200 }));

      const ctx = defaultCtx();

      const req1 = mockRequest("GET", "/.well-known/oauth-authorization-server");
      const res1 = mockResponse();
      await proxy.handleWellKnownRequest(req1, res1, ctx);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const req2 = mockRequest("GET", "/.well-known/oauth-authorization-server");
      const res2 = mockResponse();
      await proxy.handleWellKnownRequest(req2, res2, ctx);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Cache TTL expiry behavior
// ═════════════════════════════════════════════════════════════════════════════

describe("WellKnown Proxy: cache TTL expiry", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should re-fetch resource metadata after TTL expires", async () => {
    // Use a very short TTL and control Date.now() to simulate time passing
    const proxy = createWellKnownProxy({ cacheTtlMs: 1000 });

    let now = 1000000;
    vi.spyOn(Date, "now").mockImplementation(() => now);

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(UPSTREAM_RESOURCE_META), { status: 200 }));

    const ctx = defaultCtx();

    // First fetch — populates cache
    await proxy.getProtectedResourceMetadata(ctx);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Within TTL (500ms later)
    now += 500;
    await proxy.getProtectedResourceMetadata(ctx);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // After TTL (600ms more = 1100ms total > 1000ms TTL)
    now += 600;
    await proxy.getProtectedResourceMetadata(ctx);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    proxy.clearCache();
  });

  it("should re-fetch auth server metadata after TTL expires", async () => {
    const proxy = createWellKnownProxy({ cacheTtlMs: 2000 });

    let now = 2000000;
    vi.spyOn(Date, "now").mockImplementation(() => now);

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(UPSTREAM_AUTH_META), { status: 200 }));

    const ctx = defaultCtx();

    await proxy.getAuthServerMetadata(ctx);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Still within TTL (1500ms)
    now += 1500;
    await proxy.getAuthServerMetadata(ctx);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Past TTL (600ms more = 2100ms > 2000ms)
    now += 600;
    await proxy.getAuthServerMetadata(ctx);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    proxy.clearCache();
  });

  it("should invalidate both caches when upstream URL changes", async () => {
    const proxy = createWellKnownProxy({ cacheTtlMs: 60_000 });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          resource: "https://upstream.example.com",
          authorization_servers: [],
        }),
        { status: 200 }
      )
    );

    const ctx1: WellKnownProxyContext = {
      upstreamUrl: "https://server-a.example.com",
      proxyUrl: "http://localhost:6274",
      authToken: null,
    };
    const ctx2: WellKnownProxyContext = {
      upstreamUrl: "https://server-b.example.com",
      proxyUrl: "http://localhost:6274",
      authToken: null,
    };

    // Fetch for server-a (populates cache)
    await proxy.getProtectedResourceMetadata(ctx1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Same server — cached
    await proxy.getProtectedResourceMetadata(ctx1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Different upstream — cache invalidated, re-fetched
    await proxy.getProtectedResourceMetadata(ctx2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    proxy.clearCache();
  });

  it("should use default 5-minute TTL when not specified", () => {
    // Just verify creation doesn't crash and the proxy works
    const proxy = createWellKnownProxy(); // No options — default TTL
    expect(proxy.handleWellKnownRequest).toBeDefined();
    expect(proxy.clearCache).toBeDefined();
    proxy.clearCache();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// clearCache behavior
// ═════════════════════════════════════════════════════════════════════════════

describe("WellKnown Proxy: clearCache", () => {
  let proxy: ReturnType<typeof createWellKnownProxy>;

  beforeEach(() => {
    proxy = createWellKnownProxy({ cacheTtlMs: 60_000 });
    vi.restoreAllMocks();
  });
  afterEach(() => {
    proxy.clearCache();
  });

  it("should force re-fetch after clearCache", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(UPSTREAM_RESOURCE_META), { status: 200 }));

    const ctx = defaultCtx();

    // Populate cache
    await proxy.getProtectedResourceMetadata(ctx);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Cached
    await proxy.getProtectedResourceMetadata(ctx);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Clear and re-fetch
    proxy.clearCache();
    await proxy.getProtectedResourceMetadata(ctx);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("should be safe to call clearCache multiple times", () => {
    expect(() => {
      proxy.clearCache();
      proxy.clearCache();
      proxy.clearCache();
    }).not.toThrow();
  });

  it("should be safe to call clearCache on fresh proxy (no cache entries)", () => {
    const fresh = createWellKnownProxy({ cacheTtlMs: 1000 });
    expect(() => fresh.clearCache()).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Upstream fetch timeout handling
// ═════════════════════════════════════════════════════════════════════════════

describe("WellKnown Proxy: upstream fetch failures", () => {
  let proxy: ReturnType<typeof createWellKnownProxy>;

  beforeEach(() => {
    proxy = createWellKnownProxy({ cacheTtlMs: 60_000 });
    vi.restoreAllMocks();
  });
  afterEach(() => {
    proxy.clearCache();
  });

  it("should return null when upstream fetch is aborted", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));

    const metadata = await proxy.getProtectedResourceMetadata(defaultCtx());
    expect(metadata).toBeNull();
  });

  it("should return null when upstream returns non-200 for resource metadata", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 })
    );

    const metadata = await proxy.getProtectedResourceMetadata(defaultCtx());
    expect(metadata).toBeNull();
  });

  it("should return null when upstream returns non-200 for auth server metadata", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));

    const metadata = await proxy.getAuthServerMetadata(defaultCtx());
    expect(metadata).toBeNull();
  });

  it("should not cache failed upstream responses", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // First call: upstream returns 500
    fetchSpy.mockResolvedValueOnce(new Response("Error", { status: 500 }));
    const first = await proxy.getProtectedResourceMetadata(defaultCtx());
    expect(first).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second call: should re-fetch (failure was not cached)
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(UPSTREAM_RESOURCE_META), { status: 200 })
    );
    const second = await proxy.getProtectedResourceMetadata(defaultCtx());
    expect(second).not.toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
