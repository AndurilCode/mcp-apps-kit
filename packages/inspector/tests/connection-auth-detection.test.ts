/**
 * Connection Layer 401 Auto-Detection tests — TASK-006-08
 *
 * Tests that ConnectionManager.connect() catches auth-related errors
 * and auto-triggers OAuth discovery instead of surfacing raw errors.
 *
 * Covers:
 * - UnauthorizedError from SDK → emits authRequired
 * - Error messages with "401", "unauthorized", "invalid_token"
 * - Wrapped errors (cause chain)
 * - Discovery results stored and retrievable
 * - Reconnect with OAuth config clears discovery and connects
 * - Non-auth errors still throw (no false positives)
 * - stdio connections unaffected by auth detection
 * - ConnectionRegistry forwarding
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ConnectionManager, isAuthError } from "../src/connection";
import { ConnectionRegistry } from "../src/connection-registry";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import type { AuthRequiredEvent } from "../src/oauth/discovery";

// =============================================================================
// MOCK DATA
// =============================================================================

const MOCK_DISCOVERY_RESULT: AuthRequiredEvent = {
  serverUrl: "https://oauth-server.example.com/mcp",
  resourceMetadata: null,
  authServerUrl: "https://auth.example.com",
  authServerMetadata: null,
  supportsDCR: true,
  supportsCIMD: false,
  requiresPreRegistration: false,
  suggestedScopes: ["read", "write"],
};

// =============================================================================
// MOCKS
// =============================================================================

// Track createTestClient calls and behavior
const createTestClientMock = vi.fn();

// Mock @mcp-apps-kit/testing
vi.mock("@mcp-apps-kit/testing", () => {
  return {
    createTestClient: (...args: unknown[]) => createTestClientMock(...args),
  };
});

// Mock the discovery module
const discoverAuthRequirementsMock = vi.fn();
vi.mock("../src/oauth/discovery", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    discoverAuthRequirements: (...args: unknown[]) => discoverAuthRequirementsMock(...args),
  };
});

// =============================================================================
// HELPERS
// =============================================================================

/** Create a mock TestClient that resolves successfully */
function createSuccessfulMockClient() {
  return {
    listTools: vi.fn().mockResolvedValue([]),
    listResources: vi.fn().mockResolvedValue([]),
    listPrompts: vi.fn().mockResolvedValue([]),
    callTool: vi.fn().mockResolvedValue({ content: [], isError: false }),
    getCallHistory: vi.fn().mockReturnValue([]),
    clearHistory: vi.fn(),
    disconnect: vi.fn().mockResolvedValue(undefined),
    raw: {},
  };
}

/** Set up createTestClient to return a successful client */
function mockSuccessfulConnection() {
  const client = createSuccessfulMockClient();
  createTestClientMock.mockResolvedValue(client);
  return client;
}

/** Set up createTestClient to throw an error */
function mockConnectionError(error: Error) {
  createTestClientMock.mockRejectedValue(error);
}

/** Set up createTestClient to return a client whose listTools throws an auth error */
function mockClientWithAuthErrorOnListTools(error: Error) {
  const client = createSuccessfulMockClient();
  client.listTools.mockRejectedValue(error);
  createTestClientMock.mockResolvedValue(client);
  return client;
}

// =============================================================================
// TESTS
// =============================================================================

describe("Connection Layer 401 Auto-Detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    discoverAuthRequirementsMock.mockResolvedValue(MOCK_DISCOVERY_RESULT);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // isAuthError helper
  // ---------------------------------------------------------------------------

  describe("isAuthError", () => {
    it("should detect UnauthorizedError from SDK", () => {
      expect(isAuthError(new UnauthorizedError())).toBe(true);
      expect(isAuthError(new UnauthorizedError("No token"))).toBe(true);
    });

    it("should detect error messages containing '401'", () => {
      expect(isAuthError(new Error("HTTP 401 Unauthorized"))).toBe(true);
      expect(isAuthError(new Error("Server returned 401"))).toBe(true);
    });

    it("should detect error messages containing 'unauthorized'", () => {
      expect(isAuthError(new Error("Unauthorized access"))).toBe(true);
      expect(isAuthError(new Error("unauthorized request"))).toBe(true);
      expect(isAuthError(new Error("UNAUTHORIZED"))).toBe(true);
    });

    it("should detect error messages containing 'invalid_token'", () => {
      expect(isAuthError(new Error("invalid_token: expired"))).toBe(true);
      expect(isAuthError(new Error("Error: INVALID_TOKEN"))).toBe(true);
    });

    it("should detect wrapped auth errors via cause chain", () => {
      const innerError = new UnauthorizedError("inner");
      const outerError = new Error("Connection failed");
      (outerError as Error & { cause: unknown }).cause = innerError;

      expect(isAuthError(outerError)).toBe(true);
    });

    it("should detect nested message-based auth errors in cause chain", () => {
      const innerError = new Error("HTTP 401");
      const outerError = new Error("Transport error");
      (outerError as Error & { cause: unknown }).cause = innerError;

      expect(isAuthError(outerError)).toBe(true);
    });

    it("should NOT detect non-auth errors", () => {
      expect(isAuthError(new Error("Connection refused"))).toBe(false);
      expect(isAuthError(new Error("ECONNRESET"))).toBe(false);
      expect(isAuthError(new Error("Timeout"))).toBe(false);
      expect(isAuthError(new Error("404 Not Found"))).toBe(false);
      expect(isAuthError(new Error("500 Internal Server Error"))).toBe(false);
    });

    it("should handle non-Error values", () => {
      expect(isAuthError(null)).toBe(false);
      expect(isAuthError(undefined)).toBe(false);
      expect(isAuthError("unauthorized")).toBe(false);
      expect(isAuthError(401)).toBe(false);
      expect(isAuthError({})).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // ConnectionManager.connect() — auth error detection
  // ---------------------------------------------------------------------------

  describe("connect() auth error detection", () => {
    it("should emit authRequired when UnauthorizedError thrown during createTestClient", async () => {
      mockConnectionError(new UnauthorizedError());
      const manager = new ConnectionManager();

      const authRequiredEvents: AuthRequiredEvent[] = [];
      manager.on("authRequired", (event: AuthRequiredEvent) => authRequiredEvents.push(event));

      const result = await manager.connect({
        transport: "http",
        url: "https://oauth-server.example.com/mcp",
      });

      // Should NOT throw — returns zero counts
      expect(result.toolCount).toBe(0);
      expect(result.resourceCount).toBe(0);
      expect(result.promptCount).toBe(0);
      expect(result.serverInfo).toBeNull();

      // Should have emitted authRequired
      expect(authRequiredEvents).toHaveLength(1);
      expect(authRequiredEvents[0]).toEqual(MOCK_DISCOVERY_RESULT);

      // Should NOT be connected (pending auth)
      expect(manager.getState().connected).toBe(false);
      // But serverUrl should be set for display
      expect(manager.getState().serverUrl).toBe("https://oauth-server.example.com/mcp");

      // Discovery should have been called with the server URL
      expect(discoverAuthRequirementsMock).toHaveBeenCalledWith(
        "https://oauth-server.example.com/mcp"
      );
    });

    it("should emit authRequired when 401 message error thrown during createTestClient", async () => {
      mockConnectionError(new Error("HTTP 401 Unauthorized"));
      const manager = new ConnectionManager();

      const authRequiredEvents: AuthRequiredEvent[] = [];
      manager.on("authRequired", (event: AuthRequiredEvent) => authRequiredEvents.push(event));

      const result = await manager.connect({
        transport: "http",
        url: "https://oauth-server.example.com/mcp",
      });

      expect(result.toolCount).toBe(0);
      expect(authRequiredEvents).toHaveLength(1);
      expect(manager.getState().connected).toBe(false);
    });

    it("should emit authRequired when invalid_token error thrown", async () => {
      mockConnectionError(new Error("invalid_token: token expired"));
      const manager = new ConnectionManager();

      const authRequiredEvents: AuthRequiredEvent[] = [];
      manager.on("authRequired", (event: AuthRequiredEvent) => authRequiredEvents.push(event));

      await manager.connect({
        transport: "http",
        url: "https://oauth-server.example.com/mcp",
      });

      expect(authRequiredEvents).toHaveLength(1);
    });

    it("should emit authRequired when auth error occurs during listTools", async () => {
      mockClientWithAuthErrorOnListTools(new UnauthorizedError("No access token"));
      const manager = new ConnectionManager();

      const authRequiredEvents: AuthRequiredEvent[] = [];
      manager.on("authRequired", (event: AuthRequiredEvent) => authRequiredEvents.push(event));

      const result = await manager.connect({
        transport: "http",
        url: "https://oauth-server.example.com/mcp",
      });

      expect(result.toolCount).toBe(0);
      expect(authRequiredEvents).toHaveLength(1);
      expect(manager.getState().connected).toBe(false);
    });

    it("should still throw non-auth errors during createTestClient", async () => {
      mockConnectionError(new Error("ECONNREFUSED"));
      const manager = new ConnectionManager();

      await expect(
        manager.connect({ transport: "http", url: "https://oauth-server.example.com/mcp" })
      ).rejects.toThrow("ECONNREFUSED");

      expect(discoverAuthRequirementsMock).not.toHaveBeenCalled();
    });

    it("should still throw non-auth errors during listTools", async () => {
      const client = createSuccessfulMockClient();
      client.listTools.mockRejectedValue(new Error("Server crashed"));
      createTestClientMock.mockResolvedValue(client);

      const manager = new ConnectionManager();

      // Non-auth errors during listTools are silently caught (server doesn't support tools)
      // This is existing behavior — the method doesn't throw for capability listing failures
      const result = await manager.connect({
        transport: "http",
        url: "https://oauth-server.example.com/mcp",
      });

      expect(result.toolCount).toBe(0);
      expect(manager.getState().connected).toBe(true);
      expect(discoverAuthRequirementsMock).not.toHaveBeenCalled();
    });

    it("should rethrow auth errors when OAuth config is already provided", async () => {
      mockConnectionError(new UnauthorizedError("Token expired"));
      const manager = new ConnectionManager();

      await expect(
        manager.connect(
          { transport: "http", url: "https://oauth-server.example.com/mcp" },
          {
            oauthConfig: {
              clientId: "existing-client",
              redirectUri: "http://127.0.0.1:6274/oauth/callback",
            },
          }
        )
      ).rejects.toThrow("Token expired");

      // Should NOT have run discovery — OAuth was already configured
      expect(discoverAuthRequirementsMock).not.toHaveBeenCalled();
    });

    it("should NOT trigger auth detection for stdio connections", async () => {
      mockConnectionError(new UnauthorizedError("Not authorized"));
      const manager = new ConnectionManager();

      await expect(
        manager.connect({ transport: "stdio", command: "node", args: ["server.js"] })
      ).rejects.toThrow("Not authorized");

      expect(discoverAuthRequirementsMock).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Discovery results storage and retrieval
  // ---------------------------------------------------------------------------

  describe("discovery results", () => {
    it("should store discovery results after auth detection", async () => {
      mockConnectionError(new UnauthorizedError());
      const manager = new ConnectionManager();

      await manager.connect({
        transport: "http",
        url: "https://oauth-server.example.com/mcp",
      });

      const results = manager.getDiscoveryResults();
      expect(results).toEqual(MOCK_DISCOVERY_RESULT);
    });

    it("should return null discovery results initially", () => {
      const manager = new ConnectionManager();
      expect(manager.getDiscoveryResults()).toBeNull();
    });

    it("should clear discovery results on successful reconnect", async () => {
      // First connect: auth error → discovery stored
      mockConnectionError(new UnauthorizedError());
      const manager = new ConnectionManager();

      await manager.connect({
        transport: "http",
        url: "https://oauth-server.example.com/mcp",
      });

      expect(manager.getDiscoveryResults()).not.toBeNull();

      // Second connect: success with OAuth config → discovery cleared
      mockSuccessfulConnection();

      await manager.connect(
        { transport: "http", url: "https://oauth-server.example.com/mcp" },
        {
          oauthConfig: {
            clientId: "registered-client",
            redirectUri: "http://127.0.0.1:6274/oauth/callback",
          },
        }
      );

      expect(manager.getState().connected).toBe(true);
      expect(manager.getDiscoveryResults()).toBeNull();
    });

    it("should clear discovery results on successful connect without OAuth", async () => {
      // First connect: auth error
      mockConnectionError(new UnauthorizedError());
      const manager = new ConnectionManager();

      await manager.connect({
        transport: "http",
        url: "https://oauth-server.example.com/mcp",
      });

      expect(manager.getDiscoveryResults()).not.toBeNull();

      // Second connect: success (maybe server auth was removed)
      mockSuccessfulConnection();

      await manager.connect({
        transport: "http",
        url: "https://oauth-server.example.com/mcp",
      });

      expect(manager.getState().connected).toBe(true);
      expect(manager.getDiscoveryResults()).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // ConnectionRegistry forwarding
  // ---------------------------------------------------------------------------

  describe("ConnectionRegistry authRequired forwarding", () => {
    it("should forward authRequired event from managed connection", async () => {
      mockConnectionError(new UnauthorizedError());
      const registry = new ConnectionRegistry();

      const authEvents: Array<{ id: string; event: AuthRequiredEvent }> = [];
      registry.on("authRequired", (id: string, event: AuthRequiredEvent) => {
        authEvents.push({ id, event });
      });

      const { id } = await registry.createConnection({
        transport: "http",
        url: "https://oauth-server.example.com/mcp",
      });

      expect(authEvents).toHaveLength(1);
      expect(authEvents[0]!.id).toBe(id);
      expect(authEvents[0]!.event).toEqual(MOCK_DISCOVERY_RESULT);
    });

    it("should expose getDiscoveryResults convenience method", async () => {
      mockConnectionError(new UnauthorizedError());
      const registry = new ConnectionRegistry();

      const { id } = await registry.createConnection({
        transport: "http",
        url: "https://oauth-server.example.com/mcp",
      });

      const results = registry.getDiscoveryResults(id);
      expect(results).toEqual(MOCK_DISCOVERY_RESULT);
    });

    it("should throw for unknown connection id in getDiscoveryResults", () => {
      const registry = new ConnectionRegistry();

      expect(() => registry.getDiscoveryResults("nonexistent")).toThrow("Connection not found");
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe("edge cases", () => {
    it("should handle discovery failure gracefully (still emits event)", async () => {
      mockConnectionError(new UnauthorizedError());

      // Discovery returns minimal result even on failure
      const minimalDiscovery: AuthRequiredEvent = {
        serverUrl: "https://broken.example.com/mcp",
        resourceMetadata: null,
        authServerUrl: null,
        authServerMetadata: null,
        supportsDCR: false,
        supportsCIMD: false,
        requiresPreRegistration: true,
        suggestedScopes: [],
      };
      discoverAuthRequirementsMock.mockResolvedValue(minimalDiscovery);

      const manager = new ConnectionManager();
      const events: AuthRequiredEvent[] = [];
      manager.on("authRequired", (e: AuthRequiredEvent) => events.push(e));

      await manager.connect({
        transport: "http",
        url: "https://broken.example.com/mcp",
      });

      expect(events).toHaveLength(1);
      expect(events[0]!.requiresPreRegistration).toBe(true);
    });

    it("should handle wrapped ConnectionError with auth cause", async () => {
      const innerAuth = new UnauthorizedError("No bearer token");
      const wrapperError = new Error("Connection failed");
      (wrapperError as Error & { cause: unknown }).cause = innerAuth;

      mockConnectionError(wrapperError);
      const manager = new ConnectionManager();

      const events: AuthRequiredEvent[] = [];
      manager.on("authRequired", (e: AuthRequiredEvent) => events.push(e));

      await manager.connect({
        transport: "http",
        url: "https://oauth-server.example.com/mcp",
      });

      expect(events).toHaveLength(1);
      expect(manager.getState().connected).toBe(false);
    });

    it("should preserve connection params in pending-auth state", async () => {
      mockConnectionError(new UnauthorizedError());
      const manager = new ConnectionManager();

      await manager.connect({
        transport: "http",
        url: "https://oauth-server.example.com/mcp",
      });

      const state = manager.getState();
      expect(state.connected).toBe(false);
      expect(state.connectionParams).toEqual({
        transport: "http",
        url: "https://oauth-server.example.com/mcp",
      });
    });
  });
});
