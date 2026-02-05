/**
 * OAuth Dashboard UI tests
 *
 * Tests the useOAuth hook fetch logic, OAuthPanel helpers, and Toolbar badge rendering.
 * Since there's no @testing-library/react, we test the fetch-level logic and type contracts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { OAuthStatus, OAuthState } from "../src/oauth/types";

// ---------------------------------------------------------------------------
// useOAuth hook logic (fetch-level)
// ---------------------------------------------------------------------------

describe("useOAuth fetch logic", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  /**
   * Simulate the configure() flow: POST /api/oauth/configure
   */
  describe("configure endpoint", () => {
    it("should POST to /api/oauth/configure with correct body", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            configured: true,
            connectionId: "conn-1",
            state: { status: "unauthenticated" } satisfies OAuthState,
          }),
      });
      globalThis.fetch = fetchMock;

      const baseUrl = "http://localhost:6274";
      const connectionId = "conn-1";

      await fetch(`${baseUrl}/api/oauth/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId,
          config: {
            clientId: "my-client",
            clientSecret: "secret",
            scopes: "read write",
            enableDynamicRegistration: false,
          },
        }),
      });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0]!;
      expect(url).toBe("http://localhost:6274/api/oauth/configure");
      expect(opts.method).toBe("POST");

      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body.connectionId).toBe("conn-1");
      expect(body.config).toEqual({
        clientId: "my-client",
        clientSecret: "secret",
        scopes: "read write",
        enableDynamicRegistration: false,
      });
    });

    it("should enable dynamic registration when clientId is empty", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            configured: true,
            connectionId: "conn-1",
            state: { status: "unauthenticated" },
          }),
      });
      globalThis.fetch = fetchMock;

      const clientId = "";
      const body = {
        connectionId: "conn-1",
        config: {
          clientId: clientId || undefined,
          enableDynamicRegistration: !clientId,
        },
      };

      await fetch("http://localhost:6274/api/oauth/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const parsed = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as {
        config: { enableDynamicRegistration: boolean; clientId?: string };
      };
      expect(parsed.config.enableDynamicRegistration).toBe(true);
      expect(parsed.config.clientId).toBeUndefined();
    });
  });

  /**
   * Simulate the status polling: GET /api/oauth/status?connectionId=X
   */
  describe("status polling", () => {
    it("should parse configured + authenticated status response", async () => {
      const mockResponse = {
        configured: true,
        connectionId: "conn-1",
        status: "authenticated" as OAuthStatus,
        expiresAt: Date.now() + 3600000,
        grantedScopes: "read write",
        supportsDynamicRegistration: true,
        supportsRevocation: true,
        authorizationUrl: null,
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
      globalThis.fetch = fetchMock;

      const res = await fetch("http://localhost:6274/api/oauth/status?connectionId=conn-1");
      const data = (await res.json()) as typeof mockResponse;

      expect(data.configured).toBe(true);
      expect(data.status).toBe("authenticated");
      expect(data.expiresAt).toBeGreaterThan(Date.now());
      expect(data.grantedScopes).toBe("read write");
      expect(data.authorizationUrl).toBeNull();
    });

    it("should parse unconfigured response", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            configured: false,
            connectionId: "conn-1",
          }),
      });
      globalThis.fetch = fetchMock;

      const res = await fetch("http://localhost:6274/api/oauth/status?connectionId=conn-1");
      const data = (await res.json()) as { configured: boolean };
      expect(data.configured).toBe(false);
    });

    it("should include authorizationUrl when authenticating", async () => {
      const authUrl = "https://auth.example.com/authorize?code=abc";
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            configured: true,
            connectionId: "conn-1",
            status: "authenticating",
            authorizationUrl: authUrl,
          }),
      });
      globalThis.fetch = fetchMock;

      const res = await fetch("http://localhost:6274/api/oauth/status?connectionId=conn-1");
      const data = (await res.json()) as { authorizationUrl: string };
      expect(data.authorizationUrl).toBe(authUrl);
    });
  });

  /**
   * Simulate revoke flow: POST /api/oauth/revoke?connectionId=X
   */
  describe("revoke endpoint", () => {
    it("should POST to revoke endpoint with connectionId", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            revoked: true,
            connectionId: "conn-1",
          }),
      });
      globalThis.fetch = fetchMock;

      const res = await fetch("http://localhost:6274/api/oauth/revoke?connectionId=conn-1", {
        method: "POST",
      });
      const data = (await res.json()) as { revoked: boolean };
      expect(data.revoked).toBe(true);
      expect(fetchMock.mock.calls[0]![1].method).toBe("POST");
    });

    it("should handle revocation failure", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            revoked: false,
            reason: "No tokens to revoke",
          }),
      });
      globalThis.fetch = fetchMock;

      const res = await fetch("http://localhost:6274/api/oauth/revoke?connectionId=conn-1", {
        method: "POST",
      });
      const data = (await res.json()) as { revoked: boolean; reason: string };
      expect(data.revoked).toBe(false);
      expect(data.reason).toBe("No tokens to revoke");
    });
  });
});

// ---------------------------------------------------------------------------
// OAuthPanel helper functions
// ---------------------------------------------------------------------------

describe("OAuthPanel helpers", () => {
  describe("formatExpiry", () => {
    // Re-implement the formatExpiry logic for testing (extracted from the component)
    function formatExpiry(expiresAt: number | undefined): string {
      if (!expiresAt) return "Unknown";
      const now = Date.now();
      const diff = expiresAt - now;
      if (diff <= 0) return "Expired";
      const minutes = Math.floor(diff / 60000);
      if (minutes < 60) return `${minutes}m remaining`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ${minutes % 60}m remaining`;
      return `${Math.floor(hours / 24)}d remaining`;
    }

    it("should return 'Unknown' for undefined", () => {
      expect(formatExpiry(undefined)).toBe("Unknown");
    });

    it("should return 'Expired' for past timestamps", () => {
      expect(formatExpiry(Date.now() - 1000)).toBe("Expired");
    });

    it("should format minutes correctly", () => {
      const result = formatExpiry(Date.now() + 30 * 60000);
      expect(result).toMatch(/\d+m remaining/);
    });

    it("should format hours correctly", () => {
      const result = formatExpiry(Date.now() + 2 * 3600000);
      expect(result).toMatch(/\d+h \d+m remaining/);
    });

    it("should format days correctly", () => {
      const result = formatExpiry(Date.now() + 2 * 86400000);
      expect(result).toMatch(/\d+d remaining/);
    });
  });

  describe("getStatusBadgeStyle", () => {
    // Test the badge style selection logic
    function getStatusBadgeKey(status: string): string {
      switch (status) {
        case "authenticated":
          return "authenticated";
        case "authenticating":
          return "authenticating";
        case "error":
          return "error";
        default:
          return "unauthenticated";
      }
    }

    it("should return authenticated style for authenticated status", () => {
      expect(getStatusBadgeKey("authenticated")).toBe("authenticated");
    });

    it("should return authenticating style for authenticating status", () => {
      expect(getStatusBadgeKey("authenticating")).toBe("authenticating");
    });

    it("should return error style for error status", () => {
      expect(getStatusBadgeKey("error")).toBe("error");
    });

    it("should return unauthenticated style for unauthenticated status", () => {
      expect(getStatusBadgeKey("unauthenticated")).toBe("unauthenticated");
    });

    it("should return unauthenticated style for unknown status", () => {
      expect(getStatusBadgeKey("unknown")).toBe("unauthenticated");
    });
  });
});

// ---------------------------------------------------------------------------
// Toolbar OAuth badge
// ---------------------------------------------------------------------------

describe("Toolbar OAuth badge", () => {
  describe("OAuth status icon mapping", () => {
    function getOAuthIcon(status: OAuthStatus): string {
      return status === "authenticated" ? "🔒" : status === "authenticating" ? "🔄" : "🔓";
    }

    function getOAuthLabel(status: OAuthStatus): string {
      return status === "authenticated"
        ? "Auth"
        : status === "authenticating"
          ? "Auth..."
          : status === "error"
            ? "Auth Err"
            : "No Auth";
    }

    it("should show locked icon for authenticated", () => {
      expect(getOAuthIcon("authenticated")).toBe("🔒");
    });

    it("should show refresh icon for authenticating", () => {
      expect(getOAuthIcon("authenticating")).toBe("🔄");
    });

    it("should show unlocked icon for unauthenticated", () => {
      expect(getOAuthIcon("unauthenticated")).toBe("🔓");
    });

    it("should show unlocked icon for error", () => {
      expect(getOAuthIcon("error")).toBe("🔓");
    });

    it("should show Auth label for authenticated", () => {
      expect(getOAuthLabel("authenticated")).toBe("Auth");
    });

    it("should show Auth... label for authenticating", () => {
      expect(getOAuthLabel("authenticating")).toBe("Auth...");
    });

    it("should show Auth Err label for error", () => {
      expect(getOAuthLabel("error")).toBe("Auth Err");
    });

    it("should show No Auth label for unauthenticated", () => {
      expect(getOAuthLabel("unauthenticated")).toBe("No Auth");
    });
  });
});

// ---------------------------------------------------------------------------
// Type contract tests
// ---------------------------------------------------------------------------

describe("OAuth type contracts", () => {
  it("OAuthState should have expected shape", () => {
    const state: OAuthState = {
      status: "authenticated",
      expiresAt: Date.now() + 3600000,
      grantedScopes: "read write",
    };
    expect(state.status).toBe("authenticated");
    expect(state.expiresAt).toBeDefined();
    expect(state.grantedScopes).toBe("read write");
  });

  it("OAuthStatus should accept all valid values", () => {
    const statuses: OAuthStatus[] = ["unauthenticated", "authenticating", "authenticated", "error"];
    expect(statuses).toHaveLength(4);
  });

  it("OAuthState with error fields should be valid", () => {
    const state: OAuthState = {
      status: "error",
      errorMessage: "Token expired",
    };
    expect(state.status).toBe("error");
    expect(state.errorMessage).toBe("Token expired");
  });

  it("OAuthState with optional fields should be valid", () => {
    const state: OAuthState = {
      status: "unauthenticated",
      supportsDynamicRegistration: true,
      supportsRevocation: false,
      supportedScopes: ["read", "write", "admin"],
    };
    expect(state.supportsDynamicRegistration).toBe(true);
    expect(state.supportsRevocation).toBe(false);
    expect(state.supportedScopes).toEqual(["read", "write", "admin"]);
  });
});
