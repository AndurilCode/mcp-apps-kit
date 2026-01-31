/**
 * Tests for get_console_logs tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConnectionManager } from "../src/connection";
import { createGetConsoleLogsTool } from "../src/tools/get-console-logs";
import { createMockRegistry } from "./test-utils";

// Mock testing module
const mockCallTool = vi.fn();
const mockListTools = vi.fn();
const mockListResources = vi.fn();
const mockListPrompts = vi.fn();

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
          callTool: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: '{"data":"result"}' }],
          }),
          listResources: vi.fn().mockResolvedValue({ resources: [] }),
          readResource: vi.fn(),
        },
      })
    ),
  };
});

describe("get_console_logs Tool", () => {
  let manager: ConnectionManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    manager = new ConnectionManager();

    mockListTools.mockResolvedValue([{ name: "greet" }]);
    mockListResources.mockResolvedValue([]);
    mockListPrompts.mockResolvedValue([]);

    await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
  });

  afterEach(async () => {
    await manager.disconnect();
  });

  describe("standalone mode validation", () => {
    it("should return error when neither sessionId nor tool/arguments provided", async () => {
      const tool = createGetConsoleLogsTool(createMockRegistry(manager));
      const result = await tool.handler({}, {} as never);

      expect(result.hasUI).toBe(false);
      expect(result.noUIReason).toBe(
        "Either sessionId or both tool and arguments must be provided"
      );
      expect(result.errors).toContain("Missing required parameters");
      expect(result.logs).toEqual([]);
      expect(result.summary).toEqual({ total: 0, log: 0, info: 0, warn: 0, error: 0, debug: 0 });
    });

    it("should return error when only tool provided without arguments", async () => {
      const tool = createGetConsoleLogsTool(createMockRegistry(manager));
      const result = await tool.handler({ tool: "greet" }, {} as never);

      expect(result.hasUI).toBe(false);
      expect(result.noUIReason).toBe(
        "Either sessionId or both tool and arguments must be provided"
      );
    });
  });

  describe("session mode", () => {
    it("should return error when session not found", async () => {
      const tool = createGetConsoleLogsTool(createMockRegistry(manager));
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

      const tool = createGetConsoleLogsTool(createMockRegistry(manager));
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

      const tool = createGetConsoleLogsTool(createMockRegistry(manager));
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

      const tool = createGetConsoleLogsTool(createMockRegistry(manager));
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

      const tool = createGetConsoleLogsTool(createMockRegistry(manager));
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
      const tool = createGetConsoleLogsTool(createMockRegistry(manager));
      expect(tool.description).toContain("console logs");
    });
  });

  describe("not connected", () => {
    it("should throw error when not connected", async () => {
      const disconnectedManager = new ConnectionManager();
      const tool = createGetConsoleLogsTool(createMockRegistry(disconnectedManager));

      await expect(tool.handler({ tool: "greet", arguments: {} }, {} as never)).rejects.toThrow(
        "No active connection"
      );
    });
  });
});
