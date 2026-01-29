/**
 * Tool execution tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

  afterEach(async () => {
    await manager.disconnect();
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

    it("should return existing connection when already connected to same URL", async () => {
      // First connection
      await manager.connect("http://localhost:3000/mcp");

      const tool = createConnectTool(manager);
      const result = await tool.handler({ url: "http://localhost:3000/mcp" }, {} as never);

      expect(result.connected).toBe(true);
      expect(result.serverUrl).toBe("http://localhost:3000/mcp");
    });

    it("should throw when connected to different URL without force", async () => {
      await manager.connect("http://localhost:3000/mcp");

      const tool = createConnectTool(manager);
      await expect(tool.handler({ url: "http://localhost:4000/mcp" }, {} as never)).rejects.toThrow(
        "Already connected"
      );
    });

    it("should reconnect when force=true with different URL", async () => {
      await manager.connect("http://localhost:3000/mcp");

      const tool = createConnectTool(manager);
      const result = await tool.handler(
        { url: "http://localhost:4000/mcp", force: true },
        {} as never
      );

      expect(result.connected).toBe(true);
      expect(result.serverUrl).toBe("http://localhost:4000/mcp");
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
      expect(result.tools[0]).toEqual({
        name: "greet",
        description: "Greet someone",
        inputSchema: undefined,
        hasUI: false,
        visibility: undefined,
      });
      // Should include hints indicating no UI widgets available
      expect(result.hints).toBeDefined();
      expect(result.hints?.next).toContain("No tools have UI widgets");
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

  describe("list_tools with UI metadata", () => {
    it("should detect MCP nested UI metadata", async () => {
      mockListTools.mockResolvedValue([
        {
          name: "widget-tool",
          description: "Has widget",
          _meta: {
            ui: {
              resourceUri: "app://widgets/__ui_test",
              visibility: ["model", "app"],
            },
          },
        },
      ]);
      await manager.connect("http://localhost:3000/mcp");

      const tool = createListToolsTool(manager);
      const result = await tool.handler({}, {} as never);

      expect(result.tools[0].hasUI).toBe(true);
      expect(result.tools[0].visibility).toEqual(["model", "app"]);
      expect(result.hints?.next).toContain("hasUI=true");
    });

    it("should detect MCP nested UI metadata with default visibility", async () => {
      mockListTools.mockResolvedValue([
        {
          name: "widget-tool",
          description: "Has widget",
          _meta: {
            ui: {
              resourceUri: "app://widgets/__ui_test",
            },
          },
        },
      ]);
      await manager.connect("http://localhost:3000/mcp");

      const tool = createListToolsTool(manager);
      const result = await tool.handler({}, {} as never);

      expect(result.tools[0].hasUI).toBe(true);
      expect(result.tools[0].visibility).toEqual(["model", "app"]);
    });

    it("should detect flat UI metadata format", async () => {
      mockListTools.mockResolvedValue([
        {
          name: "flat-tool",
          description: "Has flat UI",
          _meta: {
            "ui/resourceUri": "app://widgets/__ui_flat",
            "ui/visibility": ["model"],
          },
        },
      ]);
      await manager.connect("http://localhost:3000/mcp");

      const tool = createListToolsTool(manager);
      const result = await tool.handler({}, {} as never);

      expect(result.tools[0].hasUI).toBe(true);
      expect(result.tools[0].visibility).toEqual(["model"]);
    });

    it("should detect flat UI metadata with default visibility", async () => {
      mockListTools.mockResolvedValue([
        {
          name: "flat-tool-default",
          description: "Has flat UI",
          _meta: {
            "ui/resourceUri": "app://widgets/__ui_flat",
          },
        },
      ]);
      await manager.connect("http://localhost:3000/mcp");

      const tool = createListToolsTool(manager);
      const result = await tool.handler({}, {} as never);

      expect(result.tools[0].hasUI).toBe(true);
      expect(result.tools[0].visibility).toEqual(["model", "app"]);
    });

    it("should detect OpenAI output template format", async () => {
      mockListTools.mockResolvedValue([
        {
          name: "openai-tool",
          description: "Has OpenAI widget",
          _meta: {
            "openai/outputTemplate": "app://widgets/openai_test",
            "openai/visibility": "public",
            "openai/widgetAccessible": true,
          },
        },
      ]);
      await manager.connect("http://localhost:3000/mcp");

      const tool = createListToolsTool(manager);
      const result = await tool.handler({}, {} as never);

      expect(result.tools[0].hasUI).toBe(true);
      expect(result.tools[0].visibility).toContain("model");
      expect(result.tools[0].visibility).toContain("app");
    });

    it("should handle OpenAI template with private visibility", async () => {
      mockListTools.mockResolvedValue([
        {
          name: "openai-private",
          description: "Private OpenAI widget",
          _meta: {
            "openai/outputTemplate": "app://widgets/openai_private",
            "openai/visibility": "private",
            "openai/widgetAccessible": false,
          },
        },
      ]);
      await manager.connect("http://localhost:3000/mcp");

      const tool = createListToolsTool(manager);
      const result = await tool.handler({}, {} as never);

      expect(result.tools[0].hasUI).toBe(true);
      // Private visibility means model is not added, widgetAccessible=false means app is not added
      // Fallback: ["model"]
      expect(result.tools[0].visibility).toEqual(["model"]);
    });

    it("should handle OpenAI template with no visibility set", async () => {
      mockListTools.mockResolvedValue([
        {
          name: "openai-default",
          description: "Default OpenAI widget",
          _meta: {
            "openai/outputTemplate": "app://widgets/openai_default",
          },
        },
      ]);
      await manager.connect("http://localhost:3000/mcp");

      const tool = createListToolsTool(manager);
      const result = await tool.handler({}, {} as never);

      expect(result.tools[0].hasUI).toBe(true);
      expect(result.tools[0].visibility).toContain("model");
    });

    it("should handle tool without _meta", async () => {
      mockListTools.mockResolvedValue([
        {
          name: "plain-tool",
          description: "No UI",
        },
      ]);
      await manager.connect("http://localhost:3000/mcp");

      const tool = createListToolsTool(manager);
      const result = await tool.handler({}, {} as never);

      expect(result.tools[0].hasUI).toBe(false);
      expect(result.tools[0].visibility).toBeUndefined();
    });

    it("should handle _meta.ui without resourceUri", async () => {
      mockListTools.mockResolvedValue([
        {
          name: "no-uri-tool",
          description: "Has meta but no uri",
          _meta: {
            ui: { someOther: "data" },
          },
        },
      ]);
      await manager.connect("http://localhost:3000/mcp");

      const tool = createListToolsTool(manager);
      const result = await tool.handler({}, {} as never);

      expect(result.tools[0].hasUI).toBe(false);
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
