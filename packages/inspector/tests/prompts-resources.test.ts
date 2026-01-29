/**
 * Tests for list_prompts, get_prompt, list_resources, read_resource tools
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConnectionManager } from "../src/connection";
import { createListPromptsTool } from "../src/tools/list-prompts";
import { createGetPromptTool } from "../src/tools/get-prompt";
import { createListResourcesTool } from "../src/tools/list-resources";
import { createReadResourceTool } from "../src/tools/read-resource";

// Mock the testing module
const mockListPrompts = vi.fn();
const mockGetPrompt = vi.fn();
const mockListResources = vi.fn();
const mockReadResource = vi.fn();
const mockListTools = vi.fn();

vi.mock("@mcp-apps-kit/testing", () => {
  return {
    createTestClient: vi.fn().mockImplementation(() =>
      Promise.resolve({
        listTools: mockListTools,
        listResources: mockListResources,
        listPrompts: mockListPrompts,
        getPrompt: mockGetPrompt,
        readResource: mockReadResource,
        callTool: vi.fn(),
        disconnect: vi.fn(),
        getCallHistory: vi.fn().mockReturnValue([]),
        clearHistory: vi.fn(),
        raw: {},
      })
    ),
  };
});

describe("Prompts and Resources Tools", () => {
  let manager: ConnectionManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    manager = new ConnectionManager();

    // Default mock implementations
    mockListTools.mockResolvedValue([]);
    mockListResources.mockResolvedValue([]);
    mockListPrompts.mockResolvedValue([]);

    // Connect to enable client access
    await manager.connect("http://localhost:3000/mcp");
  });

  describe("list_prompts", () => {
    it("should list prompts from connected server", async () => {
      mockListPrompts.mockResolvedValue([
        { name: "greeting", description: "A greeting prompt" },
        { name: "summary", description: "A summary prompt" },
      ]);

      const tool = createListPromptsTool(manager);
      const result = await tool.handler({}, {} as never);

      expect(result.prompts).toHaveLength(2);
      expect(result.prompts[0]).toEqual({
        name: "greeting",
        description: "A greeting prompt",
      });
      expect(result.prompts[1]).toEqual({
        name: "summary",
        description: "A summary prompt",
      });
    });

    it("should return empty array when no prompts", async () => {
      mockListPrompts.mockResolvedValue([]);

      const tool = createListPromptsTool(manager);
      const result = await tool.handler({}, {} as never);

      expect(result.prompts).toEqual([]);
    });

    it("should throw error when not connected", async () => {
      const disconnectedManager = new ConnectionManager();
      const tool = createListPromptsTool(disconnectedManager);

      await expect(tool.handler({}, {} as never)).rejects.toThrow("No active connection");
    });

    it("should have correct metadata", () => {
      const tool = createListPromptsTool(manager);
      expect(tool.description).toBe("List all prompts available on the connected MCP server.");
    });
  });

  describe("get_prompt", () => {
    it("should get a prompt by name", async () => {
      mockGetPrompt.mockResolvedValue({
        description: "A greeting prompt",
        messages: [
          {
            role: "user",
            content: { type: "text", text: "Hello {{name}}" },
          },
        ],
      });

      const tool = createGetPromptTool(manager);
      const result = await tool.handler({ name: "greeting" }, {} as never);

      expect(result.description).toBe("A greeting prompt");
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.role).toBe("user");
      expect(result.messages[0]?.content.type).toBe("text");
      expect(result.messages[0]?.content.text).toBe("Hello {{name}}");
    });

    it("should get a prompt with arguments", async () => {
      mockGetPrompt.mockResolvedValue({
        description: "Personalized greeting",
        messages: [
          {
            role: "user",
            content: { type: "text", text: "Hello Alice" },
          },
        ],
      });

      const tool = createGetPromptTool(manager);
      const result = await tool.handler(
        { name: "greeting", arguments: { name: "Alice" } },
        {} as never
      );

      expect(result.messages[0]?.content.text).toBe("Hello Alice");
    });

    it("should throw error for not found prompt", async () => {
      mockGetPrompt.mockRejectedValue(new Error("Prompt not found"));

      const tool = createGetPromptTool(manager);

      await expect(tool.handler({ name: "unknown" }, {} as never)).rejects.toThrow(
        "Prompt not found: unknown"
      );
    });

    it("should throw error for missing required argument", async () => {
      mockGetPrompt.mockRejectedValue(new Error("Missing required argument 'name'"));

      const tool = createGetPromptTool(manager);

      await expect(tool.handler({ name: "greeting" }, {} as never)).rejects.toThrow(
        "Missing required argument for prompt 'greeting'"
      );
    });

    it("should throw generic error for other failures", async () => {
      mockGetPrompt.mockRejectedValue(new Error("Server error"));

      const tool = createGetPromptTool(manager);

      await expect(tool.handler({ name: "greeting" }, {} as never)).rejects.toThrow(
        "Failed to get prompt 'greeting': Server error"
      );
    });

    it("should throw error when not connected", async () => {
      const disconnectedManager = new ConnectionManager();
      const tool = createGetPromptTool(disconnectedManager);

      await expect(tool.handler({ name: "greeting" }, {} as never)).rejects.toThrow(
        "No active connection"
      );
    });
  });

  describe("list_resources", () => {
    it("should list resources from connected server", async () => {
      mockListResources.mockResolvedValue([
        { uri: "file://readme.md", name: "README", description: "Project readme" },
        { uri: "file://config.json", name: "Config" },
      ]);

      const tool = createListResourcesTool(manager);
      const result = await tool.handler({}, {} as never);

      expect(result.resources).toHaveLength(2);
      expect(result.resources[0]).toEqual({
        uri: "file://readme.md",
        name: "README",
        description: "Project readme",
      });
      expect(result.resources[1]).toEqual({
        uri: "file://config.json",
        name: "Config",
        description: undefined,
      });
    });

    it("should return empty array when no resources", async () => {
      mockListResources.mockResolvedValue([]);

      const tool = createListResourcesTool(manager);
      const result = await tool.handler({}, {} as never);

      expect(result.resources).toEqual([]);
    });

    it("should throw error when not connected", async () => {
      const disconnectedManager = new ConnectionManager();
      const tool = createListResourcesTool(disconnectedManager);

      await expect(tool.handler({}, {} as never)).rejects.toThrow("No active connection");
    });

    it("should have correct metadata", () => {
      const tool = createListResourcesTool(manager);
      expect(tool.description).toBe("List all resources available on the connected MCP server.");
    });
  });

  describe("read_resource", () => {
    it("should read a resource by URI", async () => {
      mockReadResource.mockResolvedValue({
        contents: [{ text: "# README\n\nProject description", mimeType: "text/markdown" }],
      });

      const tool = createReadResourceTool(manager);
      const result = await tool.handler({ uri: "file://readme.md" }, {} as never);

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]).toEqual({
        uri: "file://readme.md",
        text: "# README\n\nProject description",
        blob: undefined,
        mimeType: "text/markdown",
      });
    });

    it("should handle binary content", async () => {
      mockReadResource.mockResolvedValue({
        contents: [{ blob: "base64encodeddata", mimeType: "image/png" }],
      });

      const tool = createReadResourceTool(manager);
      const result = await tool.handler({ uri: "file://image.png" }, {} as never);

      expect(result.contents[0]?.uri).toBe("file://image.png");
      expect(result.contents[0]?.blob).toBe("base64encodeddata");
      expect(result.contents[0]?.mimeType).toBe("image/png");
    });

    it("should throw error for not found resource", async () => {
      mockReadResource.mockRejectedValue(new Error("Resource not found"));

      const tool = createReadResourceTool(manager);

      await expect(tool.handler({ uri: "file://unknown.txt" }, {} as never)).rejects.toThrow(
        "Resource not found: file://unknown.txt"
      );
    });

    it("should throw error for Not found (capitalized)", async () => {
      mockReadResource.mockRejectedValue(new Error("Not found: file://unknown.txt"));

      const tool = createReadResourceTool(manager);

      await expect(tool.handler({ uri: "file://unknown.txt" }, {} as never)).rejects.toThrow(
        "Resource not found: file://unknown.txt"
      );
    });

    it("should throw generic error for other failures", async () => {
      mockReadResource.mockRejectedValue(new Error("Server error"));

      const tool = createReadResourceTool(manager);

      await expect(tool.handler({ uri: "file://readme.md" }, {} as never)).rejects.toThrow(
        "Failed to read resource file://readme.md: Server error"
      );
    });

    it("should throw error when not connected", async () => {
      const disconnectedManager = new ConnectionManager();
      const tool = createReadResourceTool(disconnectedManager);

      await expect(tool.handler({ uri: "file://readme.md" }, {} as never)).rejects.toThrow(
        "No active connection"
      );
    });
  });
});
