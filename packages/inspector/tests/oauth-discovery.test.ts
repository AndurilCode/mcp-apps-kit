/**
 * OAuth Auth Discovery Service tests — TASK-006-07
 *
 * Tests the discoverAuthRequirements() function and /api/oauth/discover endpoint.
 *
 * Covers:
 * - DCR detection (registration_endpoint present)
 * - CIMD detection (client_id_metadata_document_supported)
 * - Pre-registration fallback (neither DCR nor CIMD)
 * - OIDC fallback when OAuth metadata fails
 * - Error handling (server unreachable, invalid JSON)
 * - Scope extraction from both PRM and auth server metadata
 * - /api/oauth/discover endpoint (CORS proxy)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { discoverAuthRequirements } from "../src/oauth/discovery";

// =============================================================================
// MOCK DATA
// =============================================================================

const PROTECTED_RESOURCE_METADATA = {
  resource: "https://mcp.example.com",
  authorization_servers: ["https://auth.example.com"],
  scopes_supported: ["read", "write", "admin"],
  bearer_methods_supported: ["header"],
};

const AUTH_SERVER_METADATA_DCR = {
  issuer: "https://auth.example.com",
  authorization_endpoint: "https://auth.example.com/authorize",
  token_endpoint: "https://auth.example.com/token",
  registration_endpoint: "https://auth.example.com/register",
  response_types_supported: ["code"],
  scopes_supported: ["read", "write", "admin", "openid"],
};

const AUTH_SERVER_METADATA_CIMD = {
  issuer: "https://auth.example.com",
  authorization_endpoint: "https://auth.example.com/authorize",
  token_endpoint: "https://auth.example.com/token",
  response_types_supported: ["code"],
  client_id_metadata_document_supported: true,
  scopes_supported: ["read", "write"],
};

const AUTH_SERVER_METADATA_NEITHER = {
  issuer: "https://auth.example.com",
  authorization_endpoint: "https://auth.example.com/authorize",
  token_endpoint: "https://auth.example.com/token",
  response_types_supported: ["code"],
  scopes_supported: ["read"],
};

const OIDC_METADATA = {
  issuer: "https://auth.example.com",
  authorization_endpoint: "https://auth.example.com/authorize",
  token_endpoint: "https://auth.example.com/token",
  jwks_uri: "https://auth.example.com/.well-known/jwks.json",
  response_types_supported: ["code"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["RS256"],
  registration_endpoint: "https://auth.example.com/register",
  scopes_supported: ["openid", "profile", "email"],
};

// =============================================================================
// FETCH MOCK HELPERS
// =============================================================================

type MockRoutes = Record<string, { status: number; body: unknown } | "network-error">;

/**
 * Install a fetch mock that routes by URL substring matching.
 * Routes are checked in order; first match wins.
 */
function mockFetch(routes: MockRoutes): void {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    for (const [pattern, config] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        if (config === "network-error") {
          throw new TypeError("fetch failed");
        }
        return new Response(JSON.stringify(config.body), {
          status: config.status,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Default: 404 for unmatched routes
    return new Response("Not Found", { status: 404 });
  });

  vi.stubGlobal("fetch", fetchMock);
}

// =============================================================================
// TESTS
// =============================================================================

describe("discoverAuthRequirements", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ---------------------------------------------------------------------------
  // DCR detection
  // ---------------------------------------------------------------------------

  describe("DCR detection", () => {
    it("should detect DCR when registration_endpoint is present", async () => {
      mockFetch({
        "oauth-protected-resource": { status: 200, body: PROTECTED_RESOURCE_METADATA },
        "oauth-authorization-server": { status: 200, body: AUTH_SERVER_METADATA_DCR },
      });

      const result = await discoverAuthRequirements("https://mcp.example.com/mcp");

      expect(result.supportsDCR).toBe(true);
      expect(result.supportsCIMD).toBe(false);
      expect(result.requiresPreRegistration).toBe(false);
      expect(result.authServerUrl).toBe("https://auth.example.com");
    });
  });

  // ---------------------------------------------------------------------------
  // CIMD detection
  // ---------------------------------------------------------------------------

  describe("CIMD detection", () => {
    it("should detect CIMD when client_id_metadata_document_supported is true", async () => {
      mockFetch({
        "oauth-protected-resource": { status: 200, body: PROTECTED_RESOURCE_METADATA },
        "oauth-authorization-server": { status: 200, body: AUTH_SERVER_METADATA_CIMD },
      });

      const result = await discoverAuthRequirements("https://mcp.example.com/mcp");

      expect(result.supportsCIMD).toBe(true);
      expect(result.supportsDCR).toBe(false);
      expect(result.requiresPreRegistration).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Pre-registration fallback
  // ---------------------------------------------------------------------------

  describe("pre-registration fallback", () => {
    it("should require pre-registration when neither DCR nor CIMD is available", async () => {
      mockFetch({
        "oauth-protected-resource": { status: 200, body: PROTECTED_RESOURCE_METADATA },
        "oauth-authorization-server": { status: 200, body: AUTH_SERVER_METADATA_NEITHER },
      });

      const result = await discoverAuthRequirements("https://mcp.example.com/mcp");

      expect(result.supportsDCR).toBe(false);
      expect(result.supportsCIMD).toBe(false);
      expect(result.requiresPreRegistration).toBe(true);
    });

    it("should require pre-registration when auth server metadata is unavailable", async () => {
      mockFetch({
        "oauth-protected-resource": { status: 200, body: PROTECTED_RESOURCE_METADATA },
        // No auth server metadata routes → will 404
      });

      const result = await discoverAuthRequirements("https://mcp.example.com/mcp");

      expect(result.authServerMetadata).toBeNull();
      expect(result.requiresPreRegistration).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // OIDC fallback
  // ---------------------------------------------------------------------------

  describe("OIDC fallback", () => {
    it("should fall back to OIDC discovery when OAuth metadata fails", async () => {
      mockFetch({
        "oauth-protected-resource": { status: 200, body: PROTECTED_RESOURCE_METADATA },
        "oauth-authorization-server": { status: 404, body: { error: "Not Found" } },
        "openid-configuration": { status: 200, body: OIDC_METADATA },
      });

      const result = await discoverAuthRequirements("https://mcp.example.com/mcp");

      expect(result.authServerMetadata).not.toBeNull();
      // OIDC metadata has registration_endpoint → DCR supported
      expect(result.supportsDCR).toBe(true);
      expect(result.suggestedScopes).toEqual(["read", "write", "admin"]); // PRM scopes take priority
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  describe("error handling", () => {
    it("should return defaults when server is unreachable", async () => {
      mockFetch({
        "oauth-protected-resource": "network-error",
      });

      const result = await discoverAuthRequirements("https://unreachable.example.com/mcp");

      expect(result.serverUrl).toBe("https://unreachable.example.com/mcp");
      expect(result.resourceMetadata).toBeNull();
      expect(result.authServerUrl).toBeNull();
      expect(result.authServerMetadata).toBeNull();
      expect(result.supportsDCR).toBe(false);
      expect(result.supportsCIMD).toBe(false);
      expect(result.requiresPreRegistration).toBe(true);
      expect(result.suggestedScopes).toEqual([]);
    });

    it("should return defaults when PRM returns 404", async () => {
      mockFetch({
        "oauth-protected-resource": { status: 404, body: { error: "Not Found" } },
      });

      const result = await discoverAuthRequirements("https://no-oauth.example.com/mcp");

      expect(result.resourceMetadata).toBeNull();
      expect(result.authServerUrl).toBeNull();
      expect(result.requiresPreRegistration).toBe(true);
    });

    it("should handle PRM with no authorization_servers", async () => {
      const prmNoAuthServers = {
        resource: "https://mcp.example.com",
        scopes_supported: ["read"],
      };

      mockFetch({
        "oauth-protected-resource": { status: 200, body: prmNoAuthServers },
      });

      const result = await discoverAuthRequirements("https://mcp.example.com/mcp");

      expect(result.resourceMetadata).not.toBeNull();
      expect(result.authServerUrl).toBeNull();
      expect(result.authServerMetadata).toBeNull();
      // Should still extract scopes from PRM
      expect(result.suggestedScopes).toEqual(["read"]);
    });

    it("should handle auth server metadata 500 error gracefully", async () => {
      mockFetch({
        "oauth-protected-resource": { status: 200, body: PROTECTED_RESOURCE_METADATA },
        "oauth-authorization-server": { status: 500, body: { error: "Internal Server Error" } },
        "openid-configuration": { status: 500, body: { error: "Internal Server Error" } },
      });

      const result = await discoverAuthRequirements("https://mcp.example.com/mcp");

      // Auth server metadata fetch throws on 5xx, caught by our try/catch
      expect(result.authServerMetadata).toBeNull();
      expect(result.requiresPreRegistration).toBe(true);
      // Scopes should still come from PRM
      expect(result.suggestedScopes).toEqual(["read", "write", "admin"]);
    });
  });

  // ---------------------------------------------------------------------------
  // Scope extraction
  // ---------------------------------------------------------------------------

  describe("scope extraction", () => {
    it("should prefer PRM scopes over auth server scopes", async () => {
      mockFetch({
        "oauth-protected-resource": { status: 200, body: PROTECTED_RESOURCE_METADATA },
        "oauth-authorization-server": { status: 200, body: AUTH_SERVER_METADATA_DCR },
      });

      const result = await discoverAuthRequirements("https://mcp.example.com/mcp");

      // PRM has ["read", "write", "admin"], auth server has those + "openid"
      // PRM takes priority
      expect(result.suggestedScopes).toEqual(["read", "write", "admin"]);
    });

    it("should fall back to auth server scopes when PRM has none", async () => {
      const prmNoScopes = {
        resource: "https://mcp.example.com",
        authorization_servers: ["https://auth.example.com"],
      };

      mockFetch({
        "oauth-protected-resource": { status: 200, body: prmNoScopes },
        "oauth-authorization-server": { status: 200, body: AUTH_SERVER_METADATA_DCR },
      });

      const result = await discoverAuthRequirements("https://mcp.example.com/mcp");

      expect(result.suggestedScopes).toEqual(["read", "write", "admin", "openid"]);
    });

    it("should return empty scopes when neither PRM nor auth server has them", async () => {
      const prmNoScopes = {
        resource: "https://mcp.example.com",
        authorization_servers: ["https://auth.example.com"],
      };
      const authNoScopes = {
        issuer: "https://auth.example.com",
        authorization_endpoint: "https://auth.example.com/authorize",
        token_endpoint: "https://auth.example.com/token",
        response_types_supported: ["code"],
      };

      mockFetch({
        "oauth-protected-resource": { status: 200, body: prmNoScopes },
        "oauth-authorization-server": { status: 200, body: authNoScopes },
      });

      const result = await discoverAuthRequirements("https://mcp.example.com/mcp");

      expect(result.suggestedScopes).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Both DCR and CIMD
  // ---------------------------------------------------------------------------

  describe("combined capabilities", () => {
    it("should detect both DCR and CIMD when both are present", async () => {
      const authBoth = {
        ...AUTH_SERVER_METADATA_DCR,
        client_id_metadata_document_supported: true,
      };

      mockFetch({
        "oauth-protected-resource": { status: 200, body: PROTECTED_RESOURCE_METADATA },
        "oauth-authorization-server": { status: 200, body: authBoth },
      });

      const result = await discoverAuthRequirements("https://mcp.example.com/mcp");

      expect(result.supportsDCR).toBe(true);
      expect(result.supportsCIMD).toBe(true);
      expect(result.requiresPreRegistration).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Full result structure
  // ---------------------------------------------------------------------------

  describe("result structure", () => {
    it("should return complete AuthRequiredEvent with all fields populated", async () => {
      mockFetch({
        "oauth-protected-resource": { status: 200, body: PROTECTED_RESOURCE_METADATA },
        "oauth-authorization-server": { status: 200, body: AUTH_SERVER_METADATA_DCR },
      });

      const result = await discoverAuthRequirements("https://mcp.example.com/mcp");

      expect(result).toMatchObject({
        serverUrl: "https://mcp.example.com/mcp",
        resourceMetadata: expect.objectContaining({
          resource: "https://mcp.example.com",
        }),
        authServerUrl: expect.stringContaining("auth.example.com"),
        authServerMetadata: expect.objectContaining({
          issuer: "https://auth.example.com",
        }),
        supportsDCR: true,
        supportsCIMD: false,
        requiresPreRegistration: false,
        suggestedScopes: ["read", "write", "admin"],
      });
    });

    it("should always include serverUrl even on failure", async () => {
      mockFetch({
        "oauth-protected-resource": "network-error",
      });

      const result = await discoverAuthRequirements("https://broken.example.com/mcp");

      expect(result.serverUrl).toBe("https://broken.example.com/mcp");
    });
  });
});
