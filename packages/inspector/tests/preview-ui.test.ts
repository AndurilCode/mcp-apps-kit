/**
 * Tests for preview_ui tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConnectionManager } from "../src/connection";
import { createPreviewUITool } from "../src/tools/preview-ui";
import { createMockRegistry } from "./test-utils";

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
        readResource: mockReadResource,
        disconnect: vi.fn(),
        getCallHistory: vi.fn().mockReturnValue([]),
        clearHistory: vi.fn(),
        raw: {
          callTool: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: '{"data":"result"}' }],
          }),
          listResources: vi.fn().mockResolvedValue({ resources: [] }),
          readResource: mockReadResource,
        },
      })
    ),
  };
});

describe("preview_ui Tool", () => {
  let manager: ConnectionManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    manager = new ConnectionManager();

    // Default mock implementations
    mockListTools.mockResolvedValue([{ name: "greet" }]);
    mockListResources.mockResolvedValue([]);
    mockListPrompts.mockResolvedValue([]);

    // Connect
    await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
  });

  afterEach(async () => {
    if (manager) {
      await manager.disconnect();
    }
    vi.clearAllMocks();
  });

  describe("standalone mode validation", () => {
    it("should return error when neither sessionId nor tool/arguments provided", async () => {
      const tool = createPreviewUITool(createMockRegistry(manager));
      const result = await tool.handler({}, {} as never);

      expect(result.hasUI).toBe(false);
      expect(result.noUIReason).toBe(
        "Either sessionId or both tool and arguments must be provided"
      );
      expect(result.errors).toContain("Missing required parameters");
    });

    it("should return error when only tool provided without arguments", async () => {
      const tool = createPreviewUITool(createMockRegistry(manager));
      const result = await tool.handler({ tool: "greet" }, {} as never);

      expect(result.hasUI).toBe(false);
      expect(result.noUIReason).toBe(
        "Either sessionId or both tool and arguments must be provided"
      );
    });

    it("should return error when only arguments provided without tool", async () => {
      const tool = createPreviewUITool(createMockRegistry(manager));
      const result = await tool.handler({ arguments: { name: "Alice" } }, {} as never);

      expect(result.hasUI).toBe(false);
      expect(result.noUIReason).toBe(
        "Either sessionId or both tool and arguments must be provided"
      );
    });
  });

  describe("session mode", () => {
    it("should return error when session not found", async () => {
      const tool = createPreviewUITool(createMockRegistry(manager));
      const result = await tool.handler({ sessionId: "non-existent-id" }, {} as never);

      expect(result.hasUI).toBe(false);
      expect(result.noUIReason).toBe("Session not found: non-existent-id");
      expect(result.errors).toContain("Session non-existent-id does not exist or has expired");
    });
  });

  describe("tool call failures", () => {
    it("should return error when tool call fails", async () => {
      const client = manager.getClient();
      vi.mocked(client.raw.callTool).mockRejectedValue(new Error("Tool execution failed"));

      const tool = createPreviewUITool(createMockRegistry(manager));
      const result = await tool.handler(
        { tool: "greet", arguments: { name: "Alice" } },
        {} as never
      );

      expect(result.hasUI).toBe(false);
      expect(result.noUIReason).toBe("Tool call failed: Tool execution failed");
      expect(result.errors).toContain("Tool execution failed");
    });
  });

  describe("UI resource lookup", () => {
    it("should return error when no UI resource found for tool", async () => {
      const client = manager.getClient();
      vi.mocked(client.raw.callTool).mockResolvedValue({
        content: [{ type: "text", text: '{"message":"Hello"}' }],
      });
      vi.mocked(client.raw.listResources).mockResolvedValue({ resources: [] });

      const tool = createPreviewUITool(createMockRegistry(manager));
      const result = await tool.handler(
        { tool: "greet", arguments: { name: "Alice" } },
        {} as never
      );

      expect(result.hasUI).toBe(false);
      expect(result.noUIReason).toBe("No UI resource found for tool: greet");
    });

    it("should return error when resource HTML is empty", async () => {
      const client = manager.getClient();
      vi.mocked(client.raw.callTool).mockResolvedValue({
        content: [{ type: "text", text: '{"message":"Hello"}' }],
      });
      vi.mocked(client.raw.listResources).mockResolvedValue({
        resources: [{ uri: "app://widgets/__ui_greet", mimeType: "text/html;profile=mcp-app" }],
      });
      vi.mocked(client.raw.readResource).mockResolvedValue({
        contents: [{ text: "" }],
      });

      const tool = createPreviewUITool(createMockRegistry(manager));
      const result = await tool.handler(
        { tool: "greet", arguments: { name: "Alice" } },
        {} as never
      );

      expect(result.hasUI).toBe(false);
      expect(result.noUIReason).toContain("No HTML content in resource");
    });

    it("should return error when reading resource fails", async () => {
      const client = manager.getClient();
      vi.mocked(client.raw.callTool).mockResolvedValue({
        content: [{ type: "text", text: '{"message":"Hello"}' }],
      });
      vi.mocked(client.raw.listResources).mockResolvedValue({
        resources: [{ uri: "app://widgets/__ui_greet", mimeType: "text/html;profile=mcp-app" }],
      });
      vi.mocked(client.raw.readResource).mockRejectedValue(new Error("Resource read failed"));

      const tool = createPreviewUITool(createMockRegistry(manager));
      const result = await tool.handler(
        { tool: "greet", arguments: { name: "Alice" } },
        {} as never
      );

      expect(result.hasUI).toBe(false);
      expect(result.noUIReason).toContain("Failed to fetch widget HTML");
      expect(result.errors).toContain("Resource read failed");
    });
  });

  describe("metadata", () => {
    it("should have correct tool metadata", () => {
      const tool = createPreviewUITool(createMockRegistry(manager));
      expect(tool.description).toContain("Preview a tool's UI widget");
    });
  });

  describe("not connected", () => {
    it("should throw error when not connected", async () => {
      const disconnectedManager = new ConnectionManager();
      const tool = createPreviewUITool(createMockRegistry(disconnectedManager));

      await expect(tool.handler({ tool: "greet", arguments: {} }, {} as never)).rejects.toThrow(
        "No active connection"
      );
    });
  });
});
