/**
 * Additional tests for call_tool error handling and edge cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConnectionManager } from "../src/connection";
import { createCallToolTool } from "../src/tools/call-tool";

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
          callTool: vi.fn(),
          listResources: vi.fn().mockResolvedValue({ resources: [] }),
        },
      })
    ),
  };
});

describe("call_tool Error Handling", () => {
  let manager: ConnectionManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    manager = new ConnectionManager();

    // Default mock implementations
    mockListTools.mockResolvedValue([{ name: "greet" }]);
    mockListResources.mockResolvedValue([]);
    mockListPrompts.mockResolvedValue([]);

    // Connect
    await manager.connect("http://localhost:3000/mcp");
  });

  afterEach(async () => {
    await manager.disconnect();
  });

  describe("timeout errors", () => {
    it("should handle timeout error with lowercase message", async () => {
      mockCallTool.mockRejectedValue(new Error("Request timeout after 30000ms"));

      const tool = createCallToolTool(manager);
      const result = await tool.handler({ name: "slow_tool", arguments: {} }, {} as never);

      expect(result.isError).toBe(true);
      expect(result.error?.code).toBe("TIMEOUT");
      expect(result.error?.message).toContain("timed out");
    });

    it("should handle Timeout error with capitalized message", async () => {
      mockCallTool.mockRejectedValue(new Error("Timeout exceeded"));

      const tool = createCallToolTool(manager);
      const result = await tool.handler({ name: "slow_tool", arguments: {} }, {} as never);

      expect(result.isError).toBe(true);
      expect(result.error?.code).toBe("TIMEOUT");
    });
  });

  describe("not found errors", () => {
    it("should handle tool not found error", async () => {
      mockCallTool.mockRejectedValue(new Error("Tool not found: unknown_tool"));

      const tool = createCallToolTool(manager);
      const result = await tool.handler({ name: "unknown_tool", arguments: {} }, {} as never);

      expect(result.isError).toBe(true);
      expect(result.error?.code).toBe("NOT_FOUND");
      expect(result.error?.message).toContain("Tool not found");
    });

    it("should handle Unknown tool error", async () => {
      mockCallTool.mockRejectedValue(new Error("Unknown tool: foobar"));

      const tool = createCallToolTool(manager);
      const result = await tool.handler({ name: "foobar", arguments: {} }, {} as never);

      expect(result.isError).toBe(true);
      expect(result.error?.code).toBe("NOT_FOUND");
    });
  });

  describe("validation errors", () => {
    it("should handle validation error", async () => {
      mockCallTool.mockRejectedValue(new Error("validation failed: name is required"));

      const tool = createCallToolTool(manager);
      const result = await tool.handler({ name: "greet", arguments: {} }, {} as never);

      expect(result.isError).toBe(true);
      expect(result.error?.code).toBe("VALIDATION_ERROR");
      expect(result.error?.message).toContain("validation failed");
    });

    it("should handle Validation error with capital letter", async () => {
      mockCallTool.mockRejectedValue(new Error("Validation error: invalid input"));

      const tool = createCallToolTool(manager);
      const result = await tool.handler({ name: "greet", arguments: {} }, {} as never);

      expect(result.isError).toBe(true);
      expect(result.error?.code).toBe("VALIDATION_ERROR");
    });

    it("should handle required field error", async () => {
      mockCallTool.mockRejectedValue(new Error("Field 'name' is required"));

      const tool = createCallToolTool(manager);
      const result = await tool.handler({ name: "greet", arguments: {} }, {} as never);

      expect(result.isError).toBe(true);
      expect(result.error?.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("unknown errors", () => {
    it("should handle generic errors", async () => {
      mockCallTool.mockRejectedValue(new Error("Something went wrong"));

      const tool = createCallToolTool(manager);
      const result = await tool.handler({ name: "greet", arguments: {} }, {} as never);

      expect(result.isError).toBe(true);
      expect(result.error?.code).toBe("UNKNOWN_ERROR");
      expect(result.error?.message).toBe("Something went wrong");
    });

    it("should handle non-Error thrown values", async () => {
      mockCallTool.mockRejectedValue("String error");

      const tool = createCallToolTool(manager);
      const result = await tool.handler({ name: "greet", arguments: {} }, {} as never);

      expect(result.isError).toBe(true);
      expect(result.error?.code).toBe("UNKNOWN_ERROR");
      expect(result.error?.message).toBe("String error");
    });
  });

  describe("tool error response", () => {
    it("should handle isError=true in response", async () => {
      mockCallTool.mockResolvedValue({
        content: [{ type: "text", text: "Tool execution failed: Invalid input" }],
        isError: true,
      });

      const tool = createCallToolTool(manager);
      const result = await tool.handler({ name: "greet", arguments: {} }, {} as never);

      expect(result.isError).toBe(true);
      expect(result.error?.code).toBe("TOOL_ERROR");
      expect(result.error?.message).toBe("Tool execution failed: Invalid input");
    });

    it("should use Unknown error when no text content", async () => {
      mockCallTool.mockResolvedValue({
        content: [{ type: "image", data: "base64" }],
        isError: true,
      });

      const tool = createCallToolTool(manager);
      const result = await tool.handler({ name: "greet", arguments: {} }, {} as never);

      expect(result.isError).toBe(true);
      expect(result.error?.code).toBe("TOOL_ERROR");
      expect(result.error?.message).toBe("Unknown error");
    });
  });

  describe("successful responses", () => {
    it("should return structuredContent when present", async () => {
      mockCallTool.mockResolvedValue({
        content: [{ type: "text", text: '{"greeting":"Hello"}' }],
        isError: false,
        structuredContent: { greeting: "Hello" },
      });

      const tool = createCallToolTool(manager);
      const result = await tool.handler(
        { name: "greet", arguments: { name: "Alice" } },
        {} as never
      );

      expect(result.isError).toBe(false);
      expect(result.structuredContent).toEqual({ greeting: "Hello" });
    });

    it("should include duration in response", async () => {
      mockCallTool.mockResolvedValue({
        content: [{ type: "text", text: "Hello" }],
        isError: false,
      });

      const tool = createCallToolTool(manager);
      const result = await tool.handler({ name: "greet", arguments: {} }, {} as never);

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("should handle multiple content blocks", async () => {
      mockCallTool.mockResolvedValue({
        content: [
          { type: "text", text: "Hello" },
          { type: "image", data: "base64data", mimeType: "image/png" },
        ],
        isError: false,
      });

      const tool = createCallToolTool(manager);
      const result = await tool.handler({ name: "greet", arguments: {} }, {} as never);

      expect(result.content).toHaveLength(2);
      expect(result.content[0]?.type).toBe("text");
      expect(result.content[1]?.type).toBe("image");
    });
  });
});
