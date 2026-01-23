/**
 * Tool execution tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConnectionManager } from "../src/connection";
import {
  createConnectTool,
  createDisconnectTool,
  createListToolsTool,
  createCallToolTool,
  createGetConnectionStatusTool,
} from "../src/tools";

// Mock the @mcp-apps-kit/testing module
const mockListTools = vi.fn();
const mockListResources = vi.fn();
const mockListPrompts = vi.fn();
const mockCallTool = vi.fn();
const mockDisconnect = vi.fn();
const mockGetCallHistory = vi.fn();
const mockClearHistory = vi.fn();

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
        raw: {},
      })
    ),
  };
});

describe("Inspector Tools", () => {
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

  describe("connect_to_server", () => {
    it("should connect to a server and return tool count", async () => {
      const tool = createConnectTool(manager);
      const result = await tool.handler({ url: "http://localhost:3000/mcp" }, {} as never);

      expect(result.connected).toBe(true);
      expect(result.serverUrl).toBe("http://localhost:3000/mcp");
      expect(result.toolCount).toBe(1);
      expect(result.resourceCount).toBe(0);
      expect(result.promptCount).toBe(0);
    });

    it("should handle invalid URL", async () => {
      const tool = createConnectTool(manager);
      await expect(tool.handler({ url: "not-a-url" }, {} as never)).rejects.toThrow(
        "Invalid URL format"
      );
    });
  });

  describe("disconnect", () => {
    it("should disconnect from server", async () => {
      await manager.connect("http://localhost:3000/mcp");

      const tool = createDisconnectTool(manager);
      const result = await tool.handler({}, {} as never);

      expect(result.disconnected).toBe(true);
      expect(result.previousUrl).toBe("http://localhost:3000/mcp");
    });

    it("should return null previousUrl when not connected", async () => {
      const tool = createDisconnectTool(manager);
      const result = await tool.handler({}, {} as never);

      expect(result.disconnected).toBe(true);
      expect(result.previousUrl).toBe(null);
    });
  });

  describe("list_tools", () => {
    it("should list tools from connected server", async () => {
      await manager.connect("http://localhost:3000/mcp");

      const tool = createListToolsTool(manager);
      const result = await tool.handler({}, {} as never);

      expect(result.tools).toHaveLength(1);
      expect(result.tools[0]).toEqual({ name: "greet", description: "Greet someone" });
    });

    it("should throw error when not connected", async () => {
      const tool = createListToolsTool(manager);
      await expect(tool.handler({}, {} as never)).rejects.toThrow("No active connection");
    });

    it("should return empty array when server has no tools", async () => {
      mockListTools.mockResolvedValue([]);
      await manager.connect("http://localhost:3000/mcp");

      const tool = createListToolsTool(manager);
      const result = await tool.handler({}, {} as never);

      expect(result.tools).toEqual([]);
    });
  });

  describe("call_tool", () => {
    it("should call tool and return result", async () => {
      await manager.connect("http://localhost:3000/mcp");

      const tool = createCallToolTool(manager);
      const result = await tool.handler(
        { name: "greet", arguments: { name: "Alice" } },
        {} as never
      );

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ type: "text", text: "Hello!" });
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("should handle tool errors", async () => {
      mockCallTool.mockResolvedValue({
        content: [{ type: "text", text: "Error: name is required" }],
        isError: true,
      });
      await manager.connect("http://localhost:3000/mcp");

      const tool = createCallToolTool(manager);
      const result = await tool.handler({ name: "greet", arguments: {} }, {} as never);

      expect(result.isError).toBe(true);
      expect(result.error?.code).toBe("TOOL_ERROR");
    });

    it("should throw error when not connected", async () => {
      const tool = createCallToolTool(manager);
      await expect(tool.handler({ name: "greet", arguments: {} }, {} as never)).rejects.toThrow(
        "No active connection"
      );
    });
  });

  describe("get_connection_status", () => {
    it("should return status when not connected", async () => {
      const tool = createGetConnectionStatusTool(manager);
      const result = await tool.handler({}, {} as never);

      expect(result.connected).toBe(false);
      expect(result.serverUrl).toBe(null);
      expect(result.serverInfo).toBe(null);
      expect(result.historyEnabled).toBe(true);
      expect(result.callCount).toBe(0);
    });

    it("should return status when connected", async () => {
      await manager.connect("http://localhost:3000/mcp");

      const tool = createGetConnectionStatusTool(manager);
      const result = await tool.handler({}, {} as never);

      expect(result.connected).toBe(true);
      expect(result.serverUrl).toBe("http://localhost:3000/mcp");
      expect(result.historyEnabled).toBe(true);
      expect(result.callCount).toBe(0);
    });
  });
});
