/**
 * OAuth + Connection integration tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConnectionManager } from "../src/connection";
import { ConnectionRegistry } from "../src/connection-registry";
import { TokenStore } from "../src/oauth/token-store";
import { InspectorOAuthProvider } from "../src/oauth/provider";

// Track createTestClient calls via a module-level spy
const createTestClientSpy = vi.fn();

// Mock the @mcp-apps-kit/testing module
vi.mock("@mcp-apps-kit/testing", () => {
  const mockClient = {
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
      return Promise.resolve(mockClient);
    },
  };
});

describe("OAuth + Connection integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    createTestClientSpy.mockClear();
    tempDir = await mkdtemp(join(tmpdir(), "oauth-conn-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("ConnectionManager with OAuth", () => {
    it("should create OAuth provider when oauthConfig is provided", async () => {
      const manager = new ConnectionManager({ debug: false });

      await manager.connect(
        { transport: "http", url: "http://localhost:3000/mcp" },
        {
          oauthConfig: {
            clientId: "test-client",
            redirectUri: "http://127.0.0.1:6274/oauth/callback",
          },
        }
      );

      const provider = manager.getOAuthProvider();
      expect(provider).toBeDefined();
      expect(provider).toBeInstanceOf(InspectorOAuthProvider);
    });

    it("should pass authProvider to createTestClient", async () => {
      const manager = new ConnectionManager();

      await manager.connect(
        { transport: "http", url: "http://localhost:3000/mcp" },
        {
          oauthConfig: {
            clientId: "test-client",
            redirectUri: "http://127.0.0.1:6274/oauth/callback",
          },
        }
      );

      // Verify createTestClient was called with authProvider
      expect(createTestClientSpy).toHaveBeenCalledWith(
        { transport: "http", url: "http://localhost:3000/mcp" },
        expect.objectContaining({
          authProvider: expect.any(Object),
        })
      );
    });

    it("should not create OAuth provider for stdio connections", async () => {
      const manager = new ConnectionManager();

      await manager.connect(
        { transport: "stdio", command: "node", args: ["server.js"] },
        {
          oauthConfig: {
            clientId: "test-client",
            redirectUri: "http://127.0.0.1:6274/oauth/callback",
          },
        }
      );

      // OAuth provider should NOT be set for stdio
      expect(manager.getOAuthProvider()).toBeNull();
    });

    it("should not create OAuth provider when no config provided", async () => {
      const manager = new ConnectionManager();
      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
      expect(manager.getOAuthProvider()).toBeNull();
    });

    it("should return OAuth state", async () => {
      const manager = new ConnectionManager();

      await manager.connect(
        { transport: "http", url: "http://localhost:3000/mcp" },
        {
          oauthConfig: {
            clientId: "test-client",
            redirectUri: "http://127.0.0.1:6274/oauth/callback",
          },
        }
      );

      const state = manager.getOAuthState();
      expect(state).toBeDefined();
      expect(state!.status).toBe("unauthenticated");
    });

    it("should return undefined OAuth state when no OAuth configured", async () => {
      const manager = new ConnectionManager();
      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
      expect(manager.getOAuthState()).toBeUndefined();
    });

    it("should clear OAuth provider on disconnect", async () => {
      const manager = new ConnectionManager();

      await manager.connect(
        { transport: "http", url: "http://localhost:3000/mcp" },
        {
          oauthConfig: {
            clientId: "test-client",
            redirectUri: "http://127.0.0.1:6274/oauth/callback",
          },
        }
      );

      expect(manager.getOAuthProvider()).not.toBeNull();
      await manager.disconnect();
      expect(manager.getOAuthProvider()).toBeNull();
    });

    it("should allow setting OAuth provider externally", async () => {
      const manager = new ConnectionManager();
      const tokenStore = new TokenStore(tempDir);

      const provider = new InspectorOAuthProvider({
        serverUrl: "http://localhost:3000/mcp",
        config: {
          clientId: "external-client",
          redirectUri: "http://127.0.0.1:6274/oauth/callback",
        },
        callbackPort: 6274,
        tokenStore,
      });

      manager.setOAuthProvider(provider);
      expect(manager.getOAuthProvider()).toBe(provider);
    });
  });

  describe("ConnectionRegistry with OAuth", () => {
    it("should include OAuth state in listConnections", async () => {
      const registry = new ConnectionRegistry();

      await registry.createConnection(
        { transport: "http", url: "http://localhost:3000/mcp" },
        {
          oauthConfig: {
            clientId: "test-client",
            redirectUri: "http://127.0.0.1:6274/oauth/callback",
          },
        }
      );

      const connections = registry.listConnections();
      expect(connections).toHaveLength(1);
      expect(connections[0]!.oauth).toBeDefined();
      expect(connections[0]!.oauth!.status).toBe("unauthenticated");
    });

    it("should not include OAuth state when not configured", async () => {
      const registry = new ConnectionRegistry();

      await registry.createConnection({
        transport: "http",
        url: "http://localhost:3000/mcp",
      });

      const connections = registry.listConnections();
      expect(connections).toHaveLength(1);
      expect(connections[0]!.oauth).toBeUndefined();
    });
  });
});
