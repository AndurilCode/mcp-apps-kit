/**
 * Tests for test_widget_interaction tool standalone mode paths
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConnectionManager } from "../src/connection";
import { createTestWidgetInteractionTool } from "../src/tools/test-widget-interaction";
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
const mockFrame = {
  click: vi.fn().mockResolvedValue(undefined),
  fill: vi.fn().mockResolvedValue(undefined),
  hover: vi.fn().mockResolvedValue(undefined),
  locator: vi.fn().mockReturnValue({
    scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
  }),
  content: vi.fn().mockResolvedValue("<html><body>Widget content</body></html>"),
  textContent: vi.fn().mockResolvedValue("Widget content"),
  evaluate: vi.fn().mockResolvedValue(undefined),
};

const mockPage = {
  frame: vi.fn().mockReturnValue(mockFrame),
  on: vi.fn(),
  mouse: {
    click: vi.fn().mockResolvedValue(undefined),
  },
  waitForTimeout: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
};

const mockRenderInBrowser = vi.fn();

vi.mock("../src/ui-host", () => {
  return {
    UIHostManager: class MockUIHostManager {
      renderInBrowser = mockRenderInBrowser;
      dispose = vi.fn().mockResolvedValue(undefined);
    },
    detectProtocolFromMimeType: vi.fn().mockReturnValue("mcp"),
  };
});

describe("test_widget_interaction Standalone Mode", () => {
  let manager: ConnectionManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    manager = new ConnectionManager();

    mockListTools.mockResolvedValue([{ name: "greet" }]);
    mockListResources.mockResolvedValue([]);
    mockListPrompts.mockResolvedValue([]);

    // Reset frame mock
    mockFrame.click.mockResolvedValue(undefined);
    mockFrame.fill.mockResolvedValue(undefined);
    mockFrame.hover.mockResolvedValue(undefined);
    mockFrame.content.mockResolvedValue("<html><body>Widget content</body></html>");
    mockFrame.textContent.mockResolvedValue("Widget content");
    // frame.evaluate is used for both scroll and snapshot (getting textContent)
    mockFrame.evaluate.mockResolvedValue("Widget content");

    // Reset page mock
    mockPage.frame.mockReturnValue(mockFrame);
    mockPage.on.mockClear();
    mockPage.waitForTimeout.mockResolvedValue(undefined);
    mockPage.close.mockClear();

    // Default successful render
    mockRenderInBrowser.mockResolvedValue({
      page: mockPage,
      errors: [],
    });

    await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
  });

  afterEach(async () => {
    if (manager) {
      try {
        await manager.disconnect();
      } catch {
        // Ignore disconnect errors during cleanup
      }
    }
    vi.clearAllMocks();
  });

  describe("successful interaction testing", () => {
    it("should perform click interaction in standalone mode", async () => {
      const client = manager.getClient();
      vi.mocked(client.raw.callTool).mockResolvedValue({
        content: [{ type: "text", text: '{"message":"Hello"}' }],
      });
      vi.mocked(client.raw.listResources).mockResolvedValue({
        resources: [{ uri: "app://widgets/__ui_greet", mimeType: "text/html;profile=mcp-app" }],
      });
      vi.mocked(client.raw.readResource).mockResolvedValue({
        contents: [{ text: "<html><body><button id='btn'>Click</button></body></html>" }],
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

      expect(result.hasUI).toBe(true);
      expect(result.protocol).toBe("mcp");
      expect(mockFrame.click).toHaveBeenCalledWith("#btn");
    });

    it("should perform type interaction", async () => {
      const client = manager.getClient();
      vi.mocked(client.raw.callTool).mockResolvedValue({
        content: [{ type: "text", text: '{"data":"test"}' }],
      });
      vi.mocked(client.raw.listResources).mockResolvedValue({
        resources: [{ uri: "app://widgets/__ui_greet", mimeType: "text/html;profile=mcp-app" }],
      });
      vi.mocked(client.raw.readResource).mockResolvedValue({
        contents: [{ text: "<div><input type='text' id='input'/></div>" }],
      });

      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      await tool.handler(
        {
          tool: "greet",
          arguments: {},
          interactions: [{ action: "type", selector: "#input", text: "Hello" }],
        },
        {} as never
      );

      expect(mockFrame.fill).toHaveBeenCalledWith("#input", "Hello");
    });

    it("should perform hover interaction", async () => {
      const client = manager.getClient();
      vi.mocked(client.raw.callTool).mockResolvedValue({
        content: [{ type: "text", text: '{"data":"test"}' }],
      });
      vi.mocked(client.raw.listResources).mockResolvedValue({
        resources: [{ uri: "app://widgets/__ui_greet", mimeType: "text/html;profile=mcp-app" }],
      });
      vi.mocked(client.raw.readResource).mockResolvedValue({
        contents: [{ text: "<div id='hover-target'>Hover me</div>" }],
      });

      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      await tool.handler(
        {
          tool: "greet",
          arguments: {},
          interactions: [{ action: "hover", selector: "#hover-target" }],
        },
        {} as never
      );

      expect(mockFrame.hover).toHaveBeenCalledWith("#hover-target");
    });

    it("should perform wait interaction", async () => {
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

      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      await tool.handler(
        {
          tool: "greet",
          arguments: {},
          interactions: [{ action: "wait", ms: 500 }],
        },
        {} as never
      );

      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(500);
    });

    it("should perform scroll interaction with position", async () => {
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

      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      await tool.handler(
        {
          tool: "greet",
          arguments: {},
          interactions: [{ action: "scroll", position: { x: 0, y: 500 } }],
        },
        {} as never
      );

      expect(mockFrame.evaluate).toHaveBeenCalled();
    });

    it("should perform snapshot interaction", async () => {
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

      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          tool: "greet",
          arguments: {},
          interactions: [{ action: "snapshot" }],
        },
        {} as never
      );

      expect(result.snapshots).toHaveLength(1);
      expect(result.snapshots[0]?.dom).toBeDefined();
      expect(result.snapshots[0]?.textContent).toBeDefined();
    });

    it("should perform multiple interactions", async () => {
      const client = manager.getClient();
      vi.mocked(client.raw.callTool).mockResolvedValue({
        content: [{ type: "text", text: '{"data":"test"}' }],
      });
      vi.mocked(client.raw.listResources).mockResolvedValue({
        resources: [{ uri: "app://widgets/__ui_greet", mimeType: "text/html;profile=mcp-app" }],
      });
      vi.mocked(client.raw.readResource).mockResolvedValue({
        contents: [{ text: "<div><input id='in'/><button id='btn'/></div>" }],
      });

      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      await tool.handler(
        {
          tool: "greet",
          arguments: {},
          interactions: [
            { action: "type", selector: "#in", text: "Hello" },
            { action: "click", selector: "#btn" },
            { action: "snapshot" },
          ],
        },
        {} as never
      );

      expect(mockFrame.fill).toHaveBeenCalledWith("#in", "Hello");
      expect(mockFrame.click).toHaveBeenCalledWith("#btn");
    });

    it("should close page after interactions", async () => {
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

      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      await tool.handler(
        {
          tool: "greet",
          arguments: {},
          interactions: [{ action: "click", selector: "#btn" }],
        },
        {} as never
      );

      expect(mockPage.close).toHaveBeenCalled();
    });

    it("should handle click with position instead of selector", async () => {
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

      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      await tool.handler(
        {
          tool: "greet",
          arguments: {},
          interactions: [{ action: "click", position: { x: 100, y: 200 } }],
        },
        {} as never
      );

      expect(mockPage.mouse.click).toHaveBeenCalledWith(100, 200);
    });
  });

  describe("interaction failures", () => {
    it("should capture error when interaction fails", async () => {
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

      // Make click fail
      mockFrame.click.mockRejectedValue(new Error("Element not found"));

      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          tool: "greet",
          arguments: {},
          interactions: [{ action: "click", selector: "#missing" }],
        },
        {} as never
      );

      expect(result.errors).toContain("Action 0 (click) failed: Element not found");
    });
  });

  describe("resource validation errors", () => {
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
    });

    it("should return error when no UI resource found", async () => {
      const client = manager.getClient();
      vi.mocked(client.raw.callTool).mockResolvedValue({
        content: [{ type: "text", text: '{"message":"Hello"}' }],
      });
      vi.mocked(client.raw.listResources).mockResolvedValue({ resources: [] });

      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          tool: "greet",
          arguments: {},
          interactions: [{ action: "click", selector: "#btn" }],
        },
        {} as never
      );

      expect(result.hasUI).toBe(false);
      expect(result.noUIReason).toBe("No UI resource found for tool: greet");
    });

    it("should return error when HTML is empty", async () => {
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
          arguments: {},
          interactions: [{ action: "click", selector: "#btn" }],
        },
        {} as never
      );

      expect(result.hasUI).toBe(false);
      expect(result.noUIReason).toContain("No HTML content in resource");
    });

    it("should return error when fetching HTML fails", async () => {
      const client = manager.getClient();
      vi.mocked(client.raw.callTool).mockResolvedValue({
        content: [{ type: "text", text: '{"message":"Hello"}' }],
      });
      vi.mocked(client.raw.listResources).mockResolvedValue({
        resources: [{ uri: "app://widgets/__ui_greet", mimeType: "text/html;profile=mcp-app" }],
      });
      vi.mocked(client.raw.readResource).mockRejectedValue(new Error("Resource fetch failed"));

      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          tool: "greet",
          arguments: {},
          interactions: [{ action: "click", selector: "#btn" }],
        },
        {} as never
      );

      expect(result.hasUI).toBe(false);
      expect(result.noUIReason).toContain("Failed to fetch widget HTML");
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
      mockRenderInBrowser.mockRejectedValue(new Error("Render failed"));

      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          tool: "greet",
          arguments: {},
          interactions: [{ action: "click", selector: "#btn" }],
        },
        {} as never
      );

      expect(result.hasUI).toBe(true);
      expect(result.errors).toContain("Interaction test failed: Render failed");
    });

    it("should handle widget iframe not found", async () => {
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

      // Return null for frame
      mockPage.frame.mockReturnValue(null);

      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          tool: "greet",
          arguments: {},
          interactions: [{ action: "click", selector: "#btn" }],
        },
        {} as never
      );

      expect(result.errors).toContain("Widget iframe not found");
    });
  });

  describe("session mode interactions", () => {
    it("should perform interactions on existing session", async () => {
      const sessionManager = manager.getWidgetSessionManager();

      // Create a mock session
      const mockSessionFrame = {
        click: vi.fn().mockResolvedValue(undefined),
        fill: vi.fn().mockResolvedValue(undefined),
        hover: vi.fn().mockResolvedValue(undefined),
        locator: vi.fn().mockReturnValue({
          scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
        }),
        content: vi.fn().mockResolvedValue("<html><body>Session content</body></html>"),
        textContent: vi.fn().mockResolvedValue("Session content"),
        evaluate: vi.fn().mockResolvedValue(undefined),
      };

      const mockSessionPage = {
        frame: vi.fn().mockReturnValue(mockSessionFrame),
        mouse: { click: vi.fn().mockResolvedValue(undefined) },
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
      };

      const mockSession = {
        id: "test-session-id",
        toolName: "greet",
        toolArguments: {},
        toolResult: {},
        widgetSessionId: "widget-123",
        protocol: "mcp" as const,
        page: mockSessionPage as never,
        consoleLogs: [],
        pageErrors: [],
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sessionManager as any).store.sessions.set("test-session-id", mockSession);

      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          sessionId: "test-session-id",
          interactions: [{ action: "click", selector: "#btn" }, { action: "snapshot" }],
        },
        {} as never
      );

      expect(result.hasUI).toBe(true);
      expect(mockSessionFrame.click).toHaveBeenCalledWith("#btn");
      expect(result.snapshots).toHaveLength(1);
    });

    it("should handle session without widget iframe", async () => {
      const sessionManager = manager.getWidgetSessionManager();

      const mockSessionPage = {
        frame: vi.fn().mockReturnValue(null),
      };

      const mockSession = {
        id: "no-frame-session",
        toolName: "greet",
        toolArguments: {},
        toolResult: {},
        widgetSessionId: "widget-789",
        protocol: "mcp" as const,
        page: mockSessionPage as never,
        consoleLogs: [],
        pageErrors: [],
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sessionManager as any).store.sessions.set("no-frame-session", mockSession);

      const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          sessionId: "no-frame-session",
          interactions: [{ action: "click", selector: "#btn" }],
        },
        {} as never
      );

      expect(result.hasUI).toBe(true);
      expect(result.errors).toContain("Widget iframe not found");
    });
  });
});
