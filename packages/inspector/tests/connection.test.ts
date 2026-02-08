/**
 * Connection management tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConnectionManager } from "../src/connection";

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
    createTestClient: vi.fn().mockResolvedValue(mockClient),
  };
});

describe("ConnectionManager", () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ConnectionManager();
  });

  describe("initial state", () => {
    it("should start disconnected", () => {
      const state = manager.getState();
      expect(state.connected).toBe(false);
      expect(state.serverUrl).toBe(null);
      expect(state.serverInfo).toBe(null);
      expect(state.historyEnabled).toBe(true);
      expect(state.callCount).toBe(0);
    });
  });

  describe("connect", () => {
    it("should connect to a valid server", async () => {
      const result = await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });

      expect(result.toolCount).toBe(0);
      expect(result.resourceCount).toBe(0);
      expect(result.promptCount).toBe(0);

      const state = manager.getState();
      expect(state.connected).toBe(true);
      expect(state.serverUrl).toBe("http://localhost:3000/mcp");
    });

    it("should reject invalid URLs", async () => {
      await expect(manager.connect({ transport: "http", url: "not-a-url" })).rejects.toThrow(
        "Invalid URL format"
      );
    });

    it("should disconnect existing connection before reconnecting", async () => {
      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
      expect(manager.getState().connected).toBe(true);

      await manager.connect({ transport: "http", url: "http://localhost:3001/mcp" });
      expect(manager.getState().connected).toBe(true);
      expect(manager.getState().serverUrl).toBe("http://localhost:3001/mcp");
    });

    it("should respect trackHistory option", async () => {
      await manager.connect(
        { transport: "http", url: "http://localhost:3000/mcp" },
        { trackHistory: false }
      );
      expect(manager.isHistoryEnabled()).toBe(false);
    });
  });

  describe("disconnect", () => {
    it("should disconnect from server", async () => {
      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
      const previousUrl = await manager.disconnect();

      expect(previousUrl).toBe("http://localhost:3000/mcp");
      expect(manager.getState().connected).toBe(false);
      expect(manager.getState().serverUrl).toBe(null);
    });

    it("should return null if not connected", async () => {
      const previousUrl = await manager.disconnect();
      expect(previousUrl).toBe(null);
    });
  });

  describe("getClient", () => {
    it("should throw if not connected", () => {
      expect(() => manager.getClient()).toThrow("No active connection");
    });

    it("should return client when connected", async () => {
      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
      expect(manager.getClient()).toBeDefined();
    });
  });

  describe("call count", () => {
    it("should track call count", async () => {
      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
      expect(manager.getState().callCount).toBe(0);

      manager.incrementCallCount();
      expect(manager.getState().callCount).toBe(1);

      manager.incrementCallCount();
      expect(manager.getState().callCount).toBe(2);
    });
  });

  describe("history", () => {
    it("should return empty history when nothing tracked", async () => {
      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
      const history = manager.getCallHistory();
      expect(history).toEqual([]);
    });

    it("should clear history", async () => {
      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
      const count = manager.clearHistory();
      expect(count).toBe(0);
    });
  });

  describe("maybeRecordInitialize", () => {
    it("should record event for valid initialize request with clientInfo", () => {
      const jsonRpcBody = {
        method: "initialize",
        params: {
          clientInfo: {
            name: "claude-code",
            version: "1.0.0",
          },
        },
      };

      const result = manager.maybeRecordInitialize(jsonRpcBody);

      expect(result).toBe(true);
      const events = manager.getAgentEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("agent-initialize");
      expect(events[0].payload).toEqual({
        clientName: "claude-code",
        clientVersion: "1.0.0",
      });
    });

    it("should record event with undefined name when clientInfo is missing", () => {
      const jsonRpcBody = {
        method: "initialize",
        params: {},
      };

      const result = manager.maybeRecordInitialize(jsonRpcBody);

      expect(result).toBe(true);
      const events = manager.getAgentEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("agent-initialize");
      expect(events[0].payload).toEqual({});
    });

    it("should return false for invalid JSON-RPC structure (no method)", () => {
      const jsonRpcBody = {
        params: {
          clientInfo: { name: "test" },
        },
      };

      const result = manager.maybeRecordInitialize(jsonRpcBody);

      expect(result).toBe(false);
      expect(manager.getAgentEvents()).toHaveLength(0);
    });

    it("should return false for non-initialize method", () => {
      const jsonRpcBody = {
        method: "tools/list",
        params: {},
      };

      const result = manager.maybeRecordInitialize(jsonRpcBody);

      expect(result).toBe(false);
      expect(manager.getAgentEvents()).toHaveLength(0);
    });

    it("should record event with undefined clientInfo when params is missing", () => {
      const jsonRpcBody = {
        method: "initialize",
      };

      const result = manager.maybeRecordInitialize(jsonRpcBody);

      expect(result).toBe(true);
      const events = manager.getAgentEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("agent-initialize");
      expect(events[0].payload).toEqual({});
    });
  });
});
