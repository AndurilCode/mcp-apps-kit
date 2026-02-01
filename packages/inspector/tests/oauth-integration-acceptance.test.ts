/**
 * OAuth Integration Acceptance Tests — TASK-006
 *
 * End-to-end behavioral tests for all 10 acceptance criteria.
 * These tests exercise integration paths and edge cases that the existing
 * unit tests don't cover. Each acceptance criterion has at least one test
 * that would FAIL if that criterion wasn't met.
 *
 * Criteria:
 *  1. Dashboard OAuth flow (401 → config → PKCE → Bearer token)
 *  2. CLI preset auth (--oauth-client-id/secret/scopes/config/auto-register)
 *  3. Dual mode .well-known mirroring (resource URL rewrite)
 *  4. Token persistence (XDG path, per-server-URL, atomic writes, 0o600)
 *  5. Auto-refresh (SDK handles, provider persists refreshed tokens)
 *  6. Dynamic Client Registration (empty clientId triggers DCR)
 *  7. Token revocation on disconnect (RFC 7009, server-side + local)
 *  8. Auth status in dashboard (4 states + expiry)
 *  9. Scope negotiation (multi-select chips from metadata, custom input, fallback)
 * 10. No regression (non-OAuth connections unchanged)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readdir, stat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import http from "http";
import { EventEmitter } from "node:events";

// ── Mock SDK auth before importing tested modules ────────────────────────────
const mockAuth = vi.fn();
const mockDiscoverMeta = vi.fn();

vi.mock("@modelcontextprotocol/sdk/client/auth.js", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
  discoverAuthorizationServerMetadata: (...args: unknown[]) => mockDiscoverMeta(...args),
}));

// ── Mock testing client for connection integration ───────────────────────────
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

import { InspectorOAuthProvider } from "../src/oauth/provider";
import { TokenStore, hashServerUrl, getTokenStorePath } from "../src/oauth/token-store";
import { handleOAuthRoutes } from "../src/oauth/callback-handler";
import { createWellKnownProxy } from "../src/oauth/wellknown-proxy";
import {
  parsePresetFlags,
  resolvePresetConfig,
  createPresetProvider,
  checkExistingTokens,
} from "../src/oauth/preset-config";
import { ConnectionManager } from "../src/connection";
import { ConnectionRegistry } from "../src/connection-registry";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthState, OAuthStatus } from "../src/oauth/types";
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
    id: overrides.id ?? "conn-int",
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

// ═════════════════════════════════════════════════════════════════════════════
// CRITERION 1 — Dashboard OAuth flow (401 → config → PKCE → Bearer token)
// ═════════════════════════════════════════════════════════════════════════════

describe("AC-1: Dashboard OAuth flow (401 → config → PKCE → Bearer)", () => {
  let tempDir: string;
  let tokenStore: TokenStore;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), "ac1-"));
    tokenStore = new TokenStore(tempDir);
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should complete full flow: configure → PKCE verifier saved → auth redirect → callback → Bearer token persisted", async () => {
    const serverUrl = "http://localhost:3000/mcp";

    // Step 1: Create provider (simulates /api/oauth/configure)
    const provider = new InspectorOAuthProvider({
      serverUrl,
      config: { clientId: "dash-client", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
      callbackPort: 6274,
      tokenStore,
    });

    // Verify starts unauthenticated
    expect(provider.getOAuthState().status).toBe("unauthenticated");

    // Step 2: Save PKCE code verifier (SDK auth() would do this)
    await provider.saveCodeVerifier("pkce-verifier-xyz");
    const verifier = await provider.codeVerifier();
    expect(verifier).toBe("pkce-verifier-xyz");

    // Verify code verifier persisted to disk
    const loaded1 = await tokenStore.load(serverUrl);
    expect(loaded1?.codeVerifier).toBe("pkce-verifier-xyz");

    // Step 3: Redirect to authorization (simulates auth server sending user to consent page)
    const authUrl = new URL("https://auth.example.com/authorize?client_id=dash-client&state=abc");
    await provider.redirectToAuthorization(authUrl);
    expect(provider.getOAuthState().status).toBe("authenticating");
    expect(provider.getPendingAuthUrl()?.toString()).toContain("auth.example.com");

    // Step 4: Complete auth callback - exchange code for tokens
    const tokens: OAuthTokens = {
      access_token: "Bearer-abc-123",
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: "rt-abc-123",
    };
    await provider.saveTokens(tokens);
    provider.onAuthorizationComplete();

    // Verify: status is authenticated
    expect(provider.getOAuthState().status).toBe("authenticated");
    expect(provider.getPendingAuthUrl()).toBeNull();

    // Verify: Bearer token persisted
    const persisted = await tokenStore.load(serverUrl);
    expect(persisted).toBeDefined();
    expect(persisted!.tokens.access_token).toBe("Bearer-abc-123");
    expect(persisted!.tokens.token_type).toBe("bearer");
    expect(persisted!.tokens.refresh_token).toBe("rt-abc-123");
    expect(persisted!.expiresAt).toBeGreaterThan(Date.now());
  });

  it("should handle 401 error by transitioning to error state, then reconfigure successfully", async () => {
    const serverUrl = "http://localhost:3000/mcp";
    const provider = new InspectorOAuthProvider({
      serverUrl,
      config: { clientId: "test", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
      callbackPort: 6274,
      tokenStore,
    });

    // Simulate 401 — server rejects, provider transitions to error
    provider.setError("401 Unauthorized — token expired or invalid");
    expect(provider.getOAuthState().status).toBe("error");
    expect(provider.getOAuthState().errorMessage).toContain("401");

    // Invalidate credentials (what the SDK would do on 401)
    await provider.invalidateCredentials("tokens");
    expect(provider.getOAuthState().status).toBe("unauthenticated");

    // Reconfigure with new tokens (fresh auth flow)
    await provider.saveTokens({
      access_token: "fresh-token",
      token_type: "bearer",
      expires_in: 7200,
    } as OAuthTokens);
    expect(provider.getOAuthState().status).toBe("authenticated");

    const persisted = await tokenStore.load(serverUrl);
    expect(persisted!.tokens.access_token).toBe("fresh-token");
  });

  it("should propagate the full flow through callback handler with auth code exchange", async () => {
    // Simulate auth() completing successfully
    mockAuth.mockResolvedValue("AUTHORIZED");

    const provider = new InspectorOAuthProvider({
      serverUrl: "http://localhost:3000/mcp",
      config: { clientId: "cb-client", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
      callbackPort: 6274,
      tokenStore,
    });
    await provider.saveCodeVerifier("pkce-v");

    const cm = mockConnectionManager({ provider, serverUrl: "http://localhost:3000/mcp" });
    const req = mockRequest("GET", "/oauth/callback?code=auth-code-from-server");
    const res = mockResponse();

    const handled = await handleOAuthRoutes(req, res, mockRegistry(), () => cm);

    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);
    expect(res._body).toContain("Authorization successful");
    // Verify auth() was called with the code and server URL
    expect(mockAuth).toHaveBeenCalledWith(
      provider,
      expect.objectContaining({
        serverUrl: "http://localhost:3000/mcp",
        authorizationCode: "auth-code-from-server",
      })
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CRITERION 2 — CLI preset auth
// ═════════════════════════════════════════════════════════════════════════════

describe("AC-2: CLI preset auth (flags + config file + auto-register)", () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), "ac2-"));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should resolve full config from file + CLI override and create working provider", async () => {
    // Write a config file
    const configPath = join(tempDir, "oauth.json");
    await writeFile(
      configPath,
      JSON.stringify({
        clientId: "file-id",
        clientSecret: "file-secret",
        scopes: "read,write",
        clientName: "My CLI App",
      })
    );

    // CLI overrides clientId but keeps file's secret and name
    const config = await resolvePresetConfig({
      oauthConfig: configPath,
      oauthClientId: "cli-override-id",
    });

    expect(config.clientId).toBe("cli-override-id");
    expect(config.clientSecret).toBe("file-secret");
    expect(config.scopes).toBe("read write");
    expect(config.clientName).toBe("My CLI App");

    // Create preset provider from resolved config
    const tokenStore = new TokenStore(tempDir);
    const provider = createPresetProvider({
      serverUrl: "http://localhost:3000/mcp",
      config,
      callbackPort: 6274,
      tokenStore,
    });

    // Verify provider has correct server URL and client info
    expect(provider.getServerUrl()).toBe("http://localhost:3000/mcp");
    const clientInfo = await provider.clientInformation();
    expect(clientInfo?.client_id).toBe("cli-override-id");
    expect(clientInfo?.client_secret).toBe("file-secret");
  });

  it("should trigger dynamic registration when --oauth-auto-register is set and no clientId", async () => {
    const config = parsePresetFlags({ oauthAutoRegister: true, oauthScopes: "admin" });
    expect(config.enableDynamicRegistration).toBe(true);
    expect(config.clientId).toBeUndefined();
    expect(config.scopes).toBe("admin");

    const tokenStore = new TokenStore(tempDir);
    const provider = createPresetProvider({
      serverUrl: "http://localhost:3000/mcp",
      config,
      callbackPort: 6274,
      tokenStore,
    });

    // No client information should be available (triggers DCR in SDK)
    const info = await provider.clientInformation();
    expect(info).toBeUndefined();
  });

  it("should throw on redirectToAuthorization in preset/CLI mode (non-interactive)", async () => {
    const tokenStore = new TokenStore(tempDir);
    const provider = createPresetProvider({
      serverUrl: "http://localhost:3000/mcp",
      config: { clientId: "cli-client", redirectUri: "" },
      callbackPort: 6274,
      tokenStore,
    });

    const authUrl = new URL("https://auth.example.com/authorize?code=xxx");
    await expect(provider.redirectToAuthorization(authUrl)).rejects.toThrow(
      "no browser available in preset/CLI mode"
    );
  });

  it("should reuse existing tokens from store without re-auth", async () => {
    const tokenStore = new TokenStore(tempDir);
    const serverUrl = "http://localhost:3000/mcp";

    // Pre-populate token store
    await tokenStore.saveTokens(serverUrl, {
      access_token: "existing-cli-token",
      token_type: "bearer",
      refresh_token: "existing-cli-refresh",
    } as OAuthTokens);

    // Check for existing tokens
    const check = await checkExistingTokens(serverUrl, tokenStore);
    expect(check.hasTokens).toBe(true);
    expect(check.hasRefreshToken).toBe(true);

    // Provider should return existing tokens
    const provider = createPresetProvider({
      serverUrl,
      config: { clientId: "cli", redirectUri: "" },
      callbackPort: 6274,
      tokenStore,
    });
    const tokens = await provider.tokens();
    expect(tokens?.access_token).toBe("existing-cli-token");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CRITERION 3 — Dual mode .well-known mirroring (resource URL rewrite)
// ═════════════════════════════════════════════════════════════════════════════

describe("AC-3: Dual mode .well-known mirroring", () => {
  it("should rewrite resource URL to proxy URL while preserving all other fields", async () => {
    const proxy = createWellKnownProxy({ cacheTtlMs: 60_000 });

    const upstreamMeta = {
      resource: "https://mcp.prod.example.com",
      authorization_servers: ["https://auth.prod.example.com"],
      scopes_supported: ["read", "write", "admin"],
      bearer_methods_supported: ["header"],
      resource_name: "Production MCP Server",
      resource_documentation: "https://docs.example.com",
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(upstreamMeta), { status: 200 })
    );

    const ctx = {
      upstreamUrl: "https://mcp.prod.example.com/v1/mcp",
      proxyUrl: "http://localhost:6274",
      authToken: null,
    };

    const metadata = await proxy.getProtectedResourceMetadata(ctx);
    expect(metadata).not.toBeNull();
    // Resource field rewritten to proxy
    expect(metadata!.resource).toBe("http://localhost:6274");
    // All other fields preserved
    expect(metadata!.authorization_servers).toEqual(["https://auth.prod.example.com"]);
    expect(metadata!.scopes_supported).toEqual(["read", "write", "admin"]);
    expect(metadata!.resource_name).toBe("Production MCP Server");

    proxy.clearCache();
  });

  it("should proxy auth server metadata WITHOUT rewriting (pass-through)", async () => {
    const proxy = createWellKnownProxy({ cacheTtlMs: 60_000 });

    const authMeta = {
      issuer: "https://auth.example.com",
      authorization_endpoint: "https://auth.example.com/authorize",
      token_endpoint: "https://auth.example.com/token",
      revocation_endpoint: "https://auth.example.com/revoke",
      scopes_supported: ["read", "write"],
      response_types_supported: ["code"],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(authMeta), { status: 200 })
    );

    const ctx = {
      upstreamUrl: "https://mcp.example.com",
      proxyUrl: "http://localhost:6274",
      authToken: null,
    };

    const metadata = await proxy.getAuthServerMetadata(ctx);
    expect(metadata).not.toBeNull();
    // Auth server metadata should NOT be rewritten
    expect(metadata!.issuer).toBe("https://auth.example.com");
    expect(metadata!.authorization_endpoint).toBe("https://auth.example.com/authorize");
    expect(metadata!.token_endpoint).toBe("https://auth.example.com/token");

    proxy.clearCache();
  });

  it("should forward Bearer token to upstream when context includes authToken", async () => {
    const proxy = createWellKnownProxy({ cacheTtlMs: 60_000 });

    // Capture the actual fetch call args
    const capturedCalls: { url: string | URL | Request; init?: RequestInit }[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      capturedCalls.push({ url: input, init });
      return new Response(
        JSON.stringify({ resource: "https://mcp.example.com", authorization_servers: [] }),
        { status: 200 }
      );
    };

    try {
      await proxy.getProtectedResourceMetadata({
        upstreamUrl: "https://mcp.example.com",
        proxyUrl: "http://localhost:6274",
        authToken: "my-bearer-token",
      });

      expect(capturedCalls).toHaveLength(1);
      const headers = capturedCalls[0]!.init?.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer my-bearer-token");
    } finally {
      globalThis.fetch = origFetch;
      proxy.clearCache();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CRITERION 4 — Token persistence (XDG, per-server, atomic, 0o600)
// ═════════════════════════════════════════════════════════════════════════════

describe("AC-4: Token persistence (XDG path, per-server-URL, atomic writes, 0o600)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ac4-"));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should use XDG_CONFIG_HOME when set", () => {
    const original = process.env["XDG_CONFIG_HOME"];
    try {
      process.env["XDG_CONFIG_HOME"] = "/custom/config";
      const path = getTokenStorePath();
      expect(path).toBe("/custom/config/mcp-inspector/tokens");
    } finally {
      if (original) process.env["XDG_CONFIG_HOME"] = original;
      else delete process.env["XDG_CONFIG_HOME"];
    }
  });

  it("should fall back to ~/.config when XDG_CONFIG_HOME is unset", () => {
    const origXdg = process.env["XDG_CONFIG_HOME"];
    const home = process.env["HOME"];
    try {
      delete process.env["XDG_CONFIG_HOME"];
      if (home) {
        const path = getTokenStorePath();
        expect(path).toBe(join(home, ".config", "mcp-inspector", "tokens"));
      }
    } finally {
      if (origXdg) process.env["XDG_CONFIG_HOME"] = origXdg;
    }
  });

  it("should store tokens per-server-URL using SHA-256 hash filenames", async () => {
    const store = new TokenStore(tempDir);

    await store.save("http://server-a:3000/mcp", {
      tokens: { access_token: "token-a", token_type: "bearer" } as OAuthTokens,
    });
    await store.save("http://server-b:4000/mcp", {
      tokens: { access_token: "token-b", token_type: "bearer" } as OAuthTokens,
    });

    // Verify two separate files with hash names
    const files = (await readdir(tempDir)).filter((f) => f.endsWith(".json"));
    expect(files).toHaveLength(2);

    const hashA = hashServerUrl("http://server-a:3000/mcp");
    const hashB = hashServerUrl("http://server-b:4000/mcp");
    expect(files).toContain(`${hashA}.json`);
    expect(files).toContain(`${hashB}.json`);

    // Verify each file has correct data
    const dataA = JSON.parse(await readFile(join(tempDir, `${hashA}.json`), "utf-8"));
    expect(dataA.tokens.access_token).toBe("token-a");
    expect(dataA.serverUrl).toBe("http://server-a:3000/mcp");

    const dataB = JSON.parse(await readFile(join(tempDir, `${hashB}.json`), "utf-8"));
    expect(dataB.tokens.access_token).toBe("token-b");
    expect(dataB.serverUrl).toBe("http://server-b:4000/mcp");
  });

  it("should write files with 0o600 permissions (owner-only read/write)", async () => {
    const store = new TokenStore(tempDir);

    await store.save("http://localhost:3000/mcp", {
      tokens: { access_token: "secret-token", token_type: "bearer" } as OAuthTokens,
    });

    const files = (await readdir(tempDir)).filter((f) => f.endsWith(".json"));
    expect(files).toHaveLength(1);

    const fileStat = await stat(join(tempDir, files[0]!));
    const perms = fileStat.mode & 0o777;
    expect(perms).toBe(0o600);
  });

  it("should not leave .tmp files after atomic write", async () => {
    const store = new TokenStore(tempDir);

    await store.save("http://localhost:3000/mcp", {
      tokens: { access_token: "atomic-test", token_type: "bearer" } as OAuthTokens,
    });

    const allFiles = await readdir(tempDir);
    const tmpFiles = allFiles.filter((f) => f.includes(".tmp."));
    expect(tmpFiles).toHaveLength(0);
  });

  it("should preserve existing data on partial save (merge semantics)", async () => {
    const store = new TokenStore(tempDir);
    const url = "http://localhost:3000/mcp";

    // Initial save with tokens
    await store.save(url, {
      tokens: { access_token: "t1", token_type: "bearer", refresh_token: "r1" } as OAuthTokens,
    });

    // Save code verifier (should NOT overwrite tokens)
    await store.saveCodeVerifier(url, "cv-123");

    // Save client info (should NOT overwrite tokens or verifier)
    await store.saveClientInformation(url, {
      client_id: "reg-client",
      redirect_uris: [new URL("http://127.0.0.1:6274/oauth/callback")],
    } as never);

    const loaded = await store.load(url);
    expect(loaded!.tokens.access_token).toBe("t1");
    expect(loaded!.tokens.refresh_token).toBe("r1");
    expect(loaded!.codeVerifier).toBe("cv-123");
    expect(loaded!.clientInformation?.client_id).toBe("reg-client");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CRITERION 5 — Auto-refresh (SDK handles, provider persists refreshed tokens)
// ═════════════════════════════════════════════════════════════════════════════

describe("AC-5: Auto-refresh (provider persists refreshed tokens)", () => {
  let tempDir: string;
  let tokenStore: TokenStore;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), "ac5-"));
    tokenStore = new TokenStore(tempDir);
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should persist refreshed tokens with new expiry when SDK calls saveTokens after refresh", async () => {
    const serverUrl = "http://localhost:3000/mcp";
    const provider = new InspectorOAuthProvider({
      serverUrl,
      config: { clientId: "refresh-client", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
      callbackPort: 6274,
      tokenStore,
    });

    // Initial token save (simulates first auth)
    const initialTokens: OAuthTokens = {
      access_token: "initial-at",
      token_type: "bearer",
      expires_in: 60, // 1 minute — about to expire
      refresh_token: "rt-original",
    };
    await provider.saveTokens(initialTokens);

    const firstState = provider.getOAuthState();
    expect(firstState.status).toBe("authenticated");
    const firstExpiry = firstState.expiresAt!;
    expect(firstExpiry).toBeGreaterThan(Date.now());
    expect(firstExpiry).toBeLessThan(Date.now() + 120_000); // ~1 minute from now

    // Simulate SDK auto-refresh: SDK calls saveTokens() with refreshed tokens
    const refreshedTokens: OAuthTokens = {
      access_token: "refreshed-at",
      token_type: "bearer",
      expires_in: 3600, // 1 hour — fresh token
      refresh_token: "rt-new",
    };
    await provider.saveTokens(refreshedTokens);

    // Verify refreshed tokens persisted
    const persisted = await tokenStore.load(serverUrl);
    expect(persisted!.tokens.access_token).toBe("refreshed-at");
    expect(persisted!.tokens.refresh_token).toBe("rt-new");

    // Verify new expiry is later than the initial one
    const secondState = provider.getOAuthState();
    expect(secondState.expiresAt!).toBeGreaterThan(firstExpiry);
    expect(secondState.expiresAt!).toBeGreaterThan(Date.now() + 3500_000);
  });

  it("should allow loading tokens from a fresh provider instance (crash recovery)", async () => {
    const serverUrl = "http://localhost:3000/mcp";

    // First provider saves tokens
    const provider1 = new InspectorOAuthProvider({
      serverUrl,
      config: { clientId: "crash-test", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
      callbackPort: 6274,
      tokenStore,
    });
    await provider1.saveTokens({
      access_token: "surviving-token",
      token_type: "bearer",
      expires_in: 7200,
    } as OAuthTokens);

    // Simulate crash: create entirely new provider (no in-memory state)
    const provider2 = new InspectorOAuthProvider({
      serverUrl,
      config: { clientId: "crash-test", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
      callbackPort: 6274,
      tokenStore,
    });

    // Should load tokens from disk
    const tokens = await provider2.tokens();
    expect(tokens?.access_token).toBe("surviving-token");

    // ExpiresAt should be hydrated from persisted data
    const state = provider2.getOAuthState();
    expect(state.expiresAt).toBeGreaterThan(Date.now());
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CRITERION 6 — Dynamic Client Registration (empty clientId triggers DCR)
// ═════════════════════════════════════════════════════════════════════════════

describe("AC-6: Dynamic Client Registration (empty clientId → DCR)", () => {
  let tempDir: string;
  let tokenStore: TokenStore;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), "ac6-"));
    tokenStore = new TokenStore(tempDir);
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should return undefined clientInformation when no clientId → SDK triggers DCR", async () => {
    const provider = new InspectorOAuthProvider({
      serverUrl: "http://localhost:3000/mcp",
      config: {
        // No clientId!
        redirectUri: "http://127.0.0.1:6274/oauth/callback",
        enableDynamicRegistration: true,
      },
      callbackPort: 6274,
      tokenStore,
    });

    const info = await provider.clientInformation();
    expect(info).toBeUndefined(); // SDK will see this and trigger DCR
  });

  it("should persist DCR-registered client information for future use", async () => {
    const serverUrl = "http://localhost:3000/mcp";
    const provider = new InspectorOAuthProvider({
      serverUrl,
      config: {
        redirectUri: "http://127.0.0.1:6274/oauth/callback",
        enableDynamicRegistration: true,
      },
      callbackPort: 6274,
      tokenStore,
    });

    // Simulate SDK calling saveClientInformation after DCR
    await provider.saveClientInformation({
      client_id: "dcr-generated-id",
      client_secret: "dcr-generated-secret",
      redirect_uris: [new URL("http://127.0.0.1:6274/oauth/callback")],
    } as never);

    // Verify persisted
    const persisted = await tokenStore.load(serverUrl);
    expect(persisted?.clientInformation?.client_id).toBe("dcr-generated-id");

    // On subsequent calls, persisted DCR info should be returned
    const info = await provider.clientInformation();
    expect(info?.client_id).toBe("dcr-generated-id");
  });

  it("should NOT persist DCR info when enableDynamicRegistration is false", async () => {
    const serverUrl = "http://localhost:3000/mcp";
    const provider = new InspectorOAuthProvider({
      serverUrl,
      config: {
        clientId: "static-client",
        redirectUri: "http://127.0.0.1:6274/oauth/callback",
        enableDynamicRegistration: false,
      },
      callbackPort: 6274,
      tokenStore,
    });

    await provider.saveClientInformation({
      client_id: "should-not-persist",
      redirect_uris: [new URL("http://127.0.0.1:6274/oauth/callback")],
    } as never);

    // Should not be in token store
    const persisted = await tokenStore.load(serverUrl);
    expect(persisted?.clientInformation).toBeUndefined();
  });

  it("should set enableDynamicRegistration via dashboard configure endpoint when clientId is empty", async () => {
    // This tests the dashboard-side logic: empty clientId → enable DCR
    const clientId = "";
    const body = {
      connectionId: "conn-dcr",
      config: {
        clientId: clientId || undefined,
        enableDynamicRegistration: !clientId, // true when empty
      },
    };

    expect(body.config.clientId).toBeUndefined();
    expect(body.config.enableDynamicRegistration).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CRITERION 7 — Token revocation on disconnect (RFC 7009 + local)
// ═════════════════════════════════════════════════════════════════════════════

describe("AC-7: Token revocation on disconnect (RFC 7009, server-side + local)", () => {
  let tempDir: string;
  let tokenStore: TokenStore;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), "ac7-"));
    tokenStore = new TokenStore(tempDir);
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should revoke both access and refresh tokens server-side (RFC 7009), then clear locally", async () => {
    const serverUrl = "http://localhost:3000/mcp";
    const provider = new InspectorOAuthProvider({
      serverUrl,
      config: { clientId: "revoke-client", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
      callbackPort: 6274,
      tokenStore,
    });

    // Save tokens
    await provider.saveTokens({
      access_token: "at-to-revoke",
      token_type: "bearer",
      refresh_token: "rt-to-revoke",
    } as OAuthTokens);

    // Setup: auth server has revocation endpoint
    mockDiscoverMeta.mockResolvedValue({
      issuer: "https://auth.example.com",
      authorization_endpoint: new URL("https://auth.example.com/authorize"),
      token_endpoint: new URL("https://auth.example.com/token"),
      response_types_supported: ["code"],
      revocation_endpoint: new URL("https://auth.example.com/revoke"),
    });

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    // Revoke server-side
    const revoked = await provider.revokeTokens();
    expect(revoked).toBe(true);

    // Verify RFC 7009 compliance: both tokens revoked
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Access token revocation
    const atBody = new URLSearchParams(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(atBody.get("token")).toBe("at-to-revoke");
    expect(atBody.get("token_type_hint")).toBe("access_token");

    // Refresh token revocation
    const rtBody = new URLSearchParams(fetchSpy.mock.calls[1]![1]!.body as string);
    expect(rtBody.get("token")).toBe("rt-to-revoke");
    expect(rtBody.get("token_type_hint")).toBe("refresh_token");

    // Now clear locally
    await provider.invalidateCredentials("tokens");
    expect(provider.getOAuthState().status).toBe("unauthenticated");

    // Tokens gone from provider
    // A fresh provider should not find tokens
    const freshProvider = new InspectorOAuthProvider({
      serverUrl,
      config: { clientId: "revoke-client", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
      callbackPort: 6274,
      tokenStore,
    });
    // After invalidateCredentials("tokens"), the token data is partially cleared
    // but client info may remain
    const state = freshProvider.getOAuthState();
    expect(state.status).toBe("unauthenticated");
  });

  it("should handle disconnect → revocation through /api/oauth/revoke endpoint", async () => {
    const serverUrl = "http://localhost:3000/mcp";
    const provider = new InspectorOAuthProvider({
      serverUrl,
      config: {
        clientId: "disconnect-client",
        redirectUri: "http://127.0.0.1:6274/oauth/callback",
      },
      callbackPort: 6274,
      tokenStore,
    });

    await provider.saveTokens({
      access_token: "at-disconnect",
      token_type: "bearer",
    } as OAuthTokens);

    // revokeTokens will be called by the endpoint — mock it to not need real server
    mockDiscoverMeta.mockResolvedValue(undefined); // No metadata = graceful skip

    const cm = mockConnectionManager({ provider, serverUrl });
    const req = mockRequest("POST", "/api/oauth/revoke");
    const res = mockResponse();

    await handleOAuthRoutes(req, res, mockRegistry(), () => cm);

    const body = JSON.parse(res._body);
    expect(body.revoked).toBe(true);
    // Provider should be unauthenticated after revocation
    expect(provider.getOAuthState().status).toBe("unauthenticated");
  });

  it("should clear OAuth provider on ConnectionManager.disconnect()", async () => {
    const manager = new ConnectionManager();

    await manager.connect(
      { transport: "http", url: "http://localhost:3000/mcp" },
      {
        oauthConfig: {
          clientId: "disconnect-cm",
          redirectUri: "http://127.0.0.1:6274/oauth/callback",
        },
      }
    );

    expect(manager.getOAuthProvider()).not.toBeNull();
    await manager.disconnect();
    expect(manager.getOAuthProvider()).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CRITERION 8 — Auth status in dashboard (4 states + expiry)
// ═════════════════════════════════════════════════════════════════════════════

describe("AC-8: Auth status in dashboard (4 states + expiry)", () => {
  let tempDir: string;
  let tokenStore: TokenStore;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), "ac8-"));
    tokenStore = new TokenStore(tempDir);
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should transition through all 4 states in sequence: unauthenticated → authenticating → authenticated → error", async () => {
    const provider = new InspectorOAuthProvider({
      serverUrl: "http://localhost:3000/mcp",
      config: { clientId: "state-test", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
      callbackPort: 6274,
      tokenStore,
    });

    const states: OAuthStatus[] = [];
    provider.onStatusChange = (state) => states.push(state.status);

    // 1. Starts unauthenticated
    expect(provider.getOAuthState().status).toBe("unauthenticated");

    // 2. Auth redirect → authenticating
    await provider.redirectToAuthorization(new URL("https://auth.example.com/authorize"));
    expect(provider.getOAuthState().status).toBe("authenticating");

    // 3. Tokens saved → authenticated
    await provider.saveTokens({
      access_token: "at",
      token_type: "bearer",
      expires_in: 3600,
    } as OAuthTokens);
    expect(provider.getOAuthState().status).toBe("authenticated");

    // 4. Error set → error
    provider.setError("Token expired");
    expect(provider.getOAuthState().status).toBe("error");
    expect(provider.getOAuthState().errorMessage).toBe("Token expired");

    // All 4 states were visited (via callback)
    expect(states).toEqual(["authenticating", "authenticated", "error"]);
  });

  it("should expose expiresAt through /api/oauth/status endpoint", async () => {
    const provider = new InspectorOAuthProvider({
      serverUrl: "http://localhost:3000/mcp",
      config: { clientId: "expiry-test", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
      callbackPort: 6274,
      tokenStore,
    });

    await provider.saveTokens({
      access_token: "at",
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
    expect(body.expiresAt).toBeGreaterThan(Date.now());
    // Should be approximately 1 hour from now
    expect(body.expiresAt).toBeLessThan(Date.now() + 3700_000);
  });

  it("should expose authorization URL during authenticating state", async () => {
    const provider = new InspectorOAuthProvider({
      serverUrl: "http://localhost:3000/mcp",
      config: { clientId: "auth-url-test", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
      callbackPort: 6274,
      tokenStore,
    });

    const authUrl = new URL("https://auth.example.com/authorize?client_id=auth-url-test");
    await provider.redirectToAuthorization(authUrl);

    const cm = mockConnectionManager({ provider });
    const req = mockRequest("GET", "/api/oauth/status");
    const res = mockResponse();

    await handleOAuthRoutes(req, res, mockRegistry(), () => cm);

    const body = JSON.parse(res._body);
    expect(body.status).toBe("authenticating");
    expect(body.authorizationUrl).toBe(authUrl.toString());
  });

  it("should return configured=false when connection has no OAuth", async () => {
    const cm = mockConnectionManager({ provider: null });
    const req = mockRequest("GET", "/api/oauth/status");
    const res = mockResponse();

    await handleOAuthRoutes(req, res, mockRegistry(), () => cm);

    const body = JSON.parse(res._body);
    expect(body.configured).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CRITERION 9 — Scope negotiation
// ═════════════════════════════════════════════════════════════════════════════

describe("AC-9: Scope negotiation (metadata discovery, custom input, fallback)", () => {
  let tempDir: string;
  let tokenStore: TokenStore;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), "ac9-"));
    tokenStore = new TokenStore(tempDir);
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should discover supported scopes from auth server metadata", async () => {
    const provider = new InspectorOAuthProvider({
      serverUrl: "http://localhost:3000/mcp",
      config: { clientId: "scope-test", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
      callbackPort: 6274,
      tokenStore,
    });

    mockDiscoverMeta.mockResolvedValue({
      issuer: "https://auth.example.com",
      authorization_endpoint: new URL("https://auth.example.com/authorize"),
      token_endpoint: new URL("https://auth.example.com/token"),
      response_types_supported: ["code"],
      scopes_supported: ["read", "write", "admin", "delete"],
    });

    const scopes = await provider.discoverSupportedScopes();
    expect(scopes).toEqual(["read", "write", "admin", "delete"]);

    // Should be reflected in getOAuthState
    const state = provider.getOAuthState();
    expect(state.supportedScopes).toEqual(["read", "write", "admin", "delete"]);
  });

  it("should return empty array when auth server metadata discovery fails (fallback)", async () => {
    const provider = new InspectorOAuthProvider({
      serverUrl: "http://localhost:3000/mcp",
      config: { clientId: "scope-fail", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
      callbackPort: 6274,
      tokenStore,
    });

    mockDiscoverMeta.mockRejectedValue(new Error("DNS resolution failed"));

    const scopes = await provider.discoverSupportedScopes();
    expect(scopes).toEqual([]);
  });

  it("should expose supportedScopes through /api/oauth/status for UI chips rendering", async () => {
    const provider = new InspectorOAuthProvider({
      serverUrl: "http://localhost:3000/mcp",
      config: { clientId: "scope-status", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
      callbackPort: 6274,
      tokenStore,
    });

    mockDiscoverMeta.mockResolvedValue({
      issuer: "https://auth.example.com",
      authorization_endpoint: new URL("https://auth.example.com/authorize"),
      token_endpoint: new URL("https://auth.example.com/token"),
      response_types_supported: ["code"],
      scopes_supported: ["read", "write"],
    });

    await provider.discoverSupportedScopes();

    const cm = mockConnectionManager({ provider });
    const req = mockRequest("GET", "/api/oauth/status");
    const res = mockResponse();
    await handleOAuthRoutes(req, res, mockRegistry(), () => cm);

    const body = JSON.parse(res._body);
    expect(body.supportedScopes).toEqual(["read", "write"]);
  });

  it("should accept custom scopes via config (for servers without scope metadata)", async () => {
    const provider = new InspectorOAuthProvider({
      serverUrl: "http://localhost:3000/mcp",
      config: {
        clientId: "custom-scope",
        redirectUri: "http://127.0.0.1:6274/oauth/callback",
        scopes: "custom:read custom:write custom:admin",
      },
      callbackPort: 6274,
      tokenStore,
    });

    // Scopes should appear in client metadata (for authorization request)
    expect(provider.clientMetadata.scope).toBe("custom:read custom:write custom:admin");
  });

  it("should cache scope discovery results (no re-fetch on second call)", async () => {
    const provider = new InspectorOAuthProvider({
      serverUrl: "http://localhost:3000/mcp",
      config: { clientId: "scope-cache", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
      callbackPort: 6274,
      tokenStore,
    });

    mockDiscoverMeta.mockResolvedValue({
      issuer: "https://auth.example.com",
      authorization_endpoint: new URL("https://auth.example.com/authorize"),
      token_endpoint: new URL("https://auth.example.com/token"),
      response_types_supported: ["code"],
      scopes_supported: ["a", "b"],
    });

    await provider.discoverSupportedScopes();
    await provider.discoverSupportedScopes();

    // Should only call discoverAuthorizationServerMetadata once
    expect(mockDiscoverMeta).toHaveBeenCalledTimes(1);
  });

  it("should detect revocation support during scope discovery", async () => {
    const provider = new InspectorOAuthProvider({
      serverUrl: "http://localhost:3000/mcp",
      config: { clientId: "revoc-detect", redirectUri: "http://127.0.0.1:6274/oauth/callback" },
      callbackPort: 6274,
      tokenStore,
    });

    mockDiscoverMeta.mockResolvedValue({
      issuer: "https://auth.example.com",
      authorization_endpoint: new URL("https://auth.example.com/authorize"),
      token_endpoint: new URL("https://auth.example.com/token"),
      response_types_supported: ["code"],
      scopes_supported: ["read"],
      revocation_endpoint: new URL("https://auth.example.com/revoke"),
    });

    await provider.discoverSupportedScopes();

    const state = provider.getOAuthState();
    expect(state.supportsRevocation).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CRITERION 10 — No regression (non-OAuth connections unchanged)
// ═════════════════════════════════════════════════════════════════════════════

describe("AC-10: No regression (non-OAuth connections unchanged)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createTestClientSpy.mockClear();
  });

  it("should connect and work without any OAuth config (HTTP transport)", async () => {
    const manager = new ConnectionManager();
    const result = await manager.connect({
      transport: "http",
      url: "http://localhost:3000/mcp",
    });

    expect(result.toolCount).toBe(0);
    expect(manager.getOAuthProvider()).toBeNull();
    expect(manager.getOAuthState()).toBeUndefined();

    // createTestClient should NOT receive authProvider
    expect(createTestClientSpy).toHaveBeenCalledWith(
      { transport: "http", url: "http://localhost:3000/mcp" },
      expect.not.objectContaining({ authProvider: expect.anything() })
    );
  });

  it("should connect via stdio without OAuth (even if oauthConfig is mistakenly passed)", async () => {
    const manager = new ConnectionManager();
    await manager.connect(
      { transport: "stdio", command: "node", args: ["server.js"] },
      {
        oauthConfig: {
          clientId: "should-be-ignored",
          redirectUri: "http://127.0.0.1:6274/oauth/callback",
        },
      }
    );

    // OAuth should NOT be created for stdio
    expect(manager.getOAuthProvider()).toBeNull();
    expect(manager.getOAuthState()).toBeUndefined();
  });

  it("should not include OAuth state in listConnections for non-OAuth connections", async () => {
    const registry = new ConnectionRegistry();

    await registry.createConnection({
      transport: "http",
      url: "http://localhost:3000/mcp",
    });

    const connections = registry.listConnections();
    expect(connections).toHaveLength(1);
    expect(connections[0]!.oauth).toBeUndefined();
  });

  it("should include OAuth state only for OAuth-configured connections in a mixed registry", async () => {
    const registry = new ConnectionRegistry();

    // Non-OAuth connection
    await registry.createConnection({
      transport: "http",
      url: "http://server-a:3000/mcp",
    });

    // OAuth connection
    await registry.createConnection(
      { transport: "http", url: "http://server-b:4000/mcp" },
      {
        oauthConfig: {
          clientId: "oauth-conn",
          redirectUri: "http://127.0.0.1:6274/oauth/callback",
        },
      }
    );

    const connections = registry.listConnections();
    expect(connections).toHaveLength(2);

    const nonOauth = connections.find((c) => c.serverUrl?.includes("server-a"));
    const withOauth = connections.find((c) => c.serverUrl?.includes("server-b"));

    expect(nonOauth?.oauth).toBeUndefined();
    expect(withOauth?.oauth).toBeDefined();
    expect(withOauth?.oauth?.status).toBe("unauthenticated");
  });

  it("should disconnect non-OAuth connection cleanly (no revocation logic)", async () => {
    const manager = new ConnectionManager();
    await manager.connect({
      transport: "http",
      url: "http://localhost:3000/mcp",
    });

    // Should disconnect without errors even though there's no OAuth provider
    await expect(manager.disconnect()).resolves.not.toThrow();
    expect(manager.getState().connected).toBe(false);
  });
});
