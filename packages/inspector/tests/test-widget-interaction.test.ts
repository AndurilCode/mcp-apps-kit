/**
 * Tests for test_widget_interaction tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConnectionManager } from "../src/connection";
import { createTestWidgetInteractionTool } from "../src/tools/test-widget-interaction";
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

describe("test_widget_interaction Tool", () => {
  let manager: ConnectionManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    manager = new ConnectionManager();

    mockListTools.mockResolvedValue([{ name: "greet" }]);
    mockListResources.mockResolvedValue([]);
    mockListPrompts.mockResolvedValue([]);

    await manager.connect("http://localhost:3000/mcp");
  });

  afterEach(async () => {
    await manager.disconnect();
  });

  describe("standalone mode validation", () => {
    it("should return error when neither sessionId nor tool/arguments provided", async () => {
      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      const result = await tool.handler(
        { interactions: [{ action: "click", selector: "#btn" }] },
        {} as never
      );

      expect(result.hasUI).toBe(false);
      expect(result.noUIReason).toBe(
        "Either sessionId or both tool and arguments must be provided"
      );
      expect(result.errors).toContain("Missing required parameters");
      expect(result.snapshots).toEqual([]);
      expect(result.toolCalls).toEqual([]);
      expect(result.stateChanges).toEqual([]);
    });

    it("should return error when only tool provided without arguments", async () => {
      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      const result = await tool.handler(
        { tool: "greet", interactions: [{ action: "click", selector: "#btn" }] },
        {} as never
      );

      expect(result.hasUI).toBe(false);
      expect(result.noUIReason).toBe(
        "Either sessionId or both tool and arguments must be provided"
      );
    });
  });

  describe("session mode", () => {
    it("should return error when session not found", async () => {
      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          sessionId: "non-existent-id",
          interactions: [{ action: "click", selector: "#btn" }],
        },
        {} as never
      );

      expect(result.hasUI).toBe(false);
      expect(result.noUIReason).toBe("Session not found: non-existent-id");
      expect(result.errors).toContain("Session non-existent-id does not exist or has expired");
    });
  });

  describe("tool call failures", () => {
    it("should return error when tool call fails", async () => {
      const client = manager.getClient();
      vi.mocked(client.raw.callTool).mockRejectedValue(new Error("Tool execution failed"));

      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          tool: "greet",
          arguments: { name: "Alice" },
          interactions: [{ action: "click", selector: "#btn" }],
        },
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

      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          tool: "greet",
          arguments: { name: "Alice" },
          interactions: [{ action: "click", selector: "#btn" }],
        },
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

      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          tool: "greet",
          arguments: { name: "Alice" },
          interactions: [{ action: "click", selector: "#btn" }],
        },
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

      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          tool: "greet",
          arguments: { name: "Alice" },
          interactions: [{ action: "click", selector: "#btn" }],
        },
        {} as never
      );

      expect(result.hasUI).toBe(false);
      expect(result.noUIReason).toContain("Failed to fetch widget HTML");
      expect(result.errors).toContain("Resource read failed");
    });
  });

  describe("interaction types", () => {
    // Helper to get action enum options from the Zod schema
    // Zod 4 API: tool.input.shape.interactions.element.shape.action.options
    const getActionOptions = () => {
      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      const inputSchema = tool.input;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const interactionsSchema = (inputSchema as any).shape.interactions;
      // Zod 4 uses .element instead of ._def.type for arrays
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const elementSchema = interactionsSchema.element;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const actionSchema = elementSchema.shape.action;
      return actionSchema.options as string[];
    };

    it("should have inputSchema that accepts click action", () => {
      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      expect(tool.input).toBeDefined();
      expect(getActionOptions()).toContain("click");
    });

    it("should have inputSchema that accepts type action", () => {
      expect(getActionOptions()).toContain("type");
    });

    it("should have inputSchema that accepts hover action", () => {
      expect(getActionOptions()).toContain("hover");
    });

    it("should have inputSchema that accepts wait action", () => {
      expect(getActionOptions()).toContain("wait");
    });

    it("should have inputSchema that accepts scroll action", () => {
      expect(getActionOptions()).toContain("scroll");
    });

    it("should have inputSchema that accepts snapshot action", () => {
      expect(getActionOptions()).toContain("snapshot");
    });
  });

  describe("metadata", () => {
    it("should have correct tool metadata", () => {
      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      expect(tool.description).toContain("interactions");
    });
  });

  describe("not connected", () => {
    it("should throw error when not connected", async () => {
      const disconnectedManager = new ConnectionManager();
      const tool = createTestWidgetInteractionTool(createMockRegistry(disconnectedManager));

      await expect(
        tool.handler(
          {
            tool: "greet",
            arguments: {},
            interactions: [{ action: "click", selector: "#btn" }],
          },
          {} as never
        )
      ).rejects.toThrow("No active connection");
    });
  });
});
