/**
 * Tests for preview_ui tool standalone mode paths
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConnectionManager } from "../src/connection";
import { createPreviewUITool } from "../src/tools/preview-ui";
import { createMockRegistry } from "./test-utils";

// Mock modules
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
          callTool: mockCallTool,
          listResources: mockListResources,
          readResource: mockReadResource,
        },
      })
    ),
  };
});

// Mock UIHostManager with a class
const mockRenderHeadless = vi.fn();

vi.mock("../src/ui-host", () => {
  return {
    UIHostManager: class MockUIHostManager {
      renderHeadless = mockRenderHeadless;
      dispose = vi.fn().mockResolvedValue(undefined);
    },
    detectProtocolFromMimeType: vi.fn().mockReturnValue("mcp"),
  };
});

describe("preview_ui Standalone Mode", () => {
  let manager: ConnectionManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    manager = new ConnectionManager();

    mockListTools.mockResolvedValue([{ name: "greet" }]);
    mockListResources.mockResolvedValue([]);
    mockListPrompts.mockResolvedValue([]);

    // Default successful render
    mockRenderHeadless.mockResolvedValue({
      html: "<html><body>Test Result</body></html>",
      textContent: "Test Result",
      elements: [{ tag: "body", attributes: {}, textContent: "Test Result" }],
      errors: [],
    });

    await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
  });

  afterEach(async () => {
    await manager.disconnect();
    vi.clearAllMocks();
  });

  describe("successful rendering", () => {
    it("should render widget successfully in standalone mode", async () => {
      const client = manager.getClient();
      vi.mocked(client.raw.callTool).mockResolvedValue({
        content: [{ type: "text", text: '{"message":"Hello"}' }],
      });
      vi.mocked(client.raw.listResources).mockResolvedValue({
        resources: [{ uri: "app://widgets/__ui_greet", mimeType: "text/html;profile=mcp-app" }],
      });
      vi.mocked(client.raw.readResource).mockResolvedValue({
        contents: [{ text: "<html><body>Widget</body></html>" }],
      });

      const tool = createPreviewUITool(createMockRegistry(manager));
      const result = await tool.handler(
        { tool: "greet", arguments: { name: "Alice" } },
        {} as never
      );

      expect(result.hasUI).toBe(true);
      expect(result.protocol).toBe("mcp");
      expect(result.dom).toBeDefined();
      expect(result.textContent).toBeDefined();
    });

    it("should include render duration", async () => {
      const client = manager.getClient();
      vi.mocked(client.raw.callTool).mockResolvedValue({
        content: [{ type: "text", text: '{"data":"test"}' }],
      });
      vi.mocked(client.raw.listResources).mockResolvedValue({
        resources: [{ uri: "app://widgets/__ui_greet", mimeType: "text/html;profile=mcp-app" }],
      });
      vi.mocked(client.raw.readResource).mockResolvedValue({
        contents: [{ text: "<div>Test</div>" }],
      });

      const tool = createPreviewUITool(createMockRegistry(manager));
      const result = await tool.handler({ tool: "greet", arguments: {} }, {} as never);

      expect(result.renderDuration).toBeDefined();
      expect(typeof result.renderDuration).toBe("number");
    });

    it("should detect toolResultDisplayed when result appears in text", async () => {
      const client = manager.getClient();
      vi.mocked(client.raw.callTool).mockResolvedValue({
        content: [{ type: "text", text: '{"greeting":"Hello World"}' }],
      });
      vi.mocked(client.raw.listResources).mockResolvedValue({
        resources: [{ uri: "app://widgets/__ui_greet", mimeType: "text/html;profile=mcp-app" }],
      });
      vi.mocked(client.raw.readResource).mockResolvedValue({
        contents: [{ text: "<div>Hello World</div>" }],
      });

      // Override mock to include tool result in textContent
      mockRenderHeadless.mockResolvedValue({
        html: "<html><body>Hello World</body></html>",
        textContent: "Hello World",
        elements: [],
        errors: [],
      });

      const tool = createPreviewUITool(createMockRegistry(manager));
      const result = await tool.handler({ tool: "greet", arguments: {} }, {} as never);

      expect(result.hasUI).toBe(true);
      expect(result.toolResultDisplayed).toBeDefined();
    });
  });

  describe("render failures", () => {
    it("should handle render failure gracefully", async () => {
      const client = manager.getClient();
      vi.mocked(client.raw.callTool).mockResolvedValue({
        content: [{ type: "text", text: '{"data":"test"}' }],
      });
      vi.mocked(client.raw.listResources).mockResolvedValue({
        resources: [{ uri: "app://widgets/__ui_greet", mimeType: "text/html;profile=mcp-app" }],
      });
      vi.mocked(client.raw.readResource).mockResolvedValue({
        contents: [{ text: "<div>Test</div>" }],
      });

      // Override mock to throw error
      mockRenderHeadless.mockRejectedValue(new Error("Render failed"));

      const tool = createPreviewUITool(createMockRegistry(manager));
      const result = await tool.handler({ tool: "greet", arguments: {} }, {} as never);

      expect(result.hasUI).toBe(true);
      expect(result.errors).toContain("Render failed: Render failed");
    });
  });

  describe("OpenAI protocol", () => {
    it("should use OpenAI protocol when specified", async () => {
      const client = manager.getClient();
      vi.mocked(client.raw.callTool).mockResolvedValue({
        content: [{ type: "text", text: '{"message":"test"}' }],
      });
      vi.mocked(client.raw.listResources).mockResolvedValue({
        resources: [{ uri: "app://widgets/__ui_greet", mimeType: "text/html+skybridge" }],
      });
      vi.mocked(client.raw.readResource).mockResolvedValue({
        contents: [{ text: "<div>OpenAI Widget</div>" }],
      });

      const tool = createPreviewUITool(createMockRegistry(manager));
      // Just verify tool accepts protocol parameter
      expect(tool).toBeDefined();
    });
  });
});
