/**
 * OAuth Token Revocation tests (RFC 7009)
 *
 * Tests server-side token revocation via revokeTokens(), expiresAt computation,
 * and integration with callback-handler and disconnect flows.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { InspectorOAuthProvider } from "../src/oauth/provider";
import { TokenStore } from "../src/oauth/token-store";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

// Mock the SDK's discoverAuthorizationServerMetadata
vi.mock("@modelcontextprotocol/sdk/client/auth.js", () => ({
  discoverAuthorizationServerMetadata: vi.fn(),
}));

import { discoverAuthorizationServerMetadata } from "@modelcontextprotocol/sdk/client/auth.js";

const mockDiscover = vi.mocked(discoverAuthorizationServerMetadata);

describe("Token Revocation (RFC 7009)", () => {
  let tempDir: string;
  let tokenStore: TokenStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "oauth-revoke-test-"));
    tokenStore = new TokenStore(tempDir);
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function createProvider(
    overrides: {
      clientId?: string;
      clientSecret?: string;
      serverUrl?: string;
    } = {}
  ): InspectorOAuthProvider {
    return new InspectorOAuthProvider({
      serverUrl: overrides.serverUrl ?? "http://localhost:3000/mcp",
      config: {
        clientId: overrides.clientId ?? "test-client-id",
        clientSecret: overrides.clientSecret,
        redirectUri: "http://127.0.0.1:6274/oauth/callback",
      },
      callbackPort: 6274,
      tokenStore,
    });
  }

  // ===========================================================================
  // revokeTokens()
  // ===========================================================================

  describe("revokeTokens()", () => {
    it("should return false when no tokens exist", async () => {
      const provider = createProvider();

      const result = await provider.revokeTokens();
      expect(result).toBe(false);
    });

    it("should return false when metadata discovery fails", async () => {
      const provider = createProvider();
      await provider.saveTokens({
        access_token: "at-123",
        token_type: "bearer",
      } as OAuthTokens);

      mockDiscover.mockResolvedValue(undefined);

      const result = await provider.revokeTokens();
      expect(result).toBe(false);
      expect(provider.getOAuthState().supportsRevocation).toBe(false);
    });

    it("should return false when no revocation endpoint exists", async () => {
      const provider = createProvider();
      await provider.saveTokens({
        access_token: "at-123",
        token_type: "bearer",
      } as OAuthTokens);

      mockDiscover.mockResolvedValue({
        issuer: "https://auth.example.com",
        authorization_endpoint: new URL("https://auth.example.com/authorize"),
        token_endpoint: new URL("https://auth.example.com/token"),
        response_types_supported: ["code"],
        // No revocation_endpoint
      });

      const result = await provider.revokeTokens();
      expect(result).toBe(false);
      expect(provider.getOAuthState().supportsRevocation).toBe(false);
    });

    it("should POST access token to revocation endpoint", async () => {
      const provider = createProvider();
      await provider.saveTokens({
        access_token: "at-secret-456",
        token_type: "bearer",
      } as OAuthTokens);

      mockDiscover.mockResolvedValue({
        issuer: "https://auth.example.com",
        authorization_endpoint: new URL("https://auth.example.com/authorize"),
        token_endpoint: new URL("https://auth.example.com/token"),
        response_types_supported: ["code"],
        revocation_endpoint: new URL("https://auth.example.com/revoke"),
      });

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 200 }));

      const result = await provider.revokeTokens();
      expect(result).toBe(true);
      expect(provider.getOAuthState().supportsRevocation).toBe(true);

      // Should have called fetch once (access token only, no refresh token)
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchSpy.mock.calls[0]!;
      expect(url).toBe("https://auth.example.com/revoke");
      expect(opts!.method).toBe("POST");

      const body = new URLSearchParams(opts!.body as string);
      expect(body.get("token")).toBe("at-secret-456");
      expect(body.get("token_type_hint")).toBe("access_token");
      expect(body.get("client_id")).toBe("test-client-id");
    });

    it("should also revoke refresh token when present", async () => {
      const provider = createProvider();
      await provider.saveTokens({
        access_token: "at-789",
        token_type: "bearer",
        refresh_token: "rt-789",
      } as OAuthTokens);

      mockDiscover.mockResolvedValue({
        issuer: "https://auth.example.com",
        authorization_endpoint: new URL("https://auth.example.com/authorize"),
        token_endpoint: new URL("https://auth.example.com/token"),
        response_types_supported: ["code"],
        revocation_endpoint: new URL("https://auth.example.com/revoke"),
      });

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 200 }));

      const result = await provider.revokeTokens();
      expect(result).toBe(true);

      // Two calls: one for access token, one for refresh token
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      const [, atOpts] = fetchSpy.mock.calls[0]!;
      const atBody = new URLSearchParams(atOpts!.body as string);
      expect(atBody.get("token")).toBe("at-789");
      expect(atBody.get("token_type_hint")).toBe("access_token");

      const [, rtOpts] = fetchSpy.mock.calls[1]!;
      const rtBody = new URLSearchParams(rtOpts!.body as string);
      expect(rtBody.get("token")).toBe("rt-789");
      expect(rtBody.get("token_type_hint")).toBe("refresh_token");
    });

    it("should use HTTP Basic auth for confidential clients", async () => {
      const provider = createProvider({
        clientId: "conf-client",
        clientSecret: "conf-secret",
      });
      await provider.saveTokens({
        access_token: "at-conf",
        token_type: "bearer",
      } as OAuthTokens);

      mockDiscover.mockResolvedValue({
        issuer: "https://auth.example.com",
        authorization_endpoint: new URL("https://auth.example.com/authorize"),
        token_endpoint: new URL("https://auth.example.com/token"),
        response_types_supported: ["code"],
        revocation_endpoint: new URL("https://auth.example.com/revoke"),
      });

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 200 }));

      await provider.revokeTokens();

      const [, opts] = fetchSpy.mock.calls[0]!;
      const headers = opts!.headers as Record<string, string>;
      const expected = Buffer.from("conf-client:conf-secret").toString("base64");
      expect(headers["Authorization"]).toBe(`Basic ${expected}`);

      // client_id should NOT be in body when using Basic auth
      const body = new URLSearchParams(opts!.body as string);
      expect(body.has("client_id")).toBe(false);
    });

    it("should gracefully handle revocation endpoint errors", async () => {
      const provider = createProvider();
      await provider.saveTokens({
        access_token: "at-fail",
        token_type: "bearer",
      } as OAuthTokens);

      mockDiscover.mockResolvedValue({
        issuer: "https://auth.example.com",
        authorization_endpoint: new URL("https://auth.example.com/authorize"),
        token_endpoint: new URL("https://auth.example.com/token"),
        response_types_supported: ["code"],
        revocation_endpoint: new URL("https://auth.example.com/revoke"),
      });

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Internal Server Error", { status: 500 })
      );

      // Should not throw, just return false
      const result = await provider.revokeTokens();
      expect(result).toBe(false);
    });

    it("should gracefully handle network failures", async () => {
      const provider = createProvider();
      await provider.saveTokens({
        access_token: "at-net",
        token_type: "bearer",
      } as OAuthTokens);

      mockDiscover.mockResolvedValue({
        issuer: "https://auth.example.com",
        authorization_endpoint: new URL("https://auth.example.com/authorize"),
        token_endpoint: new URL("https://auth.example.com/token"),
        response_types_supported: ["code"],
        revocation_endpoint: new URL("https://auth.example.com/revoke"),
      });

      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

      const result = await provider.revokeTokens();
      expect(result).toBe(false);
    });

    it("should gracefully handle metadata discovery throwing", async () => {
      const provider = createProvider();
      await provider.saveTokens({
        access_token: "at-throw",
        token_type: "bearer",
      } as OAuthTokens);

      mockDiscover.mockRejectedValue(new Error("DNS resolution failed"));

      const result = await provider.revokeTokens();
      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // expiresAt computation
  // ===========================================================================

  describe("expiresAt computation", () => {
    it("should compute expiresAt from expires_in", async () => {
      const provider = createProvider();
      const before = Date.now();

      await provider.saveTokens({
        access_token: "at-exp",
        token_type: "bearer",
        expires_in: 3600,
      } as OAuthTokens);

      const after = Date.now();
      const state = provider.getOAuthState();
      expect(state.expiresAt).toBeDefined();
      // Should be approximately 1 hour from now
      expect(state.expiresAt!).toBeGreaterThanOrEqual(before + 3600 * 1000);
      expect(state.expiresAt!).toBeLessThanOrEqual(after + 3600 * 1000);
    });

    it("should not set expiresAt when expires_in is absent", async () => {
      const provider = createProvider();

      await provider.saveTokens({
        access_token: "at-no-exp",
        token_type: "bearer",
      } as OAuthTokens);

      const state = provider.getOAuthState();
      expect(state.expiresAt).toBeUndefined();
    });

    it("should not set expiresAt when expires_in is 0", async () => {
      const provider = createProvider();

      await provider.saveTokens({
        access_token: "at-zero",
        token_type: "bearer",
        expires_in: 0,
      } as OAuthTokens);

      const state = provider.getOAuthState();
      expect(state.expiresAt).toBeUndefined();
    });

    it("should persist expiresAt to token store", async () => {
      const provider = createProvider();

      await provider.saveTokens({
        access_token: "at-persist",
        token_type: "bearer",
        expires_in: 7200,
      } as OAuthTokens);

      const persisted = await tokenStore.load("http://localhost:3000/mcp");
      expect(persisted?.expiresAt).toBeDefined();
      expect(persisted!.expiresAt!).toBeGreaterThan(Date.now());
    });

    it("should hydrate expiresAt from persisted data on tokens() call", async () => {
      const serverUrl = "http://localhost:3000/mcp";
      const expectedExpiry = Date.now() + 3600_000;

      // Manually persist tokens with expiresAt
      await tokenStore.save(serverUrl, {
        tokens: { access_token: "at-hydrate", token_type: "bearer" } as OAuthTokens,
        expiresAt: expectedExpiry,
      });

      // Create fresh provider (no in-memory state)
      const provider = createProvider({ serverUrl });
      // Trigger hydration
      await provider.tokens();

      const state = provider.getOAuthState();
      expect(state.expiresAt).toBe(expectedExpiry);
    });
  });

  // ===========================================================================
  // supportsRevocation in getOAuthState
  // ===========================================================================

  describe("supportsRevocation in getOAuthState()", () => {
    it("should be undefined before any revocation attempt", () => {
      const provider = createProvider();
      expect(provider.getOAuthState().supportsRevocation).toBeUndefined();
    });

    it("should be true after successful revocation discovery", async () => {
      const provider = createProvider();
      await provider.saveTokens({
        access_token: "at-flag",
        token_type: "bearer",
      } as OAuthTokens);

      mockDiscover.mockResolvedValue({
        issuer: "https://auth.example.com",
        authorization_endpoint: new URL("https://auth.example.com/authorize"),
        token_endpoint: new URL("https://auth.example.com/token"),
        response_types_supported: ["code"],
        revocation_endpoint: new URL("https://auth.example.com/revoke"),
      });

      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

      await provider.revokeTokens();
      expect(provider.getOAuthState().supportsRevocation).toBe(true);
    });

    it("should be false when server has no revocation endpoint", async () => {
      const provider = createProvider();
      await provider.saveTokens({
        access_token: "at-noflag",
        token_type: "bearer",
      } as OAuthTokens);

      mockDiscover.mockResolvedValue({
        issuer: "https://auth.example.com",
        authorization_endpoint: new URL("https://auth.example.com/authorize"),
        token_endpoint: new URL("https://auth.example.com/token"),
        response_types_supported: ["code"],
      });

      await provider.revokeTokens();
      expect(provider.getOAuthState().supportsRevocation).toBe(false);
    });
  });
});
