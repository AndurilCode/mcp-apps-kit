/**
 * OAuth Client Provider tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { InspectorOAuthProvider } from "../src/oauth/provider";
import { TokenStore } from "../src/oauth/token-store";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthRequiredEvent } from "../src/oauth/discovery";

describe("InspectorOAuthProvider", () => {
  let tempDir: string;
  let tokenStore: TokenStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "oauth-provider-test-"));
    tokenStore = new TokenStore(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function createProvider(
    overrides: {
      clientId?: string | undefined;
      clientSecret?: string;
      enableDynamicRegistration?: boolean;
      serverUrl?: string;
      noClientId?: boolean;
      discoveryResults?: AuthRequiredEvent;
    } = {}
  ): InspectorOAuthProvider {
    return new InspectorOAuthProvider({
      serverUrl: overrides.serverUrl ?? "http://localhost:3000/mcp",
      config: {
        clientId: overrides.noClientId ? undefined : (overrides.clientId ?? "test-client-id"),
        clientSecret: overrides.clientSecret,
        redirectUri: "http://127.0.0.1:6274/oauth/callback",
        enableDynamicRegistration: overrides.enableDynamicRegistration ?? false,
      },
      callbackPort: 6274,
      tokenStore,
      discoveryResults: overrides.discoveryResults,
    });
  }

  /** Helper to build an AuthRequiredEvent with sensible defaults */
  function makeDiscoveryResults(overrides: Partial<AuthRequiredEvent> = {}): AuthRequiredEvent {
    return {
      serverUrl: "http://localhost:3000/mcp",
      resourceMetadata: null,
      authServerUrl: "https://auth.example.com",
      authServerMetadata: null,
      supportsDCR: false,
      supportsCIMD: false,
      requiresPreRegistration: true,
      suggestedScopes: [],
      ...overrides,
    };
  }

  describe("redirectUrl", () => {
    it("should return callback URL with the correct port", () => {
      const provider = createProvider();
      expect(provider.redirectUrl.toString()).toBe("http://127.0.0.1:6274/oauth/callback");
    });

    it("should use the configured callback port", () => {
      const provider = new InspectorOAuthProvider({
        serverUrl: "http://localhost:3000/mcp",
        config: {
          clientId: "test",
          redirectUri: "http://127.0.0.1:8080/oauth/callback",
        },
        callbackPort: 8080,
        tokenStore,
      });
      expect(provider.redirectUrl.toString()).toBe("http://127.0.0.1:8080/oauth/callback");
    });
  });

  describe("clientMetadata", () => {
    it("should include redirect URIs", () => {
      const provider = createProvider();
      const metadata = provider.clientMetadata;
      expect(metadata.redirect_uris).toHaveLength(1);
      expect(metadata.redirect_uris[0]!.toString()).toBe("http://127.0.0.1:6274/oauth/callback");
    });

    it("should set client name", () => {
      const provider = createProvider();
      expect(provider.clientMetadata.client_name).toBe("MCP Inspector");
    });

    it("should set auth method to none for public clients", () => {
      const provider = createProvider();
      expect(provider.clientMetadata.token_endpoint_auth_method).toBe("none");
    });

    it("should set auth method to client_secret_basic for confidential clients", () => {
      const provider = createProvider({ clientSecret: "secret" });
      expect(provider.clientMetadata.token_endpoint_auth_method).toBe("client_secret_basic");
    });

    it("should include grant types", () => {
      const provider = createProvider();
      expect(provider.clientMetadata.grant_types).toEqual(["authorization_code", "refresh_token"]);
    });
  });

  describe("clientInformation", () => {
    it("should return config-provided client ID", async () => {
      const provider = createProvider({ clientId: "my-client" });
      const info = await provider.clientInformation();
      expect(info).toBeDefined();
      expect(info!.client_id).toBe("my-client");
    });

    it("should include client secret when provided", async () => {
      const provider = createProvider({
        clientId: "my-client",
        clientSecret: "my-secret",
      });
      const info = await provider.clientInformation();
      expect(info!.client_secret).toBe("my-secret");
    });

    it("should return undefined when no client ID and no registration", async () => {
      const provider = createProvider({ noClientId: true });
      const info = await provider.clientInformation();
      expect(info).toBeUndefined();
    });

    it("should prefer persisted client info over config", async () => {
      const serverUrl = "http://localhost:3000/mcp";
      await tokenStore.saveClientInformation(serverUrl, {
        client_id: "registered-client",
        client_secret: "registered-secret",
        redirect_uris: [new URL("http://127.0.0.1:6274/oauth/callback")],
      } as never);

      const provider = createProvider({ clientId: "config-client", serverUrl });
      const info = await provider.clientInformation();
      expect(info!.client_id).toBe("registered-client");
    });
  });

  describe("saveClientInformation", () => {
    it("should persist when dynamic registration is enabled", async () => {
      const provider = createProvider({ enableDynamicRegistration: true });
      await provider.saveClientInformation({
        client_id: "dyn-client",
        redirect_uris: [new URL("http://127.0.0.1:6274/oauth/callback")],
      } as never);

      const loaded = await tokenStore.load("http://localhost:3000/mcp");
      expect(loaded?.clientInformation?.client_id).toBe("dyn-client");
    });

    it("should not persist when dynamic registration is disabled", async () => {
      const provider = createProvider({ enableDynamicRegistration: false });
      await provider.saveClientInformation({
        client_id: "dyn-client",
        redirect_uris: [new URL("http://127.0.0.1:6274/oauth/callback")],
      } as never);

      const loaded = await tokenStore.load("http://localhost:3000/mcp");
      expect(loaded?.clientInformation).toBeUndefined();
    });
  });

  describe("tokens", () => {
    it("should return undefined when no tokens are persisted", async () => {
      const provider = createProvider();
      const tokens = await provider.tokens();
      expect(tokens).toBeUndefined();
    });

    it("should return persisted tokens", async () => {
      const serverUrl = "http://localhost:3000/mcp";
      await tokenStore.saveTokens(serverUrl, {
        access_token: "saved-token",
        token_type: "bearer",
        refresh_token: "saved-refresh",
      } as OAuthTokens);

      const provider = createProvider({ serverUrl });
      const tokens = await provider.tokens();
      expect(tokens).toBeDefined();
      expect(tokens!.access_token).toBe("saved-token");
      expect(tokens!.refresh_token).toBe("saved-refresh");
    });
  });

  describe("saveTokens", () => {
    it("should persist tokens and update status to authenticated", async () => {
      const provider = createProvider();

      let reportedState: unknown;
      provider.onStatusChange = (state) => {
        reportedState = state;
      };

      await provider.saveTokens({
        access_token: "new-token",
        token_type: "bearer",
        expires_in: 3600,
      } as OAuthTokens);

      // Verify persisted
      const loaded = await tokenStore.load("http://localhost:3000/mcp");
      expect(loaded!.tokens.access_token).toBe("new-token");

      // Verify status change
      expect(reportedState).toBeDefined();
      expect((reportedState as { status: string }).status).toBe("authenticated");
    });
  });

  describe("codeVerifier", () => {
    it("should save and load code verifier in memory", async () => {
      const provider = createProvider();
      await provider.saveCodeVerifier("verifier-abc-123");
      const loaded = await provider.codeVerifier();
      expect(loaded).toBe("verifier-abc-123");
    });

    it("should persist code verifier to disk", async () => {
      const provider = createProvider();
      await provider.saveCodeVerifier("verifier-disk");

      const loaded = await tokenStore.load("http://localhost:3000/mcp");
      expect(loaded!.codeVerifier).toBe("verifier-disk");
    });

    it("should fall back to persisted verifier", async () => {
      await tokenStore.saveCodeVerifier("http://localhost:3000/mcp", "persisted-verifier");

      // Create a fresh provider (no in-memory state)
      const provider = createProvider();
      const loaded = await provider.codeVerifier();
      expect(loaded).toBe("persisted-verifier");
    });

    it("should throw when no verifier is available", async () => {
      const provider = createProvider();
      await expect(provider.codeVerifier()).rejects.toThrow("No PKCE code verifier");
    });
  });

  describe("redirectToAuthorization", () => {
    it("should store the pending auth URL", async () => {
      const provider = createProvider();
      const authUrl = new URL("https://auth.example.com/authorize?client_id=test");

      await provider.redirectToAuthorization(authUrl);

      expect(provider.getPendingAuthUrl()).toEqual(authUrl);
    });

    it("should update status to authenticating", async () => {
      const provider = createProvider();
      let status: string | undefined;
      provider.onStatusChange = (state) => {
        status = state.status;
      };

      await provider.redirectToAuthorization(new URL("https://auth.example.com/authorize"));
      expect(status).toBe("authenticating");
    });
  });

  describe("onAuthorizationComplete", () => {
    it("should clear pending auth URL", async () => {
      const provider = createProvider();
      await provider.redirectToAuthorization(new URL("https://auth.example.com/authorize"));
      expect(provider.getPendingAuthUrl()).not.toBeNull();

      provider.onAuthorizationComplete();
      expect(provider.getPendingAuthUrl()).toBeNull();
    });

    it("should resolve waitForAuthorization promise", async () => {
      const provider = createProvider();
      await provider.redirectToAuthorization(new URL("https://auth.example.com/authorize"));

      let resolved = false;
      const promise = provider.waitForAuthorization().then(() => {
        resolved = true;
      });

      // Not resolved yet
      expect(resolved).toBe(false);

      provider.onAuthorizationComplete();
      await promise;
      expect(resolved).toBe(true);
    });
  });

  describe("invalidateCredentials", () => {
    it("should clear all credentials on scope=all", async () => {
      const provider = createProvider();
      await provider.saveTokens({
        access_token: "token",
        token_type: "bearer",
      } as OAuthTokens);
      await provider.saveCodeVerifier("verifier");

      await provider.invalidateCredentials("all");

      const loaded = await tokenStore.load("http://localhost:3000/mcp");
      expect(loaded).toBeUndefined();
      expect(provider.getOAuthState().status).toBe("unauthenticated");
    });

    it("should clear only tokens on scope=tokens", async () => {
      const serverUrl = "http://localhost:3000/mcp";
      await tokenStore.save(serverUrl, {
        tokens: { access_token: "token", token_type: "bearer" } as OAuthTokens,
        clientInformation: { client_id: "keep-this", redirect_uris: [] } as never,
      });

      const provider = createProvider({ serverUrl });
      await provider.invalidateCredentials("tokens");

      const loaded = await tokenStore.load(serverUrl);
      expect(loaded?.clientInformation?.client_id).toBe("keep-this");
      expect(provider.getOAuthState().status).toBe("unauthenticated");
    });
  });

  describe("getOAuthState", () => {
    it("should start as unauthenticated", () => {
      const provider = createProvider();
      expect(provider.getOAuthState().status).toBe("unauthenticated");
    });

    it("should reflect error state", () => {
      const provider = createProvider();
      provider.setError("Auth server unreachable");
      const state = provider.getOAuthState();
      expect(state.status).toBe("error");
      expect(state.errorMessage).toBe("Auth server unreachable");
    });
  });

  describe("getServerUrl", () => {
    it("should return the configured server URL", () => {
      const provider = createProvider({ serverUrl: "http://special:9000/mcp" });
      expect(provider.getServerUrl()).toBe("http://special:9000/mcp");
    });
  });

  // ===========================================================================
  // DCR Auto-Registration & Registration Method
  // ===========================================================================

  describe("getRegistrationMethod", () => {
    it("should return 'dcr' when discovery indicates DCR support", () => {
      const provider = createProvider({
        noClientId: true,
        discoveryResults: makeDiscoveryResults({ supportsDCR: true }),
      });
      expect(provider.getRegistrationMethod()).toBe("dcr");
    });

    it("should return 'cimd' when discovery indicates CIMD support (no DCR)", () => {
      const provider = createProvider({
        noClientId: true,
        discoveryResults: makeDiscoveryResults({ supportsCIMD: true }),
      });
      expect(provider.getRegistrationMethod()).toBe("cimd");
    });

    it("should prefer 'dcr' over 'cimd' when both are supported", () => {
      const provider = createProvider({
        noClientId: true,
        discoveryResults: makeDiscoveryResults({
          supportsDCR: true,
          supportsCIMD: true,
        }),
      });
      expect(provider.getRegistrationMethod()).toBe("dcr");
    });

    it("should return 'pre_registered' when neither DCR nor CIMD is available", () => {
      const provider = createProvider({
        noClientId: true,
        discoveryResults: makeDiscoveryResults(),
      });
      expect(provider.getRegistrationMethod()).toBe("pre_registered");
    });

    it("should return 'pre_registered' when no discovery results provided", () => {
      const provider = createProvider({ noClientId: true });
      expect(provider.getRegistrationMethod()).toBe("pre_registered");
    });
  });

  describe("needsManualRegistration", () => {
    it("should return true when no stored client and no DCR/CIMD", async () => {
      const provider = createProvider({
        noClientId: true,
        discoveryResults: makeDiscoveryResults(),
      });
      expect(await provider.needsManualRegistration()).toBe(true);
    });

    it("should return false when config has a clientId", async () => {
      const provider = createProvider({
        clientId: "my-client",
        discoveryResults: makeDiscoveryResults(),
      });
      expect(await provider.needsManualRegistration()).toBe(false);
    });

    it("should return false when persisted client info exists", async () => {
      const serverUrl = "http://localhost:3000/mcp";
      await tokenStore.saveClientInformation(serverUrl, {
        client_id: "persisted-client",
        redirect_uris: [new URL("http://127.0.0.1:6274/oauth/callback")],
      } as never);

      const provider = createProvider({
        noClientId: true,
        serverUrl,
        discoveryResults: makeDiscoveryResults(),
      });
      expect(await provider.needsManualRegistration()).toBe(false);
    });

    it("should return false when DCR is available", async () => {
      const provider = createProvider({
        noClientId: true,
        discoveryResults: makeDiscoveryResults({ supportsDCR: true }),
      });
      expect(await provider.needsManualRegistration()).toBe(false);
    });

    it("should return false when CIMD is available", async () => {
      const provider = createProvider({
        noClientId: true,
        discoveryResults: makeDiscoveryResults({ supportsCIMD: true }),
      });
      expect(await provider.needsManualRegistration()).toBe(false);
    });

    it("should return true when no discovery results and no client info", async () => {
      const provider = createProvider({ noClientId: true });
      expect(await provider.needsManualRegistration()).toBe(true);
    });
  });

  describe("clientInformation with DCR auto-registration", () => {
    it("should return stored client info when available (existing behavior)", async () => {
      const provider = createProvider({
        clientId: "existing-client",
        discoveryResults: makeDiscoveryResults({ supportsDCR: true }),
      });
      const info = await provider.clientInformation();
      expect(info).toBeDefined();
      expect(info!.client_id).toBe("existing-client");
    });

    it("should prefer persisted client info over DCR", async () => {
      const serverUrl = "http://localhost:3000/mcp";
      await tokenStore.saveClientInformation(serverUrl, {
        client_id: "persisted-client",
        redirect_uris: [new URL("http://127.0.0.1:6274/oauth/callback")],
      } as never);

      const provider = createProvider({
        noClientId: true,
        serverUrl,
        discoveryResults: makeDiscoveryResults({
          supportsDCR: true,
          authServerMetadata: {
            issuer: "https://auth.example.com",
            authorization_endpoint: "https://auth.example.com/authorize",
            token_endpoint: "https://auth.example.com/token",
            registration_endpoint: "https://auth.example.com/register",
            response_types_supported: ["code"],
          },
        }),
      });

      const info = await provider.clientInformation();
      expect(info!.client_id).toBe("persisted-client");
    });

    it("should auto-register via DCR when no stored client", async () => {
      // Mock fetch to intercept the DCR registration POST
      const originalFetch = globalThis.fetch;
      const fetchSpy = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes("/register")) {
          return new Response(
            JSON.stringify({
              client_id: "dcr-auto-client",
              client_secret: "dcr-secret",
              redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
            }),
            { status: 201, headers: { "Content-Type": "application/json" } }
          );
        }
        return originalFetch(input);
      });
      globalThis.fetch = fetchSpy;

      try {
        const provider = createProvider({
          noClientId: true,
          discoveryResults: makeDiscoveryResults({
            supportsDCR: true,
            authServerUrl: "https://auth.example.com",
            authServerMetadata: {
              issuer: "https://auth.example.com",
              authorization_endpoint: "https://auth.example.com/authorize",
              token_endpoint: "https://auth.example.com/token",
              registration_endpoint: "https://auth.example.com/register",
              response_types_supported: ["code"],
            },
          }),
        });

        const info = await provider.clientInformation();
        expect(info).toBeDefined();
        expect(info!.client_id).toBe("dcr-auto-client");

        // Verify fetch was called with the registration endpoint
        const calls = fetchSpy.mock.calls;
        const registrationCall = calls.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (c: any[]) => c[0]?.toString().includes("/register")
        );
        expect(registrationCall).toBeDefined();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((registrationCall as any[])[1]).toMatchObject({ method: "POST" });

        // Verify it was persisted
        const persisted = await tokenStore.load("http://localhost:3000/mcp");
        expect(persisted?.clientInformation?.client_id).toBe("dcr-auto-client");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should return undefined when DCR registration fails", async () => {
      // Mock fetch to return an error for the registration endpoint
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes("/register")) {
          return new Response("Forbidden", { status: 403 });
        }
        return originalFetch(input);
      });

      try {
        const provider = createProvider({
          noClientId: true,
          discoveryResults: makeDiscoveryResults({
            supportsDCR: true,
            authServerUrl: "https://auth.example.com",
            authServerMetadata: {
              issuer: "https://auth.example.com",
              authorization_endpoint: "https://auth.example.com/authorize",
              token_endpoint: "https://auth.example.com/token",
              registration_endpoint: "https://auth.example.com/register",
              response_types_supported: ["code"],
            },
          }),
        });

        const info = await provider.clientInformation();
        expect(info).toBeUndefined();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should return undefined when no discovery results and no client config", async () => {
      const provider = createProvider({ noClientId: true });
      const info = await provider.clientInformation();
      expect(info).toBeUndefined();
    });

    it("should not attempt DCR when authServerMetadata is missing", async () => {
      const provider = createProvider({
        noClientId: true,
        discoveryResults: makeDiscoveryResults({
          supportsDCR: true,
          authServerMetadata: null,
        }),
      });
      const info = await provider.clientInformation();
      expect(info).toBeUndefined();
    });

    it("should not attempt DCR when registration_endpoint is missing from metadata", async () => {
      const provider = createProvider({
        noClientId: true,
        discoveryResults: makeDiscoveryResults({
          supportsDCR: true,
          authServerMetadata: {
            issuer: "https://auth.example.com",
            authorization_endpoint: "https://auth.example.com/authorize",
            token_endpoint: "https://auth.example.com/token",
            // no registration_endpoint
            response_types_supported: ["code"],
          },
        }),
      });
      const info = await provider.clientInformation();
      expect(info).toBeUndefined();
    });
  });
});
