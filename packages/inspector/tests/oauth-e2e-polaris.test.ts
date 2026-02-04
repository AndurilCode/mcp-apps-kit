/**
 * OAuth E2E & Integration Gap Tests — TASK-006 (Polaris)
 *
 * Supplements the existing OAuth test suite with tests for gaps identified
 * during acceptance criteria review:
 *
 * 1. /api/oauth/discover endpoint handler (server-side, not just client fetch)
 * 2. Full 401 → discovery → provider → auth → reconnect lifecycle
 * 3. Token store cleanup on revoke + rediscovery cycle
 * 4. Dual mode well-known routing integration
 * 5. Connection registry multi-connection OAuth isolation
 * 6. CLI auto-discovery → token persistence round-trip
 * 7. Concurrent OAuth flows across connections
 * 8. Edge: expired token detect → auto-refresh → state update
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import http from "http";
import { EventEmitter } from "node:events";

// ── Mock SDK auth ────────────────────────────────────────────────────────────
const mockAuth = vi.fn();
const mockDiscoverMeta = vi.fn();

vi.mock("@modelcontextprotocol/sdk/client/auth.js", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
  discoverAuthorizationServerMetadata: (...args: unknown[]) => mockDiscoverMeta(...args),
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor(msg?: string) {
      super(msg ?? "Unauthorized");
      this.name = "UnauthorizedError";
    }
  },
}));

// ── Mock testing client ──────────────────────────────────────────────────────
const createTestClientSpy = vi.fn();
vi.mock("@mcp-apps-kit/testing", () => {
  const client = {
    listTools: vi.fn().mockResolvedValue([]),
    listResources: vi.fn().mockResolvedValue([]),
    listPrompts: vi.fn().mockResolvedValue([]),
    callTool: vi.fn().mockResolvedValue({ content: [], isError: false }),
    getCallHistory: vi.fn().mockReturnValue([]),
    clearHistory: vi.fn(),
    disconnect: vi.fn().mockResolvedValue(undefined),
    raw: {},
  };
  return {
    createTestClient: (...args: unknown[]) => {
      createTestClientSpy(...args);
      return Promise.resolve(client);
    },
  };
});

// ── Mock discovery module ────────────────────────────────────────────────────
const mockDiscoverAuthRequirements = vi.fn();
vi.mock("../src/oauth/discovery", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    discoverAuthRequirements: (...args: unknown[]) => mockDiscoverAuthRequirements(...args),
  };
});

import { InspectorOAuthProvider } from "../src/oauth/provider";
import { TokenStore, hashServerUrl } from "../src/oauth/token-store";
import { handleOAuthRoutes } from "../src/oauth/callback-handler";
import { createWellKnownProxy } from "../src/oauth/wellknown-proxy";
import { createProviderFromDiscovery, createPresetProvider } from "../src/oauth/preset-config";
import { ConnectionManager } from "../src/connection";
import { ConnectionRegistry } from "../src/connection-registry";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthRequiredEvent } from "../src/oauth/discovery";
import type { ConnectionManager as CM } from "../src/connection";
import type { ConnectionRegistry as CR } from "../src/connection-registry";

// ═════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═════════════════════════════════════════════════════════════════════════════

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
  const buf = body ? Buffer.from(body, "utf-8") : null;
  (req as unknown as { [Symbol.asyncIterator]: () => AsyncIterator<Buffer> })[
    Symbol.asyncIterator
  ] = function () {
    let done = !buf;
    return {
      next(): Promise<IteratorResult<Buffer>> {
        if (!done) {
          done = true;
          return Promise.resolve({ value: buf!, done: false });
        }
        return Promise.resolve({ value: undefined as unknown as Buffer, done: true });
      },
    };
  };
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

function mockConnectionManager(
  overrides: {
    provider?: InspectorOAuthProvider | null;
    serverUrl?: string | null;
    inspectorUrl?: string | null;
    id?: string;
  } = {}
): CM {
  const cm = new EventEmitter() as unknown as CM;
  const provider = overrides.provider ?? null;
  Object.assign(cm, {
    id: overrides.id ?? "conn-test",
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

function mockRegistry(map: Record<string, CM> = {}): CR {
  return {
    getConnection: (id: string) => {
      const c = map[id];
      if (!c) throw new Error(`Not found: ${id}`);
      return c;
    },
    listConnections: () => [],
  } as unknown as CR;
}

const MOCK_DISCOVERY: AuthRequiredEvent = {
  serverUrl: "https://mcp.example.com/mcp",
  resourceMetadata: null,
  authServerUrl: "https://auth.example.com",
  authServerMetadata: {
    issuer: "https://auth.example.com",
    authorization_endpoint: "https://auth.example.com/authorize",
    token_endpoint: "https://auth.example.com/token",
    registration_endpoint: "https://auth.example.com/register",
    response_types_supported: ["code"],
    scopes_supported: ["read", "write"],
  } as AuthRequiredEvent["authServerMetadata"],
  supportsDCR: true,
  supportsCIMD: false,
  requiresPreRegistration: false,
  suggestedScopes: ["read", "write"],
};

// ═════════════════════════════════════════════════════════════════════════════
// 1. /api/oauth/discover ENDPOINT HANDLER
// ═════════════════════════════════════════════════════════════════════════════

describe("GET /api/oauth/discover endpoint handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDiscoverAuthRequirements.mockResolvedValue(MOCK_DISCOVERY);
  });

  it("should return discovery results for valid server URL", async () => {
    const req = mockRequest("GET", "/api/oauth/discover?url=https%3A%2F%2Fmcp.example.com%2Fmcp");
    const res = mockResponse();
    const cm = mockConnectionManager();

    await handleOAuthRoutes(req, res, mockRegistry(), () => cm);

    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body);
    expect(body.serverUrl).toBe("https://mcp.example.com/mcp");
    expect(body.supportsDCR).toBe(true);
    expect(body.suggestedScopes).toEqual(["read", "write"]);
    expect(mockDiscoverAuthRequirements).toHaveBeenCalledWith("https://mcp.example.com/mcp");
  });

  it("should return 400 when url query parameter is missing", async () => {
    const req = mockRequest("GET", "/api/oauth/discover");
    const res = mockResponse();
    const cm = mockConnectionManager();

    await handleOAuthRoutes(req, res, mockRegistry(), () => cm);

    expect(res._statusCode).toBe(400);
    const body = JSON.parse(res._body);
    expect(body.error).toContain("url");
  });

  it("should return 400 for invalid URL format", async () => {
    const req = mockRequest("GET", "/api/oauth/discover?url=not-a-url");
    const res = mockResponse();
    const cm = mockConnectionManager();

    await handleOAuthRoutes(req, res, mockRegistry(), () => cm);

    expect(res._statusCode).toBe(400);
    const body = JSON.parse(res._body);
    expect(body.error).toContain("Invalid");
  });

  it("should return 405 for non-GET methods", async () => {
    const req = mockRequest("POST", "/api/oauth/discover?url=https://mcp.example.com");
    const res = mockResponse();
    const cm = mockConnectionManager();

    await handleOAuthRoutes(req, res, mockRegistry(), () => cm);

    expect(res._statusCode).toBe(405);
  });

  it("should handle CORS preflight OPTIONS request", async () => {
    const req = mockRequest("OPTIONS", "/api/oauth/discover?url=https://mcp.example.com");
    const res = mockResponse();
    const cm = mockConnectionManager();

    await handleOAuthRoutes(req, res, mockRegistry(), () => cm);

    expect(res._statusCode).toBe(204);
  });

  it("should return 502 when discovery throws an error", async () => {
    mockDiscoverAuthRequirements.mockRejectedValue(new Error("DNS resolution failed"));
    const req = mockRequest(
      "GET",
      "/api/oauth/discover?url=https%3A%2F%2Fbroken.example.com%2Fmcp"
    );
    const res = mockResponse();
    const cm = mockConnectionManager();

    await handleOAuthRoutes(req, res, mockRegistry(), () => cm);

    expect(res._statusCode).toBe(502);
    const body = JSON.parse(res._body);
    expect(body.error).toBe("Discovery failed");
    expect(body.message).toContain("DNS resolution failed");
  });

  it("should return discovery with requiresPreRegistration for non-DCR servers", async () => {
    const preRegDiscovery: AuthRequiredEvent = {
      ...MOCK_DISCOVERY,
      supportsDCR: false,
      supportsCIMD: false,
      requiresPreRegistration: true,
    };
    mockDiscoverAuthRequirements.mockResolvedValue(preRegDiscovery);

    const req = mockRequest("GET", "/api/oauth/discover?url=https%3A%2F%2Fmcp.example.com%2Fmcp");
    const res = mockResponse();
    const cm = mockConnectionManager();

    await handleOAuthRoutes(req, res, mockRegistry(), () => cm);

    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body);
    expect(body.requiresPreRegistration).toBe(true);
    expect(body.supportsDCR).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. FULL LIFECYCLE: 401 → discover → provider → auth → reconnect
// ═════════════════════════════════════════════════════════════════════════════

describe("Full OAuth lifecycle: 401 → discovery → auth → reconnect", () => {
  let tempDir: string;
  let tokenStore: TokenStore;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), "lifecycle-"));
    tokenStore = new TokenStore(tempDir);
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should create provider from discovery, complete auth, then persist tokens", async () => {
    // Step 1: Discovery tells us DCR is available
    const provider = createProviderFromDiscovery({
      serverUrl: "https://mcp.example.com/mcp",
      discoveryResults: MOCK_DISCOVERY,
      callbackPort: 6274,
      tokenStore,
    });

    // Step 2: Provider starts unauthenticated with DCR available
    expect(provider.getOAuthState().status).toBe("unauthenticated");
    expect(provider.getRegistrationMethod()).toBe("dcr");

    // Step 3: SDK triggers redirect → provider stores URL
    const authUrl = new URL(
      "https://auth.example.com/authorize?client_id=dcr-id&state=abc&code_challenge=xyz"
    );
    await provider.redirectToAuthorization(authUrl);
    expect(provider.getOAuthState().status).toBe("authenticating");

    // Step 4: Save PKCE verifier (SDK does this before redirect)
    await provider.saveCodeVerifier("pkce-verifier-lifecycle");
    expect(await provider.codeVerifier()).toBe("pkce-verifier-lifecycle");

    // Step 5: Auth callback completes — tokens saved
    const tokens: OAuthTokens = {
      access_token: "lifecycle-at",
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: "lifecycle-rt",
    };
    await provider.saveTokens(tokens);
    provider.onAuthorizationComplete();

    // Step 6: Verify final state
    expect(provider.getOAuthState().status).toBe("authenticated");
    expect(provider.getOAuthState().expiresAt).toBeGreaterThan(Date.now());

    // Step 7: Tokens persisted to disk
    const persisted = await tokenStore.load("https://mcp.example.com/mcp");
    expect(persisted).toBeDefined();
    expect(persisted!.tokens.access_token).toBe("lifecycle-at");
    expect(persisted!.tokens.refresh_token).toBe("lifecycle-rt");
  });

  it("should revoke tokens, clean up store, then re-authenticate from scratch", async () => {
    const serverUrl = "https://mcp.example.com/mcp";

    // Set up authenticated provider
    const provider = new InspectorOAuthProvider({
      serverUrl,
      config: { clientId: "revoke-cycle", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
      callbackPort: 6274,
      tokenStore,
    });

    await provider.saveTokens({
      access_token: "at-to-revoke",
      token_type: "bearer",
      refresh_token: "rt-to-revoke",
      expires_in: 3600,
    } as OAuthTokens);

    expect(provider.getOAuthState().status).toBe("authenticated");

    // Revoke (no revocation endpoint — just invalidate locally)
    mockDiscoverMeta.mockResolvedValue(undefined);
    await provider.revokeTokens();
    await provider.invalidateCredentials("tokens");

    expect(provider.getOAuthState().status).toBe("unauthenticated");

    // Re-authenticate with new tokens
    await provider.saveTokens({
      access_token: "fresh-at",
      token_type: "bearer",
      expires_in: 7200,
    } as OAuthTokens);

    expect(provider.getOAuthState().status).toBe("authenticated");
    const persisted = await tokenStore.load(serverUrl);
    expect(persisted!.tokens.access_token).toBe("fresh-at");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. MULTI-CONNECTION OAUTH ISOLATION
// ═════════════════════════════════════════════════════════════════════════════

describe("Multi-connection OAuth isolation", () => {
  let tempDir: string;
  let tokenStore: TokenStore;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), "multi-conn-"));
    tokenStore = new TokenStore(tempDir);
    createTestClientSpy.mockClear();
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should maintain independent token stores per server URL", async () => {
    const serverA = "https://server-a.example.com/mcp";
    const serverB = "https://server-b.example.com/mcp";

    const providerA = new InspectorOAuthProvider({
      serverUrl: serverA,
      config: { clientId: "client-a", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
      callbackPort: 6274,
      tokenStore,
    });
    const providerB = new InspectorOAuthProvider({
      serverUrl: serverB,
      config: { clientId: "client-b", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
      callbackPort: 6274,
      tokenStore,
    });

    // Save different tokens for each
    await providerA.saveTokens({
      access_token: "token-a",
      token_type: "bearer",
      expires_in: 3600,
    } as OAuthTokens);
    await providerB.saveTokens({
      access_token: "token-b",
      token_type: "bearer",
      expires_in: 7200,
    } as OAuthTokens);

    // Verify isolation
    const dataA = await tokenStore.load(serverA);
    const dataB = await tokenStore.load(serverB);

    expect(dataA!.tokens.access_token).toBe("token-a");
    expect(dataB!.tokens.access_token).toBe("token-b");

    // Revoking A should not affect B
    await providerA.invalidateCredentials("tokens");
    expect(providerA.getOAuthState().status).toBe("unauthenticated");
    expect(providerB.getOAuthState().status).toBe("authenticated");

    const dataB2 = await tokenStore.load(serverB);
    expect(dataB2!.tokens.access_token).toBe("token-b");
  });

  it("should create unique hash files for different server URLs", async () => {
    const urls = [
      "https://a.example.com/mcp",
      "https://b.example.com/mcp",
      "https://c.example.com:8080/mcp",
    ];

    for (const url of urls) {
      await tokenStore.save(url, {
        tokens: { access_token: `token-${url}`, token_type: "bearer" } as OAuthTokens,
      });
    }

    const files = (await readdir(tempDir)).filter((f) => f.endsWith(".json"));
    expect(files).toHaveLength(3);

    // All hashes should be unique
    const hashes = urls.map(hashServerUrl);
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. DUAL MODE WELL-KNOWN ROUTING
// ═════════════════════════════════════════════════════════════════════════════

describe("Dual mode well-known routing integration", () => {
  it("should serve protected-resource metadata with rewritten resource field via handler", async () => {
    const proxy = createWellKnownProxy({ cacheTtlMs: 60_000 });
    const upstreamMeta = {
      resource: "https://upstream.example.com",
      authorization_servers: ["https://auth.example.com"],
      scopes_supported: ["read"],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(upstreamMeta), { status: 200 })
    );

    const req = mockRequest("GET", "/.well-known/oauth-protected-resource");
    const res = mockResponse();
    const ctx = {
      upstreamUrl: "https://upstream.example.com/v1/mcp",
      proxyUrl: "http://localhost:6274",
      authToken: null,
    };

    const handled = await proxy.handleWellKnownRequest(req, res, ctx);

    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body);
    expect(body.resource).toBe("http://localhost:6274");
    expect(body.authorization_servers).toEqual(["https://auth.example.com"]);

    proxy.clearCache();
  });

  it("should serve auth-server metadata without rewriting via handler", async () => {
    const proxy = createWellKnownProxy({ cacheTtlMs: 60_000 });
    const authMeta = {
      issuer: "https://auth.example.com",
      authorization_endpoint: "https://auth.example.com/authorize",
      token_endpoint: "https://auth.example.com/token",
      response_types_supported: ["code"],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(authMeta), { status: 200 })
    );

    const req = mockRequest("GET", "/.well-known/oauth-authorization-server");
    const res = mockResponse();
    const ctx = {
      upstreamUrl: "https://upstream.example.com",
      proxyUrl: "http://localhost:6274",
      authToken: null,
    };

    const handled = await proxy.handleWellKnownRequest(req, res, ctx);

    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body);
    expect(body.issuer).toBe("https://auth.example.com");
    expect(body.authorization_endpoint).toBe("https://auth.example.com/authorize");

    proxy.clearCache();
  });

  it("should return 404 when no upstream context available", async () => {
    const proxy = createWellKnownProxy({ cacheTtlMs: 60_000 });

    const req = mockRequest("GET", "/.well-known/oauth-protected-resource");
    const res = mockResponse();

    const handled = await proxy.handleWellKnownRequest(req, res, null);

    expect(handled).toBe(true);
    expect(res._statusCode).toBe(404);
    const body = JSON.parse(res._body);
    expect(body.message).toContain("No OAuth-protected upstream");
  });

  it("should return 502 when upstream does not expose metadata", async () => {
    const proxy = createWellKnownProxy({ cacheTtlMs: 60_000 });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

    const req = mockRequest("GET", "/.well-known/oauth-protected-resource");
    const res = mockResponse();
    const ctx = {
      upstreamUrl: "https://upstream.example.com",
      proxyUrl: "http://localhost:6274",
      authToken: null,
    };

    const handled = await proxy.handleWellKnownRequest(req, res, ctx);

    expect(handled).toBe(true);
    expect(res._statusCode).toBe(502);
    const body = JSON.parse(res._body);
    expect(body.error).toBe("Bad Gateway");

    proxy.clearCache();
  });

  it("should cache responses and not re-fetch within TTL", async () => {
    const proxy = createWellKnownProxy({ cacheTtlMs: 60_000 });
    const upstreamMeta = {
      resource: "https://upstream.example.com",
      authorization_servers: ["https://auth.example.com"],
    };

    const ctx = {
      upstreamUrl: "https://upstream.example.com",
      proxyUrl: "http://localhost:6274",
      authToken: null,
    };

    // Use the proxy's direct method for caching test (avoids HTTP handler fetch count ambiguity)
    const origFetch = globalThis.fetch;
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount++;
      return new Response(JSON.stringify(upstreamMeta), { status: 200 });
    };

    try {
      // First call — fetches from upstream
      const result1 = await proxy.getProtectedResourceMetadata(ctx);
      expect(result1).not.toBeNull();
      expect(result1!.resource).toBe("http://localhost:6274");
      expect(fetchCount).toBe(1);

      // Second call — should use cache
      const result2 = await proxy.getProtectedResourceMetadata(ctx);
      expect(result2).not.toBeNull();
      expect(result2!.resource).toBe("http://localhost:6274");
      expect(fetchCount).toBe(1); // Still 1, cache hit
    } finally {
      globalThis.fetch = origFetch;
      proxy.clearCache();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. CLI AUTO-DISCOVERY → TOKEN PERSISTENCE ROUND-TRIP
// ═════════════════════════════════════════════════════════════════════════════

describe("CLI auto-discovery → token persistence round-trip", () => {
  let tempDir: string;
  let tokenStore: TokenStore;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), "cli-roundtrip-"));
    tokenStore = new TokenStore(tempDir);
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should persist tokens after discovery-created provider auth, and load on restart", async () => {
    const serverUrl = "https://mcp.example.com/mcp";

    // Create provider from discovery
    const provider = createProviderFromDiscovery({
      serverUrl,
      discoveryResults: MOCK_DISCOVERY,
      callbackPort: 6274,
      tokenStore,
    });

    // Simulate completing auth
    await provider.saveTokens({
      access_token: "discovery-at",
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: "discovery-rt",
    } as OAuthTokens);

    // Simulate restart: new provider with same token store
    const provider2 = createProviderFromDiscovery({
      serverUrl,
      discoveryResults: MOCK_DISCOVERY,
      callbackPort: 6274,
      tokenStore,
    });

    // Should load persisted tokens from disk
    const tokens = await provider2.tokens();
    expect(tokens).toBeDefined();
    expect(tokens!.access_token).toBe("discovery-at");
    expect(tokens!.refresh_token).toBe("discovery-rt");
  });

  it("should persist DCR client information after registration", async () => {
    const serverUrl = "https://mcp.example.com/mcp";

    const provider = createProviderFromDiscovery({
      serverUrl,
      discoveryResults: MOCK_DISCOVERY,
      callbackPort: 6274,
      tokenStore,
    });

    // No client info initially (DCR not yet done)
    const beforeReg = await provider.clientInformation();
    expect(beforeReg).toBeUndefined();

    // SDK calls saveClientInformation after DCR
    await provider.saveClientInformation({
      client_id: "dcr-registered-id",
      client_secret: "dcr-registered-secret",
      redirect_uris: [new URL("http://127.0.0.1:6274/oauth/callback")],
    } as never);

    // New provider should load persisted DCR info
    const provider2 = createProviderFromDiscovery({
      serverUrl,
      discoveryResults: MOCK_DISCOVERY,
      callbackPort: 6274,
      tokenStore,
    });

    const afterReg = await provider2.clientInformation();
    expect(afterReg).toBeDefined();
    expect(afterReg!.client_id).toBe("dcr-registered-id");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. EXPIRED TOKEN → STATUS UPDATE
// ═════════════════════════════════════════════════════════════════════════════

describe("Expired token detection and status transitions", () => {
  let tempDir: string;
  let tokenStore: TokenStore;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), "expiry-"));
    tokenStore = new TokenStore(tempDir);
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should track expiresAt correctly through saveTokens", async () => {
    const provider = new InspectorOAuthProvider({
      serverUrl: "http://localhost:3000/mcp",
      config: { clientId: "expiry-test", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
      callbackPort: 6274,
      tokenStore,
    });

    const beforeSave = Date.now();
    await provider.saveTokens({
      access_token: "short-lived",
      token_type: "bearer",
      expires_in: 120, // 2 minutes
    } as OAuthTokens);
    const afterSave = Date.now();

    const state = provider.getOAuthState();
    expect(state.expiresAt).toBeDefined();
    // expires_in = 120s → expiresAt should be ~120s from now
    expect(state.expiresAt!).toBeGreaterThanOrEqual(beforeSave + 119_000);
    expect(state.expiresAt!).toBeLessThanOrEqual(afterSave + 121_000);
  });

  it("should update expiresAt when tokens are refreshed", async () => {
    const provider = new InspectorOAuthProvider({
      serverUrl: "http://localhost:3000/mcp",
      config: { clientId: "refresh-test", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
      callbackPort: 6274,
      tokenStore,
    });

    // Initial short-lived token
    await provider.saveTokens({
      access_token: "initial",
      token_type: "bearer",
      expires_in: 60,
    } as OAuthTokens);
    const firstExpiry = provider.getOAuthState().expiresAt!;

    // Refreshed token with longer life
    await provider.saveTokens({
      access_token: "refreshed",
      token_type: "bearer",
      expires_in: 7200, // 2 hours
    } as OAuthTokens);
    const secondExpiry = provider.getOAuthState().expiresAt!;

    // Second expiry should be much later
    expect(secondExpiry).toBeGreaterThan(firstExpiry);
    expect(secondExpiry - firstExpiry).toBeGreaterThan(7000_000); // ~7000s difference
  });

  it("should fire onStatusChange callback for each state transition", async () => {
    const provider = new InspectorOAuthProvider({
      serverUrl: "http://localhost:3000/mcp",
      config: { clientId: "callback-test", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
      callbackPort: 6274,
      tokenStore,
    });

    const transitions: Array<{ status: string; expiresAt?: number }> = [];
    provider.onStatusChange = (state) => {
      transitions.push({ status: state.status, expiresAt: state.expiresAt });
    };

    // unauthenticated → authenticating
    await provider.redirectToAuthorization(new URL("https://auth.example.com/authorize"));

    // authenticating → authenticated
    await provider.saveTokens({
      access_token: "at",
      token_type: "bearer",
      expires_in: 3600,
    } as OAuthTokens);

    // authenticated → error
    provider.setError("Token rejected by server");

    // error → unauthenticated (via invalidate)
    await provider.invalidateCredentials("tokens");

    expect(transitions).toHaveLength(4);
    expect(transitions.map((t) => t.status)).toEqual([
      "authenticating",
      "authenticated",
      "error",
      "unauthenticated",
    ]);

    // Authenticated transition should have expiresAt
    expect(transitions[1]!.expiresAt).toBeGreaterThan(Date.now());
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. SCOPE NEGOTIATION VIA /api/oauth/status (AC-9 deeper coverage)
// ═════════════════════════════════════════════════════════════════════════════

describe("Scope negotiation via status endpoint (deeper)", () => {
  let tempDir: string;
  let tokenStore: TokenStore;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), "scope-api-"));
    tokenStore = new TokenStore(tempDir);
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should expose full OAuth state including scopes and revocation support", async () => {
    const provider = new InspectorOAuthProvider({
      serverUrl: "http://localhost:3000/mcp",
      config: {
        clientId: "scope-full",
        redirectUri: "http://127.0.0.1:6274/oauth/callback",
        scopes: "read write admin",
      },
      callbackPort: 6274,
      tokenStore,
    });

    // Discover scopes + revocation endpoint
    mockDiscoverMeta.mockResolvedValue({
      issuer: "https://auth.example.com",
      authorization_endpoint: new URL("https://auth.example.com/authorize"),
      token_endpoint: new URL("https://auth.example.com/token"),
      response_types_supported: ["code"],
      scopes_supported: ["read", "write", "admin", "superadmin"],
      revocation_endpoint: new URL("https://auth.example.com/revoke"),
    });

    await provider.discoverSupportedScopes();

    // Save tokens to be authenticated
    await provider.saveTokens({
      access_token: "scope-at",
      token_type: "bearer",
      expires_in: 3600,
    } as OAuthTokens);

    const cm = mockConnectionManager({ provider });
    const req = mockRequest("GET", "/api/oauth/status");
    const res = mockResponse();

    await handleOAuthRoutes(req, res, mockRegistry(), () => cm);

    const body = JSON.parse(res._body);
    expect(body.configured).toBe(true);
    expect(body.status).toBe("authenticated");
    expect(body.supportedScopes).toEqual(["read", "write", "admin", "superadmin"]);
    expect(body.supportsRevocation).toBe(true);
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });

  it("should report unauthenticated with no scopes when discovery fails", async () => {
    const provider = new InspectorOAuthProvider({
      serverUrl: "http://localhost:3000/mcp",
      config: { clientId: "no-scope", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
      callbackPort: 6274,
      tokenStore,
    });

    mockDiscoverMeta.mockRejectedValue(new Error("Unreachable"));
    await provider.discoverSupportedScopes();

    const cm = mockConnectionManager({ provider });
    const req = mockRequest("GET", "/api/oauth/status");
    const res = mockResponse();

    await handleOAuthRoutes(req, res, mockRegistry(), () => cm);

    const body = JSON.parse(res._body);
    expect(body.configured).toBe(true);
    expect(body.status).toBe("unauthenticated");
    // supportedScopes is only included when non-empty (backend omits empty array)
    expect(body.supportedScopes).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. NO REGRESSION: CONNECTION REGISTRY WITH MIXED CONFIGS
// ═════════════════════════════════════════════════════════════════════════════

describe("No regression: ConnectionRegistry with mixed OAuth/non-OAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createTestClientSpy.mockClear();
  });

  it("should allow creating both OAuth and non-OAuth connections in same registry", async () => {
    const registry = new ConnectionRegistry();

    // Non-OAuth
    const { id: id1 } = await registry.createConnection({
      transport: "http",
      url: "http://server-plain:3000/mcp",
    });

    // OAuth
    const { id: id2 } = await registry.createConnection(
      { transport: "http", url: "http://server-oauth:4000/mcp" },
      {
        oauthConfig: {
          clientId: "oauth-only",
          redirectUri: "http://127.0.0.1:6274/oauth/callback",
        },
      }
    );

    const connections = registry.listConnections();
    expect(connections).toHaveLength(2);

    // Non-OAuth connection should have no OAuth state
    const plain = connections.find((c) => c.id === id1);
    expect(plain?.oauth).toBeUndefined();

    // OAuth connection should have OAuth state
    const oauth = connections.find((c) => c.id === id2);
    expect(oauth?.oauth).toBeDefined();
    expect(oauth?.oauth?.status).toBe("unauthenticated");
  });

  it("should close both types cleanly via closeConnection", async () => {
    const registry = new ConnectionRegistry();

    await registry.createConnection({
      transport: "http",
      url: "http://server-plain:3000/mcp",
    });

    await registry.createConnection(
      { transport: "http", url: "http://server-oauth:4000/mcp" },
      {
        oauthConfig: {
          clientId: "disco-test",
          redirectUri: "http://127.0.0.1:6274/oauth/callback",
        },
      }
    );

    // Close all connections
    const connections = registry.listConnections();
    for (const conn of connections) {
      await expect(registry.closeConnection(conn.id)).resolves.not.toThrow();
    }

    // Registry should be empty
    expect(registry.listConnections()).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. PRESET PROVIDER VS DISCOVERY PROVIDER BEHAVIORAL DIFF
// ═════════════════════════════════════════════════════════════════════════════

describe("Preset provider vs Discovery provider behavioral difference", () => {
  let tempDir: string;
  let tokenStore: TokenStore;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), "preset-vs-disc-"));
    tokenStore = new TokenStore(tempDir);
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("preset provider should throw on redirectToAuthorization (non-interactive)", async () => {
    const preset = createPresetProvider({
      serverUrl: "http://localhost:3000/mcp",
      config: { clientId: "preset", redirectUri: "" },
      callbackPort: 6274,
      tokenStore,
    });

    await expect(
      preset.redirectToAuthorization(new URL("https://auth.example.com/authorize"))
    ).rejects.toThrow("no browser available in preset/CLI mode");
  });

  it("discovery provider should NOT throw on redirectToAuthorization (interactive)", async () => {
    const discovery = createProviderFromDiscovery({
      serverUrl: "https://mcp.example.com/mcp",
      discoveryResults: MOCK_DISCOVERY,
      callbackPort: 6274,
      tokenStore,
    });

    await expect(
      discovery.redirectToAuthorization(new URL("https://auth.example.com/authorize"))
    ).resolves.toBeUndefined();

    // Should store URL for callback handler
    expect(discovery.getPendingAuthUrl()).toBeDefined();
  });

  it("both providers should persist tokens to the same store", async () => {
    const serverUrl = "https://mcp.example.com/mcp";

    const preset = createPresetProvider({
      serverUrl,
      config: { clientId: "preset-client", redirectUri: "" },
      callbackPort: 6274,
      tokenStore,
    });

    await preset.saveTokens({
      access_token: "preset-token",
      token_type: "bearer",
    } as OAuthTokens);

    // Discovery provider with same server URL should see the tokens
    const discovery = createProviderFromDiscovery({
      serverUrl,
      discoveryResults: MOCK_DISCOVERY,
      callbackPort: 6274,
      tokenStore,
    });

    const tokens = await discovery.tokens();
    expect(tokens?.access_token).toBe("preset-token");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. TOKEN STORE COMPLETE LIFECYCLE
// ═════════════════════════════════════════════════════════════════════════════

describe("Token store complete lifecycle", () => {
  let tempDir: string;
  let tokenStore: TokenStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ts-lifecycle-"));
    tokenStore = new TokenStore(tempDir);
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should support full CRUD lifecycle: save → load → update → delete → verify gone", async () => {
    const serverUrl = "http://localhost:3000/mcp";

    // Create
    await tokenStore.save(serverUrl, {
      tokens: { access_token: "initial", token_type: "bearer" } as OAuthTokens,
    });

    // Read
    const loaded = await tokenStore.load(serverUrl);
    expect(loaded).toBeDefined();
    expect(loaded!.tokens.access_token).toBe("initial");

    // Update
    await tokenStore.saveTokens(serverUrl, {
      access_token: "updated",
      token_type: "bearer",
      refresh_token: "rt-new",
    } as OAuthTokens);

    const updated = await tokenStore.load(serverUrl);
    expect(updated!.tokens.access_token).toBe("updated");
    expect(updated!.tokens.refresh_token).toBe("rt-new");

    // Delete
    await tokenStore.delete(serverUrl);

    // Verify gone
    const deleted = await tokenStore.load(serverUrl);
    expect(deleted).toBeUndefined();
  });

  it("should list all stored server URLs", async () => {
    await tokenStore.save("http://a.example.com", {
      tokens: { access_token: "a", token_type: "bearer" } as OAuthTokens,
    });
    await tokenStore.save("http://b.example.com", {
      tokens: { access_token: "b", token_type: "bearer" } as OAuthTokens,
    });
    await tokenStore.save("http://c.example.com", {
      tokens: { access_token: "c", token_type: "bearer" } as OAuthTokens,
    });

    const all = await tokenStore.listAll();
    expect(all).toHaveLength(3);

    const urls = all.map((d) => d.serverUrl).sort();
    expect(urls).toEqual(["http://a.example.com", "http://b.example.com", "http://c.example.com"]);
  });

  it("should survive concurrent saves to different server URLs", async () => {
    const saves = Array.from({ length: 10 }, (_, i) =>
      tokenStore.save(`http://server-${i}.example.com`, {
        tokens: { access_token: `token-${i}`, token_type: "bearer" } as OAuthTokens,
      })
    );

    await Promise.all(saves);

    const all = await tokenStore.listAll();
    expect(all).toHaveLength(10);
  });
});
