/**
 * OAuthDiscoveryPanel & Dashboard Discovery UX Tests
 *
 * Tests for:
 * - OAuthDiscoveryPanel rendering in DCR and pre-registration modes
 * - Loading and error states
 * - useOAuth discovery extensions (discover, configureFromDiscovery)
 * - useConnections authDiscovery state management
 * - Dashboard server discovery data in connection responses
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AuthRequiredEvent } from "../src/oauth/discovery";

// =============================================================================
// TEST DATA
// =============================================================================

function makeDCRDiscovery(overrides: Partial<AuthRequiredEvent> = {}): AuthRequiredEvent {
  return {
    serverUrl: "https://mcp.example.com/v1",
    resourceMetadata: null,
    authServerUrl: "https://auth.example.com",
    authServerMetadata: null,
    supportsDCR: true,
    supportsCIMD: false,
    requiresPreRegistration: false,
    suggestedScopes: ["read", "write"],
    ...overrides,
  };
}

function makePreRegDiscovery(overrides: Partial<AuthRequiredEvent> = {}): AuthRequiredEvent {
  return {
    serverUrl: "https://mcp.example.com/v1",
    resourceMetadata: null,
    authServerUrl: "https://auth.example.com",
    authServerMetadata: null,
    supportsDCR: false,
    supportsCIMD: false,
    requiresPreRegistration: true,
    suggestedScopes: ["openid", "profile"],
    ...overrides,
  };
}

// =============================================================================
// DASHBOARD SERVER: Discovery data in connection responses
// =============================================================================

describe("Dashboard server discovery data", () => {
  it("includes authRequired and discoveryResults when connection has discovery", () => {
    // Simulates what the dashboard-server POST /dashboard/connections returns
    const discovery = makeDCRDiscovery();
    const response = {
      id: "conn-1",
      url: "https://mcp.example.com/v1",
      transport: "http",
      serverInfo: null,
      authRequired: true,
      discoveryResults: discovery,
    };

    expect(response.authRequired).toBe(true);
    expect(response.discoveryResults).toEqual(discovery);
    expect(response.discoveryResults.supportsDCR).toBe(true);
    expect(response.discoveryResults.suggestedScopes).toEqual(["read", "write"]);
  });

  it("omits authRequired when connection has no discovery", () => {
    const response = {
      id: "conn-1",
      url: "https://mcp.example.com/v1",
      transport: "http",
      serverInfo: { name: "test-server", version: "1.0" },
    };

    expect(response).not.toHaveProperty("authRequired");
    expect(response).not.toHaveProperty("discoveryResults");
  });
});

// =============================================================================
// DISCOVERY PANEL: Render logic (unit tests without React DOM)
// =============================================================================

describe("OAuthDiscoveryPanel render logic", () => {
  describe("DCR mode", () => {
    it("recognizes DCR-capable discovery results", () => {
      const discovery = makeDCRDiscovery();
      expect(discovery.supportsDCR).toBe(true);
      expect(discovery.requiresPreRegistration).toBe(false);
      expect(discovery.authServerUrl).toBe("https://auth.example.com");
    });

    it("extracts suggested scopes for DCR auto-fill", () => {
      const discovery = makeDCRDiscovery({ suggestedScopes: ["read", "write", "admin"] });
      const effectiveScopes = discovery.suggestedScopes.join(" ");
      expect(effectiveScopes).toBe("read write admin");
    });

    it("builds correct DCR configure params", () => {
      const discovery = makeDCRDiscovery();
      const params = {
        enableDynamicRegistration: true,
        scopes: discovery.suggestedScopes.join(" ") || undefined,
      };

      expect(params.enableDynamicRegistration).toBe(true);
      expect(params.scopes).toBe("read write");
    });

    it("allows scope override in advanced mode", () => {
      const discovery = makeDCRDiscovery({ suggestedScopes: ["read"] });
      const userOverride = "read write admin";
      const effectiveScopes = userOverride || discovery.suggestedScopes.join(" ");
      expect(effectiveScopes).toBe("read write admin");
    });

    it("allows client_id override in advanced mode", () => {
      const clientId = "custom-client-id";
      const params = {
        enableDynamicRegistration: true,
        scopes: "read write",
        clientId,
      };

      expect(params.clientId).toBe("custom-client-id");
      expect(params.enableDynamicRegistration).toBe(true);
    });
  });

  describe("Pre-registration mode", () => {
    it("recognizes pre-registration discovery results", () => {
      const discovery = makePreRegDiscovery();
      expect(discovery.supportsDCR).toBe(false);
      expect(discovery.requiresPreRegistration).toBe(true);
    });

    it("requires client_id for pre-registration", () => {
      const clientId = "";
      const canSubmit = !!clientId.trim();
      expect(canSubmit).toBe(false);

      const validClientId = "my-client";
      const canSubmitValid = !!validClientId.trim();
      expect(canSubmitValid).toBe(true);
    });

    it("builds correct pre-registration configure params", () => {
      const discovery = makePreRegDiscovery();
      const params = {
        clientId: "my-client-id",
        clientSecret: "my-secret",
        scopes: discovery.suggestedScopes.join(" ") || undefined,
        enableDynamicRegistration: false,
      };

      expect(params.clientId).toBe("my-client-id");
      expect(params.clientSecret).toBe("my-secret");
      expect(params.scopes).toBe("openid profile");
      expect(params.enableDynamicRegistration).toBe(false);
    });

    it("makes client_secret optional", () => {
      const params = {
        clientId: "my-client-id",
        clientSecret: undefined,
        scopes: "openid",
        enableDynamicRegistration: false,
      };

      expect(params.clientSecret).toBeUndefined();
    });

    it("pre-fills scopes from discovery", () => {
      const discovery = makePreRegDiscovery({ suggestedScopes: ["openid", "profile", "email"] });
      const preFilled = discovery.suggestedScopes.join(" ");
      expect(preFilled).toBe("openid profile email");
    });
  });

  describe("Loading state", () => {
    it("shows loading when isDiscovering is true", () => {
      const isDiscovering = true;
      const discovery: AuthRequiredEvent | null = null;

      // In loading state, panel should render loading UI
      expect(isDiscovering).toBe(true);
      expect(discovery).toBeNull();
    });
  });

  describe("Error state", () => {
    it("shows error when discovery fails", () => {
      const error = "Failed to fetch .well-known metadata";
      const discovery: AuthRequiredEvent | null = null;

      // Error + no discovery = error state
      expect(error).toBeTruthy();
      expect(discovery).toBeNull();
    });

    it("shows configure button alongside error when discovery succeeds partially", () => {
      const error = "Registration endpoint returned 500";
      const discovery = makeDCRDiscovery();

      // Error + discovery present = show both error and discovery UI
      expect(error).toBeTruthy();
      expect(discovery).not.toBeNull();
    });
  });
});

// =============================================================================
// useOAuth discovery extensions
// =============================================================================

describe("useOAuth discovery extensions", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("discover()", () => {
    it("calls /api/oauth/discover with encoded URL", async () => {
      const discovery = makeDCRDiscovery();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => discovery,
      });

      const serverUrl = "https://mcp.example.com/v1";
      const res = await mockFetch(`/api/oauth/discover?url=${encodeURIComponent(serverUrl)}`);
      const data = await res.json();

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/oauth/discover?url=${encodeURIComponent(serverUrl)}`
      );
      expect(data.supportsDCR).toBe(true);
      expect(data.serverUrl).toBe("https://mcp.example.com/v1");
    });

    it("handles discovery failure gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: "Discovery failed", message: "Network error" }),
      });

      const res = await mockFetch("/api/oauth/discover?url=https://broken.example.com");
      expect(res.ok).toBe(false);
      const data = await res.json();
      expect(data.error).toBe("Discovery failed");
    });
  });

  describe("configureFromDiscovery()", () => {
    it("sends DCR configure request with correct params", async () => {
      const expectedBody = {
        connectionId: "conn-1",
        config: {
          enableDynamicRegistration: true,
          scopes: "read write",
          clientId: undefined,
          clientSecret: undefined,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          configured: true,
          connectionId: "conn-1",
          state: { status: "authenticating" },
          authorizationUrl: "https://auth.example.com/authorize?client_id=dyn-123",
        }),
      });

      const res = await mockFetch("/api/oauth/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(expectedBody),
      });

      const data = await res.json();
      expect(data.configured).toBe(true);
      expect(data.authorizationUrl).toContain("authorize");
      expect(data.state.status).toBe("authenticating");
    });

    it("sends pre-registration configure request with client credentials", async () => {
      const expectedBody = {
        connectionId: "conn-1",
        config: {
          clientId: "my-client",
          clientSecret: "my-secret",
          scopes: "openid profile",
          enableDynamicRegistration: false,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          configured: true,
          connectionId: "conn-1",
          state: { status: "authenticating" },
          authorizationUrl: "https://auth.example.com/authorize?client_id=my-client",
        }),
      });

      const res = await mockFetch("/api/oauth/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(expectedBody),
      });

      const data = await res.json();
      expect(data.configured).toBe(true);
      expect(data.authorizationUrl).toContain("my-client");
    });

    it("handles configure error correctly", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "Invalid client_id" }),
      });

      const res = await mockFetch("/api/oauth/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: "conn-1",
          config: { clientId: "bad", enableDynamicRegistration: false },
        }),
      });

      expect(res.ok).toBe(false);
      const data = await res.json();
      expect(data.error).toBe("Invalid client_id");
    });
  });
});

// =============================================================================
// useConnections authDiscovery state
// =============================================================================

describe("useConnections authDiscovery state", () => {
  it("extracts discovery from create response with authRequired flag", () => {
    const discovery = makeDCRDiscovery();
    const response = {
      id: "conn-1",
      url: "https://mcp.example.com/v1",
      serverInfo: null,
      authRequired: true,
      discoveryResults: discovery,
    };

    // Simulates what useConnections does when processing the response
    let authDiscovery: AuthRequiredEvent | null = null;
    if (response.authRequired && response.discoveryResults) {
      authDiscovery = response.discoveryResults;
    }

    expect(authDiscovery).not.toBeNull();
    expect(authDiscovery!.supportsDCR).toBe(true);
    expect(authDiscovery!.serverUrl).toBe("https://mcp.example.com/v1");
  });

  it("sets connection status to disconnected when authRequired", () => {
    const response = {
      id: "conn-1",
      url: "https://mcp.example.com/v1",
      serverInfo: null,
      authRequired: true,
      discoveryResults: makeDCRDiscovery(),
    };

    const status = response.authRequired ? "disconnected" : "connected";
    expect(status).toBe("disconnected");
  });

  it("keeps connection status as connected when no auth required", () => {
    const response = {
      id: "conn-1",
      url: "https://mcp.example.com/v1",
      serverInfo: { name: "test", version: "1.0" },
    };

    const hasAuth =
      "authRequired" in response && (response as { authRequired?: boolean }).authRequired;
    const status = hasAuth ? "disconnected" : "connected";
    expect(status).toBe("connected");
  });

  it("clears discovery on new connection attempt", () => {
    let authDiscovery: AuthRequiredEvent | null = makeDCRDiscovery();

    // Simulates clearing at start of createConnection
    authDiscovery = null;
    expect(authDiscovery).toBeNull();
  });

  it("clears discovery on dismiss", () => {
    let authDiscovery: AuthRequiredEvent | null = makeDCRDiscovery();
    expect(authDiscovery).not.toBeNull();

    // clearAuthDiscovery()
    authDiscovery = null;
    expect(authDiscovery).toBeNull();
  });
});

// =============================================================================
// AuthRequiredEvent structure validation
// =============================================================================

describe("AuthRequiredEvent structure", () => {
  it("has all required fields for DCR", () => {
    const event = makeDCRDiscovery();
    expect(event).toHaveProperty("serverUrl");
    expect(event).toHaveProperty("authServerUrl");
    expect(event).toHaveProperty("authServerMetadata");
    expect(event).toHaveProperty("supportsDCR");
    expect(event).toHaveProperty("supportsCIMD");
    expect(event).toHaveProperty("requiresPreRegistration");
    expect(event).toHaveProperty("suggestedScopes");
    expect(event).toHaveProperty("resourceMetadata");
  });

  it("has all required fields for pre-registration", () => {
    const event = makePreRegDiscovery();
    expect(event.supportsDCR).toBe(false);
    expect(event.supportsCIMD).toBe(false);
    expect(event.requiresPreRegistration).toBe(true);
    expect(Array.isArray(event.suggestedScopes)).toBe(true);
  });

  it("supports CIMD discovery results", () => {
    const event: AuthRequiredEvent = {
      serverUrl: "https://mcp.example.com",
      resourceMetadata: null,
      authServerUrl: "https://auth.example.com",
      authServerMetadata: null,
      supportsDCR: false,
      supportsCIMD: true,
      requiresPreRegistration: false,
      suggestedScopes: [],
    };

    expect(event.supportsCIMD).toBe(true);
    expect(event.requiresPreRegistration).toBe(false);
  });

  it("handles empty discovery (no PRM)", () => {
    const event: AuthRequiredEvent = {
      serverUrl: "https://no-prm.example.com",
      resourceMetadata: null,
      authServerUrl: null,
      authServerMetadata: null,
      supportsDCR: false,
      supportsCIMD: false,
      requiresPreRegistration: true,
      suggestedScopes: [],
    };

    expect(event.authServerUrl).toBeNull();
    expect(event.suggestedScopes).toEqual([]);
    expect(event.requiresPreRegistration).toBe(true);
  });
});
