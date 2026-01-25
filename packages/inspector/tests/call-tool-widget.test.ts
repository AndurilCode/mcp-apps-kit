/**
 * Tests for call_tool widget rendering and session management paths
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConnectionManager } from "../src/connection";
import { createCallToolTool } from "../src/tools/call-tool";

// Mock testing module
const mockCallTool = vi.fn();
const mockListTools = vi.fn();
const mockListResources = vi.fn();
const mockListPrompts = vi.fn();
const mockReadResource = vi.fn();

vi.mock("@mcp-apps-kit/testing", () => {
  return {
    createTestClient: vi.fn().mockImplementation(() =>
      Promise.resolve({
        listTools: mockListTools,
        listResources: mockListResources,
        listPrompts: mockListPrompts,
        callTool: mockCallTool,
        disconnect: vi.fn(),
        getCallHistory: vi.fn().mockReturnValue([]),
        clearHistory: vi.fn(),
        raw: {
          callTool: vi.fn(),
          listResources: mockListResources,
          readResource: mockReadResource,
        },
      })
    ),
  };
});

describe("call_tool Widget Rendering", () => {
  let manager: ConnectionManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    manager = new ConnectionManager();

    mockListTools.mockResolvedValue([{ name: "greet" }]);
    mockListResources.mockResolvedValue([]);
    mockListPrompts.mockResolvedValue([]);
    mockCallTool.mockResolvedValue({
      content: [{ type: "text", text: "Hello!" }],
      isError: false,
    });

    await manager.connect("http://localhost:3000/mcp");
  });

  describe("without renderWidget", () => {
    it("should return result without sessionId when renderWidget is false", async () => {
      const tool = createCallToolTool(manager);
      const result = await tool.handler(
        { name: "greet", arguments: { name: "Alice" }, renderWidget: false },
        {} as never
      );

      expect(result.isError).toBe(false);
      expect(result.sessionId).toBeUndefined();
    });

    it("should return result without sessionId when renderWidget is not specified", async () => {
      const tool = createCallToolTool(manager);
      const result = await tool.handler(
        { name: "greet", arguments: { name: "Alice" } },
        {} as never
      );

      expect(result.isError).toBe(false);
      expect(result.sessionId).toBeUndefined();
    });
  });

  describe("with renderWidget=true but no UI resource", () => {
    it("should return success without sessionId when no UI resource found", async () => {
      const client = manager.getClient();
      vi.mocked(client.raw.listResources).mockResolvedValue({ resources: [] });

      const tool = createCallToolTool(manager);
      const result = await tool.handler(
        { name: "greet", arguments: { name: "Alice" }, renderWidget: true },
        {} as never
      );

      expect(result.isError).toBe(false);
      expect(result.sessionId).toBeUndefined();
    });
  });

  describe("structuredContent", () => {
    it("should return structuredContent when provided in response", async () => {
      mockCallTool.mockResolvedValue({
        content: [{ type: "text", text: "ignored" }],
        isError: false,
        structuredContent: { greeting: "Hello", target: "World" },
      });

      const tool = createCallToolTool(manager);
      const result = await tool.handler({ name: "greet", arguments: {} }, {} as never);

      expect(result.structuredContent).toEqual({ greeting: "Hello", target: "World" });
    });
  });

  describe("content block processing", () => {
    it("should process text content blocks", async () => {
      mockCallTool.mockResolvedValue({
        content: [{ type: "text", text: "Test result" }],
        isError: false,
      });

      const tool = createCallToolTool(manager);
      const result = await tool.handler({ name: "greet", arguments: {} }, {} as never);

      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe("text");
      expect(result.content[0]?.text).toBe("Test result");
    });

    it("should process image content blocks", async () => {
      mockCallTool.mockResolvedValue({
        content: [{ type: "image", data: "base64data", mimeType: "image/png" }],
        isError: false,
      });

      const tool = createCallToolTool(manager);
      const result = await tool.handler({ name: "greet", arguments: {} }, {} as never);

      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe("image");
      expect(result.content[0]?.data).toBe("base64data");
      expect(result.content[0]?.mimeType).toBe("image/png");
    });

    it("should process multiple content blocks", async () => {
      mockCallTool.mockResolvedValue({
        content: [
          { type: "text", text: "Message 1" },
          { type: "text", text: "Message 2" },
          { type: "image", data: "imagedata", mimeType: "image/jpeg" },
        ],
        isError: false,
      });

      const tool = createCallToolTool(manager);
      const result = await tool.handler({ name: "greet", arguments: {} }, {} as never);

      expect(result.content).toHaveLength(3);
    });
  });

  describe("error response formatting", () => {
    it("should format tool error with TOOL_ERROR code", async () => {
      mockCallTool.mockResolvedValue({
        content: [{ type: "text", text: "Custom error message" }],
        isError: true,
      });

      const tool = createCallToolTool(manager);
      const result = await tool.handler({ name: "greet", arguments: {} }, {} as never);

      expect(result.isError).toBe(true);
      expect(result.error?.code).toBe("TOOL_ERROR");
      expect(result.error?.message).toBe("Custom error message");
    });
  });

  describe("metadata", () => {
    it("should include duration in response", async () => {
      const tool = createCallToolTool(manager);
      const result = await tool.handler({ name: "greet", arguments: {} }, {} as never);

      expect(result.duration).toBeDefined();
      expect(typeof result.duration).toBe("number");
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("should have correct tool description", () => {
      const tool = createCallToolTool(manager);
      expect(tool.description).toContain("Call a tool");
    });
  });
});
