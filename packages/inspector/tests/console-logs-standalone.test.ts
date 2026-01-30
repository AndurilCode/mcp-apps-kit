/**
 * Tests for get_console_logs tool standalone mode paths
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConnectionManager } from "../src/connection";
import { createGetConsoleLogsTool } from "../src/tools/get-console-logs";
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
const mockPage = {
  on: vi.fn(),
  reload: vi.fn().mockResolvedValue(undefined),
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

describe("get_console_logs Standalone Mode", () => {
  let manager: ConnectionManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    manager = new ConnectionManager();

    mockListTools.mockResolvedValue([{ name: "greet" }]);
    mockListResources.mockResolvedValue([]);
    mockListPrompts.mockResolvedValue([]);

    // Reset mock page handlers
    mockPage.on.mockClear();
    mockPage.reload.mockClear();
    mockPage.waitForTimeout.mockClear();
    mockPage.close.mockClear();

    // Default successful render
    mockRenderInBrowser.mockResolvedValue({
      page: mockPage,
      errors: [],
    });

    await manager.connect("http://localhost:3000/mcp");
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

  describe("successful console capture", () => {
    it("should capture console logs in standalone mode", async () => {
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

      const tool = createGetConsoleLogsTool(createMockRegistry(manager));
      const result = await tool.handler(
        { tool: "greet", arguments: { name: "Alice" } },
        {} as never
      );

      expect(result.hasUI).toBe(true);
      expect(result.protocol).toBe("mcp");
      expect(result.logs).toBeDefined();
      expect(result.summary).toBeDefined();
    });

    it("should set up console and pageerror listeners", async () => {
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

      const tool = createGetConsoleLogsTool(createMockRegistry(manager));
      await tool.handler({ tool: "greet", arguments: {} }, {} as never);

      // Verify listeners were set up
      const onCalls = mockPage.on.mock.calls;
      const consoleCall = onCalls.find((call: unknown[]) => call[0] === "console");
      const pageerrorCall = onCalls.find((call: unknown[]) => call[0] === "pageerror");

      expect(consoleCall).toBeDefined();
      expect(pageerrorCall).toBeDefined();
    });

    it("should reload page and wait for logs", async () => {
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

      const tool = createGetConsoleLogsTool(createMockRegistry(manager));
      await tool.handler({ tool: "greet", arguments: {}, waitMs: 1000 }, {} as never);

      expect(mockPage.reload).toHaveBeenCalledWith({ waitUntil: "networkidle" });
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(1000);
      expect(mockPage.close).toHaveBeenCalled();
    });

    it("should use default waitMs of 500", async () => {
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

      const tool = createGetConsoleLogsTool(createMockRegistry(manager));
      await tool.handler({ tool: "greet", arguments: {} }, {} as never);

      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(500);
    });
  });

  describe("resource validation errors", () => {
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
    });

    it("should return error when no UI resource found", async () => {
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

      const tool = createGetConsoleLogsTool(createMockRegistry(manager));
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

      const tool = createGetConsoleLogsTool(createMockRegistry(manager));
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

      const tool = createGetConsoleLogsTool(createMockRegistry(manager));
      const result = await tool.handler({ tool: "greet", arguments: {} }, {} as never);

      expect(result.hasUI).toBe(true);
      expect(result.errors).toContain("Console capture failed: Render failed");
    });
  });

  describe("session mode", () => {
    it("should return logs from existing session", async () => {
      // Create a session in the manager
      const sessionManager = manager.getWidgetSessionManager();

      // Manually add a session with logs
      const mockSession = {
        id: "test-session-id",
        toolName: "greet",
        toolArguments: { name: "Alice" },
        toolResult: { message: "Hello" },
        widgetSessionId: "widget-123",
        protocol: "mcp" as const,
        page: {} as never,
        consoleLogs: [
          {
            level: "log" as const,
            text: "Test log",
            source: "widget" as const,
            timestamp: Date.now(),
          },
          {
            level: "error" as const,
            text: "Test error",
            source: "widget" as const,
            timestamp: Date.now(),
          },
        ],
        pageErrors: ["Uncaught error"],
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      };

      // Access private sessions map through store reflection
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sessionManager as any).store.sessions.set("test-session-id", mockSession);

      const tool = createGetConsoleLogsTool(createMockRegistry(manager));
      const result = await tool.handler({ sessionId: "test-session-id" }, {} as never);

      expect(result.hasUI).toBe(true);
      expect(result.logs).toHaveLength(2);
      expect(result.pageErrors).toContain("Uncaught error");
      expect(result.summary.total).toBe(2);
      expect(result.summary.log).toBe(1);
      expect(result.summary.error).toBe(1);
    });
  });
});
