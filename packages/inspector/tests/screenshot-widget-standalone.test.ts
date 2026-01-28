/**
 * Tests for screenshot_widget tool standalone mode paths
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConnectionManager } from "../src/connection";
import { createScreenshotWidgetTool } from "../src/tools/screenshot-widget";

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

// Mock fs/promises
vi.mock("fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// Mock UIHostManager with a class
const mockScreenshotData = Buffer.from("fake-image-data");
const mockPage = {
  frame: vi.fn().mockReturnValue({
    locator: vi.fn().mockReturnValue({
      screenshot: vi.fn().mockResolvedValue(mockScreenshotData),
    }),
  }),
  screenshot: vi.fn().mockResolvedValue(mockScreenshotData),
  close: vi.fn().mockResolvedValue(undefined),
};

const mockRenderInBrowser = vi.fn();
const mockTakeScreenshot = vi.fn();

vi.mock("../src/ui-host", () => {
  return {
    UIHostManager: class MockUIHostManager {
      renderInBrowser = mockRenderInBrowser;
      takeScreenshot = mockTakeScreenshot;
      dispose = vi.fn().mockResolvedValue(undefined);
    },
    detectProtocolFromMimeType: vi.fn().mockReturnValue("mcp"),
  };
});

describe("screenshot_widget Standalone Mode", () => {
  let manager: ConnectionManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    manager = new ConnectionManager();

    mockListTools.mockResolvedValue([{ name: "greet" }]);
    mockListResources.mockResolvedValue([]);
    mockListPrompts.mockResolvedValue([]);

    // Reset mock page handlers
    mockPage.frame.mockReturnValue({
      locator: vi.fn().mockReturnValue({
        screenshot: vi.fn().mockResolvedValue(mockScreenshotData),
      }),
    });
    mockPage.screenshot.mockResolvedValue(mockScreenshotData);
    mockPage.close.mockClear();

    // Default successful render
    mockRenderInBrowser.mockResolvedValue({
      page: mockPage,
      errors: [],
    });

    mockTakeScreenshot.mockResolvedValue({
      data: mockScreenshotData,
      format: "png",
    });

    await manager.connect("http://localhost:3000/mcp");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("successful screenshot capture", () => {
    it("should capture screenshot in standalone mode", async () => {
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

      const tool = createScreenshotWidgetTool(manager);
      const result = await tool.handler(
        { tool: "greet", arguments: { name: "Alice" } },
        {} as never
      );

      expect(result.hasUI).toBe(true);
      expect(result.protocol).toBe("mcp");
      expect(result.screenshotPath).toBeDefined();
      expect(result.format).toBe("png");
    });

    it("should close page after screenshot", async () => {
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

      const tool = createScreenshotWidgetTool(manager);
      await tool.handler({ tool: "greet", arguments: {} }, {} as never);

      expect(mockPage.close).toHaveBeenCalled();
    });

    it("should use default viewport 800x600", async () => {
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

      const tool = createScreenshotWidgetTool(manager);
      const result = await tool.handler({ tool: "greet", arguments: {} }, {} as never);

      expect(result.dimensions).toEqual({ width: 800, height: 600 });
    });

    it("should use custom viewport when specified", async () => {
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

      const tool = createScreenshotWidgetTool(manager);
      const result = await tool.handler(
        { tool: "greet", arguments: {}, viewport: { width: 1920, height: 1080 } },
        {} as never
      );

      expect(result.dimensions).toEqual({ width: 1920, height: 1080 });
    });

    it("should use jpeg format when specified", async () => {
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

      const tool = createScreenshotWidgetTool(manager);
      const result = await tool.handler(
        { tool: "greet", arguments: {}, format: "jpeg" },
        {} as never
      );

      expect(result.format).toBe("jpeg");
    });

    it("should use fullPage screenshot when specified", async () => {
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

      // When fullPage is true, it should fall back to takeScreenshot
      mockPage.frame.mockReturnValue(null);

      const tool = createScreenshotWidgetTool(manager);
      await tool.handler({ tool: "greet", arguments: {}, fullPage: true }, {} as never);

      expect(mockTakeScreenshot).toHaveBeenCalled();
    });
  });

  describe("resource validation errors", () => {
    it("should return error when tool call fails", async () => {
      const client = manager.getClient();
      vi.mocked(client.raw.callTool).mockRejectedValue(new Error("Tool execution failed"));

      const tool = createScreenshotWidgetTool(manager);
      const result = await tool.handler(
        { tool: "greet", arguments: { name: "Alice" } },
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

      const tool = createScreenshotWidgetTool(manager);
      const result = await tool.handler(
        { tool: "greet", arguments: { name: "Alice" } },
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

      const tool = createScreenshotWidgetTool(manager);
      const result = await tool.handler(
        { tool: "greet", arguments: { name: "Alice" } },
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

      const tool = createScreenshotWidgetTool(manager);
      const result = await tool.handler(
        { tool: "greet", arguments: { name: "Alice" } },
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

      const tool = createScreenshotWidgetTool(manager);
      const result = await tool.handler({ tool: "greet", arguments: {} }, {} as never);

      expect(result.hasUI).toBe(true);
      expect(result.errors).toContain("Screenshot failed: Render failed");
    });
  });

  describe("session mode", () => {
    it("should capture screenshot from existing session", async () => {
      // Create a session in the manager
      const sessionManager = manager.getWidgetSessionManager();

      // Create a mock session with page
      const mockSessionPage = {
        frame: vi.fn().mockReturnValue({
          locator: vi.fn().mockReturnValue({
            screenshot: vi.fn().mockResolvedValue(mockScreenshotData),
          }),
        }),
        screenshot: vi.fn().mockResolvedValue(mockScreenshotData),
      };

      const mockSession = {
        id: "test-session-id",
        toolName: "greet",
        toolArguments: { name: "Alice" },
        toolResult: { message: "Hello" },
        widgetSessionId: "widget-123",
        protocol: "mcp" as const,
        page: mockSessionPage as never,
        consoleLogs: [],
        pageErrors: [],
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      };

      // Access private sessions map through reflection
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sessionManager as any).store.sessions.set("test-session-id", mockSession);

      const tool = createScreenshotWidgetTool(manager);
      const result = await tool.handler({ sessionId: "test-session-id" }, {} as never);

      expect(result.hasUI).toBe(true);
      expect(result.protocol).toBe("mcp");
      expect(result.screenshotPath).toBeDefined();
    });

    it("should handle session screenshot failure gracefully", async () => {
      const sessionManager = manager.getWidgetSessionManager();

      // Create a mock session that throws on screenshot
      const mockSessionPage = {
        frame: vi.fn().mockReturnValue({
          locator: vi.fn().mockReturnValue({
            screenshot: vi.fn().mockRejectedValue(new Error("Screenshot failed")),
          }),
        }),
      };

      const mockSession = {
        id: "failing-session",
        toolName: "greet",
        toolArguments: {},
        toolResult: {},
        widgetSessionId: "widget-456",
        protocol: "mcp" as const,
        page: mockSessionPage as never,
        consoleLogs: [],
        pageErrors: [],
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sessionManager as any).store.sessions.set("failing-session", mockSession);

      const tool = createScreenshotWidgetTool(manager);
      const result = await tool.handler({ sessionId: "failing-session" }, {} as never);

      expect(result.hasUI).toBe(true);
      expect(result.errors).toContain("Screenshot failed: Screenshot failed");
    });
  });
});
