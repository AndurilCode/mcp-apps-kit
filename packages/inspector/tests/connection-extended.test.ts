/**
 * Extended tests for ConnectionManager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConnectionManager } from "../src/connection";

// Mock the testing module
const mockListTools = vi.fn();
const mockListResources = vi.fn();
const mockListPrompts = vi.fn();
const mockCallTool = vi.fn();
const mockDisconnect = vi.fn();
const mockGetCallHistory = vi.fn();
const mockClearHistory = vi.fn();
const mockReadResource = vi.fn();

vi.mock("@mcp-apps-kit/testing", () => {
  return {
    createTestClient: vi.fn().mockImplementation(() =>
      Promise.resolve({
        listTools: mockListTools,
        listResources: mockListResources,
        listPrompts: mockListPrompts,
        callTool: mockCallTool,
        disconnect: mockDisconnect,
        getCallHistory: mockGetCallHistory,
        clearHistory: mockClearHistory,
        readResource: mockReadResource,
        raw: {
          callTool: mockCallTool,
          listResources: mockListResources,
          readResource: mockReadResource,
        },
      })
    ),
  };
});

describe("ConnectionManager Extended", () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ConnectionManager();

    // Default mock implementations
    mockListTools.mockResolvedValue([{ name: "greet", description: "Greet someone" }]);
    mockListResources.mockResolvedValue([]);
    mockListPrompts.mockResolvedValue([]);
    mockCallTool.mockResolvedValue({ content: [{ type: "text", text: "Hello!" }], isError: false });
    mockDisconnect.mockResolvedValue(undefined);
    mockGetCallHistory.mockReturnValue([]);
    mockClearHistory.mockReturnValue(undefined);
  });

  afterEach(async () => {
    await manager.disconnect();
  });

  describe("constructor options", () => {
    it("should accept maxHistorySize option", () => {
      const customManager = new ConnectionManager({ maxHistorySize: 500 });
      expect(customManager).toBeDefined();
    });

    it("should accept defaultTimeout option", () => {
      const customManager = new ConnectionManager({ defaultTimeout: 60000 });
      expect(customManager).toBeDefined();
    });

    it("should accept debug option", () => {
      const customManager = new ConnectionManager({ debug: true });
      expect(customManager).toBeDefined();
    });
  });

  describe("getState", () => {
    it("should return disconnected state initially", () => {
      const state = manager.getState();
      expect(state.connected).toBe(false);
      expect(state.serverUrl).toBeNull();
      expect(state.serverInfo).toBeNull();
      expect(state.client).toBeNull();
    });

    it("should return connected state after connection", async () => {
      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
      const state = manager.getState();

      expect(state.connected).toBe(true);
      expect(state.serverUrl).toBe("http://localhost:3000/mcp");
    });
  });

  describe("getClient", () => {
    it("should throw when not connected", () => {
      expect(() => manager.getClient()).toThrow("No active connection");
    });

    it("should return client after connection", async () => {
      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
      const client = manager.getClient();
      expect(client).toBeDefined();
    });
  });

  describe("environmentState", () => {
    it("should return default environment state", () => {
      const state = manager.getEnvironmentState();
      expect(state.theme).toBe("light");
      expect(state.locale).toBe("en-US");
      expect(state.timeZone).toBe("UTC");
      expect(state.displayMode).toBe("inline");
      expect(state.viewport).toEqual({ width: 800, height: 600 });
    });

    it("should update environment state", () => {
      manager.setEnvironmentState({
        theme: "dark",
        locale: "fr-FR",
        timeZone: "Europe/Paris",
        displayMode: "fullscreen",
        viewport: { width: 1920, height: 1080 },
        safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        userAgent: {},
      });

      const state = manager.getEnvironmentState();
      expect(state.theme).toBe("dark");
      expect(state.locale).toBe("fr-FR");
      expect(state.timeZone).toBe("Europe/Paris");
      expect(state.displayMode).toBe("fullscreen");
      expect(state.viewport).toEqual({ width: 1920, height: 1080 });
    });

    it("should reset environment state", () => {
      manager.setEnvironmentState({
        theme: "dark",
        locale: "de-DE",
        timeZone: "Europe/Berlin",
        displayMode: "pip",
        viewport: { width: 400, height: 300 },
        safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        userAgent: {},
      });

      manager.resetEnvironmentState();
      const state = manager.getEnvironmentState();

      expect(state.theme).toBe("light");
      expect(state.locale).toBe("en-US");
      expect(state.displayMode).toBe("inline");
    });

    it("should update from globals input", () => {
      manager.updateEnvironmentFromGlobals({
        theme: "dark",
        viewport: { width: 1024, height: 768 },
        maxHeight: 500,
        userLocation: { city: "New York", country: "US" },
      });

      const state = manager.getEnvironmentState();
      expect(state.theme).toBe("dark");
      expect(state.viewport).toEqual({ width: 1024, height: 768 });
      expect(state.maxHeight).toBe(500);
      expect(state.userLocation).toEqual({ city: "New York", country: "US" });
    });

    it("should clear maxHeight when set to null", () => {
      manager.updateEnvironmentFromGlobals({ maxHeight: 500 });
      expect(manager.getEnvironmentState().maxHeight).toBe(500);

      manager.updateEnvironmentFromGlobals({ maxHeight: null });
      // Setting to null may result in null or undefined depending on implementation
      expect(manager.getEnvironmentState().maxHeight ?? null).toBeNull();
    });

    it("should clear userLocation when set to null", () => {
      manager.updateEnvironmentFromGlobals({
        userLocation: { city: "Paris", country: "FR" },
      });
      expect(manager.getEnvironmentState().userLocation).toEqual({
        city: "Paris",
        country: "FR",
      });

      manager.updateEnvironmentFromGlobals({ userLocation: null });
      // Setting to null may result in null or undefined depending on implementation
      expect(manager.getEnvironmentState().userLocation ?? null).toBeNull();
    });
  });

  describe("history", () => {
    it("should enable history by default", () => {
      expect(manager.isHistoryEnabled()).toBe(true);
    });

    it("should return call history", async () => {
      mockGetCallHistory.mockReturnValue([
        {
          name: "greet",
          args: { name: "Alice" },
          result: { content: [] },
          duration: 100,
          timestamp: new Date(),
        },
      ]);
      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });

      const history = manager.getCallHistory();
      expect(history).toHaveLength(1);
    });

    it("should clear history", async () => {
      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
      manager.clearHistory();

      expect(mockClearHistory).toHaveBeenCalled();
    });
  });

  describe("call count", () => {
    it("should start at zero", () => {
      const state = manager.getState();
      expect(state.callCount).toBe(0);
    });

    it("should increment call count", async () => {
      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
      manager.incrementCallCount();
      manager.incrementCallCount();
      manager.incrementCallCount();

      const state = manager.getState();
      expect(state.callCount).toBe(3);
    });
  });

  describe("widget session manager", () => {
    it("should return widget session manager", () => {
      const sessionManager = manager.getWidgetSessionManager();
      expect(sessionManager).toBeDefined();
      expect(sessionManager.listSessions).toBeDefined();
    });
  });

  describe("inspector URL", () => {
    it("should set and get inspector URL", () => {
      manager.setInspectorUrl("http://localhost:5173");
      expect(manager.getInspectorUrl()).toBe("http://localhost:5173");
    });

    it("should be null by default", () => {
      expect(manager.getInspectorUrl()).toBeNull();
    });
  });

  describe("auth token", () => {
    it("should set and get auth token", () => {
      manager.setAuthToken("my-secret-token");
      expect(manager.getAuthToken()).toBe("my-secret-token");
    });

    it("should be null by default", () => {
      expect(manager.getAuthToken()).toBeNull();
    });
  });

  describe("target schema", () => {
    it("should return null target schema initially", () => {
      expect(manager.getTargetSchema()).toBeNull();
    });
  });
});
