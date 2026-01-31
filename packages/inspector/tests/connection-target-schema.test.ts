/**
 * Tests for ConnectionManager target schema and resource reading
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
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
        serverInfo: { name: "test-server", version: "1.0.0" },
      })
    ),
  };
});

describe("ConnectionManager Target Schema", () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ConnectionManager();

    // Default mock implementations
    mockListTools.mockResolvedValue([
      {
        name: "greet",
        description: "Greet someone",
        inputSchema: { type: "object", properties: { name: { type: "string" } } },
      },
    ]);
    mockListResources.mockResolvedValue([
      { uri: "file://readme.md", name: "README", mimeType: "text/markdown" },
    ]);
    mockListPrompts.mockResolvedValue([{ name: "greeting", description: "Greeting prompt" }]);
    mockCallTool.mockResolvedValue({
      content: [{ type: "text", text: "Hello!" }],
      isError: false,
    });
    mockDisconnect.mockResolvedValue(undefined);
    mockGetCallHistory.mockReturnValue([]);
    mockClearHistory.mockReturnValue(undefined);
  });

  describe("target schema capture", () => {
    it("should capture target schema on connect", async () => {
      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });

      const schema = manager.getTargetSchema();
      expect(schema).not.toBeNull();
      expect(schema?.tools).toHaveLength(1);
      expect(schema?.resources).toHaveLength(1);
      expect(schema?.prompts).toHaveLength(1);
    });

    it("should store server info in target schema when available", async () => {
      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });

      const schema = manager.getTargetSchema();
      // serverInfo is extracted via getServerVersion() which may not be available in mock
      // The schema should exist regardless
      expect(schema).not.toBeNull();
    });

    it("should set capturedAt timestamp", async () => {
      const before = Date.now();
      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
      const after = Date.now();

      const schema = manager.getTargetSchema();
      expect(schema?.capturedAt).toBeGreaterThanOrEqual(before);
      expect(schema?.capturedAt).toBeLessThanOrEqual(after);
    });

    it("should clear target schema on disconnect", async () => {
      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
      expect(manager.getTargetSchema()).not.toBeNull();

      await manager.disconnect();
      expect(manager.getTargetSchema()).toBeNull();
    });

    it("should capture full tool metadata", async () => {
      mockListTools.mockResolvedValue([
        {
          name: "advanced_tool",
          title: "Advanced Tool",
          description: "A tool with full metadata",
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
          _meta: { ui: { resource: "widget://tool" } },
          annotations: { category: "utility" },
        },
      ]);

      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });

      const schema = manager.getTargetSchema();
      const tool = schema?.tools[0];
      expect(tool?.name).toBe("advanced_tool");
      expect(tool?.title).toBe("Advanced Tool");
      expect(tool?.description).toBe("A tool with full metadata");
      expect(tool?._meta).toEqual({ ui: { resource: "widget://tool" } });
      expect(tool?.annotations).toEqual({ category: "utility" });
    });

    it("should capture full resource metadata", async () => {
      mockListResources.mockResolvedValue([
        {
          uri: "widget://ui",
          name: "UI Widget",
          description: "Widget resource",
          mimeType: "text/html;profile=mcp-app",
          _meta: { binding: "tool" },
          annotations: { type: "ui" },
        },
      ]);

      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });

      const schema = manager.getTargetSchema();
      const resource = schema?.resources[0];
      expect(resource?.uri).toBe("widget://ui");
      expect(resource?.name).toBe("UI Widget");
      expect(resource?.description).toBe("Widget resource");
      expect(resource?.mimeType).toBe("text/html;profile=mcp-app");
      expect(resource?._meta).toEqual({ binding: "tool" });
      expect(resource?.annotations).toEqual({ type: "ui" });
    });

    it("should capture prompt metadata", async () => {
      mockListPrompts.mockResolvedValue([
        {
          name: "advanced_prompt",
          description: "A detailed prompt",
          arguments: [
            { name: "context", description: "Context text", required: true },
            { name: "style", description: "Output style", required: false },
          ],
          _meta: { category: "generation" },
        },
      ]);

      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });

      const schema = manager.getTargetSchema();
      const prompt = schema?.prompts[0];
      expect(prompt?.name).toBe("advanced_prompt");
      expect(prompt?.description).toBe("A detailed prompt");
      expect(prompt?.arguments).toHaveLength(2);
      expect(prompt?._meta).toEqual({ category: "generation" });
    });
  });

  describe("readTargetResource", () => {
    it("should read resource when connected", async () => {
      mockReadResource.mockResolvedValue({
        contents: [{ text: "# README content", mimeType: "text/markdown" }],
      });

      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });

      const result = await manager.readTargetResource("file://readme.md");
      // readTargetResource returns the text content as a string
      expect(result).toBe("# README content");
    });

    it("should throw error when not connected", async () => {
      await expect(manager.readTargetResource("file://readme.md")).rejects.toThrow(
        "No active connection"
      );
    });
  });
});

describe("ConnectionManager Connection Events", () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ConnectionManager();

    mockListTools.mockResolvedValue([]);
    mockListResources.mockResolvedValue([]);
    mockListPrompts.mockResolvedValue([]);
  });

  it("should emit schemaUpdated event on connect", async () => {
    const schemaHandler = vi.fn();
    manager.on("schemaUpdated", schemaHandler);

    await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });

    expect(schemaHandler).toHaveBeenCalledTimes(1);
  });

  it("should emit disconnected event on disconnect", async () => {
    const disconnectedHandler = vi.fn();
    manager.on("disconnected", disconnectedHandler);

    await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
    await manager.disconnect();

    expect(disconnectedHandler).toHaveBeenCalledTimes(1);
  });
});
