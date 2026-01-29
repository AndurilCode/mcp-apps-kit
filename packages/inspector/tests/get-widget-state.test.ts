/**
 * Tests for get_widget_state tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConnectionManager } from "../src/connection";
import { createGetWidgetStateTool } from "../src/tools/get-widget-state";
import type { WidgetSession } from "../src/types";

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

// Helper to create mock page
function createMockPage(options: { openaiRuntime?: boolean; mcpRuntime?: boolean } = {}) {
  const mockLocator = {
    textContent: vi.fn().mockResolvedValue("Page content"),
  };
  const mockFrame = {
    locator: vi.fn().mockReturnValue(mockLocator),
    content: vi.fn().mockResolvedValue("<html><body>Test</body></html>"),
    url: vi.fn().mockReturnValue("http://localhost/widget/test"),
    evaluate: vi.fn().mockResolvedValue({
      type: options.openaiRuntime ? "openai" : options.mcpRuntime ? "mcp" : "unknown",
      stateChanges: [{ state: { count: 1 }, timestamp: Date.now() }],
      metadata: { key: "value" },
    }),
  };
  return {
    page: {
      isClosed: vi.fn().mockReturnValue(false),
      frame: vi.fn().mockReturnValue(mockFrame),
    },
    frame: mockFrame,
    locator: mockLocator,
  };
}

// Helper to create mock session
function createMockSession(
  id: string,
  page: ReturnType<typeof createMockPage>["page"],
  options: { withConsoleLogs?: boolean; withToolCalls?: boolean } = {}
): WidgetSession {
  return {
    id,
    toolName: "test-tool",
    toolArgs: { name: "test" },
    toolResult: { message: "Hello" },
    protocol: "mcp",
    widgetHtml: "<html><body>Test</body></html>",
    page: page as unknown as WidgetSession["page"],
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
    consoleLogs: options.withConsoleLogs
      ? [
          {
            level: "log" as const,
            text: "Test log",
            source: "widget" as const,
            timestamp: Date.now(),
          },
        ]
      : [],
    pageErrors: options.withConsoleLogs ? ["Test error"] : [],
    dialogs: [],
    toolCalls: options.withToolCalls
      ? [
          {
            name: "fetchData",
            args: { id: 1 },
            result: { data: "test" },
            isError: false,
            timestamp: Date.now(),
          },
        ]
      : [],
    source: "agent",
  };
}

describe("get_widget_state Tool", () => {
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
    if (manager) {
      await manager.disconnect();
    }
    vi.clearAllMocks();
  });

  describe("tool metadata", () => {
    it("should have correct description", () => {
      const tool = createGetWidgetStateTool(manager);
      expect(tool.description).toContain("comprehensive state");
      expect(tool.description).toContain("widget session");
    });

    it("should have input and output schemas defined", () => {
      const tool = createGetWidgetStateTool(manager);
      expect(tool.input).toBeDefined();
      expect(tool.output).toBeDefined();
    });
  });

  describe("session validation", () => {
    it("should return error when session not found", async () => {
      const tool = createGetWidgetStateTool(manager);
      const result = await tool.handler({ sessionId: "non-existent-id" }, {} as never);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Session not found: non-existent-id");
    });

    it("should return error with valid session ID format but no session", async () => {
      const tool = createGetWidgetStateTool(manager);
      const result = await tool.handler({ sessionId: "abc123-def456-ghi789" }, {} as never);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Session not found");
    });
  });

  describe("not connected", () => {
    it("should return error when not connected", async () => {
      const disconnectedManager = new ConnectionManager();
      const tool = createGetWidgetStateTool(disconnectedManager);

      // These tools check session first before checking connection
      const result = await tool.handler({ sessionId: "test-session" }, {} as never);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Session not found");
    });
  });

  describe("input schema", () => {
    it("should have sessionId field", () => {
      const tool = createGetWidgetStateTool(manager);
      expect(tool.input.shape).toHaveProperty("sessionId");
    });

    it("should have optional includeDOM field", () => {
      const tool = createGetWidgetStateTool(manager);
      expect(tool.input.shape).toHaveProperty("includeDOM");
    });
  });

  describe("output schema", () => {
    it("should have success field", () => {
      const tool = createGetWidgetStateTool(manager);
      expect(tool.output).toBeDefined();
      expect(tool.output!.shape).toHaveProperty("success");
    });

    it("should have state field", () => {
      const tool = createGetWidgetStateTool(manager);
      expect(tool.output!.shape).toHaveProperty("state");
    });

    it("should have error field", () => {
      const tool = createGetWidgetStateTool(manager);
      expect(tool.output!.shape).toHaveProperty("error");
    });
  });
});

describe("get_widget_state handler with mock session", () => {
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
    if (manager) {
      await manager.disconnect();
    }
    vi.clearAllMocks();
  });

  it("should return widget state when session exists", async () => {
    const mockPageObj = createMockPage();
    const session = createMockSession("test-session-state", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createGetWidgetStateTool(manager);
    const result = await tool.handler({ sessionId: "test-session-state" }, {} as never);

    expect(result.success).toBe(true);
    expect(result.state).toBeDefined();
    expect(result.state!.sessionId).toBe("test-session-state");
    expect(result.state!.toolName).toBe("test-tool");
    expect(result.state!.protocol).toBe("mcp");
  });

  it("should include DOM when includeDOM is true", async () => {
    const mockPageObj = createMockPage();
    const session = createMockSession("test-session-dom", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createGetWidgetStateTool(manager);
    const result = await tool.handler(
      { sessionId: "test-session-dom", includeDOM: true },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(result.state!.dom).toBeDefined();
    expect(result.state!.dom!.html).toContain("<html>");
  });

  it("should include console logs when present", async () => {
    const mockPageObj = createMockPage();
    const session = createMockSession("test-session-logs", mockPageObj.page, {
      withConsoleLogs: true,
    });

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createGetWidgetStateTool(manager);
    const result = await tool.handler({ sessionId: "test-session-logs" }, {} as never);

    expect(result.success).toBe(true);
    expect(result.state!.consoleLogs.length).toBeGreaterThan(0);
    expect(result.state!.pageErrors.length).toBeGreaterThan(0);
  });

  it("should include tool calls when present", async () => {
    const mockPageObj = createMockPage();
    const session = createMockSession("test-session-calls", mockPageObj.page, {
      withToolCalls: true,
    });

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createGetWidgetStateTool(manager);
    const result = await tool.handler({ sessionId: "test-session-calls" }, {} as never);

    expect(result.success).toBe(true);
    expect(result.state!.toolCalls.length).toBeGreaterThan(0);
  });

  it("should return error when page is closed", async () => {
    const mockPageObj = createMockPage();
    mockPageObj.page.isClosed.mockReturnValue(true);
    const session = createMockSession("test-session-closed", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createGetWidgetStateTool(manager);
    const result = await tool.handler({ sessionId: "test-session-closed" }, {} as never);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Page closed");
  });

  it("should handle runtime state extraction for OpenAI runtime", async () => {
    const mockPageObj = createMockPage({ openaiRuntime: true });
    const session = createMockSession("test-session-openai", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createGetWidgetStateTool(manager);
    const result = await tool.handler({ sessionId: "test-session-openai" }, {} as never);

    expect(result.success).toBe(true);
    // State changes should be extracted from runtime
    expect(result.state!.stateChanges.length).toBeGreaterThan(0);
  });

  it("should handle runtime state extraction for MCP runtime", async () => {
    const mockPageObj = createMockPage({ mcpRuntime: true });
    const session = createMockSession("test-session-mcp", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createGetWidgetStateTool(manager);
    const result = await tool.handler({ sessionId: "test-session-mcp" }, {} as never);

    expect(result.success).toBe(true);
    expect(result.state!.stateChanges.length).toBeGreaterThan(0);
  });

  it("should handle missing widget frame gracefully", async () => {
    const mockPageObj = createMockPage();
    mockPageObj.page.frame.mockReturnValue(null);
    const session = createMockSession("test-session-noframe", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createGetWidgetStateTool(manager);
    const result = await tool.handler({ sessionId: "test-session-noframe" }, {} as never);

    // Should still succeed but without DOM/runtime state
    expect(result.success).toBe(true);
    expect(result.state!.stateChanges).toEqual([]);
  });
});

describe("get_widget_state schemas", () => {
  describe("getWidgetStateInputSchema", () => {
    it("should export input schema", async () => {
      const { getWidgetStateInputSchema } = await import("../src/tools/get-widget-state");
      expect(getWidgetStateInputSchema).toBeDefined();
    });

    it("should validate input with sessionId", async () => {
      const { getWidgetStateInputSchema } = await import("../src/tools/get-widget-state");
      const result = getWidgetStateInputSchema.safeParse({
        sessionId: "test-session",
      });
      expect(result.success).toBe(true);
    });

    it("should validate input with includeDOM", async () => {
      const { getWidgetStateInputSchema } = await import("../src/tools/get-widget-state");
      const result = getWidgetStateInputSchema.safeParse({
        sessionId: "test-session",
        includeDOM: true,
      });
      expect(result.success).toBe(true);
    });

    it("should reject input without sessionId", async () => {
      const { getWidgetStateInputSchema } = await import("../src/tools/get-widget-state");
      const result = getWidgetStateInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should reject non-string sessionId", async () => {
      const { getWidgetStateInputSchema } = await import("../src/tools/get-widget-state");
      const result = getWidgetStateInputSchema.safeParse({
        sessionId: 12345,
      });
      expect(result.success).toBe(false);
    });

    it("should reject non-boolean includeDOM", async () => {
      const { getWidgetStateInputSchema } = await import("../src/tools/get-widget-state");
      const result = getWidgetStateInputSchema.safeParse({
        sessionId: "test",
        includeDOM: "yes",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("getWidgetStateOutputSchema", () => {
    it("should export output schema", async () => {
      const { getWidgetStateOutputSchema } = await import("../src/tools/get-widget-state");
      expect(getWidgetStateOutputSchema).toBeDefined();
    });

    it("should validate success response with state", async () => {
      const { getWidgetStateOutputSchema } = await import("../src/tools/get-widget-state");
      const result = getWidgetStateOutputSchema.safeParse({
        success: true,
        state: {
          sessionId: "test-session-123",
          toolName: "greet",
          protocol: "mcp",
          globals: {
            theme: "light",
            locale: "en-US",
            timeZone: "America/New_York",
            displayMode: "inline",
            viewport: { width: 800, height: 600 },
            safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
            userAgent: {},
          },
          toolInput: { name: "Alice" },
          toolOutput: { message: "Hello, Alice!" },
          toolCalls: [],
          stateChanges: [],
          consoleLogs: [],
          pageErrors: [],
          dialogs: [],
          createdAt: Date.now(),
          source: "apps",
        },
      });
      expect(result.success).toBe(true);
    });

    it("should validate success response with DOM", async () => {
      const { getWidgetStateOutputSchema } = await import("../src/tools/get-widget-state");
      const result = getWidgetStateOutputSchema.safeParse({
        success: true,
        state: {
          sessionId: "test-session",
          toolName: "greet",
          protocol: "openai",
          globals: {
            theme: "dark",
            locale: "en-GB",
            timeZone: "Europe/London",
            displayMode: "fullscreen",
            viewport: { width: 1920, height: 1080 },
            safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
            userAgent: {
              device: { type: "desktop" },
              capabilities: { hover: true, touch: false },
            },
          },
          toolInput: {},
          toolOutput: {},
          toolCalls: [],
          stateChanges: [],
          dom: {
            html: "<html><body>Hello</body></html>",
            textContent: "Hello",
          },
          consoleLogs: [],
          pageErrors: [],
          dialogs: [],
          createdAt: Date.now(),
          source: "agent",
        },
      });
      expect(result.success).toBe(true);
    });

    it("should validate error response", async () => {
      const { getWidgetStateOutputSchema } = await import("../src/tools/get-widget-state");
      const result = getWidgetStateOutputSchema.safeParse({
        success: false,
        error: "Session not found: non-existent-id",
      });
      expect(result.success).toBe(true);
    });

    it("should validate response with console logs", async () => {
      const { getWidgetStateOutputSchema } = await import("../src/tools/get-widget-state");
      const result = getWidgetStateOutputSchema.safeParse({
        success: true,
        state: {
          sessionId: "test",
          toolName: "greet",
          protocol: "mcp",
          globals: {
            theme: "light",
            locale: "en-US",
            timeZone: "UTC",
            displayMode: "inline",
            viewport: { width: 800, height: 600 },
            safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
            userAgent: {},
          },
          toolInput: {},
          toolOutput: {},
          toolCalls: [],
          stateChanges: [],
          consoleLogs: [
            {
              level: "log",
              text: "Widget loaded",
              source: "widget",
              timestamp: Date.now(),
            },
            {
              level: "error",
              text: "Failed to fetch data",
              source: "widget",
              timestamp: Date.now(),
              url: "http://localhost/widget/123",
              lineNumber: 42,
            },
          ],
          pageErrors: ["Uncaught TypeError: Cannot read property 'foo' of undefined"],
          dialogs: [
            {
              type: "alert",
              message: "Hello!",
              handled: "accepted",
              timestamp: Date.now(),
            },
          ],
          createdAt: Date.now(),
          source: "apps",
        },
      });
      expect(result.success).toBe(true);
    });

    it("should validate response with tool calls", async () => {
      const { getWidgetStateOutputSchema } = await import("../src/tools/get-widget-state");
      const result = getWidgetStateOutputSchema.safeParse({
        success: true,
        state: {
          sessionId: "test",
          toolName: "greet",
          protocol: "mcp",
          globals: {
            theme: "light",
            locale: "en-US",
            timeZone: "UTC",
            displayMode: "inline",
            viewport: { width: 800, height: 600 },
            safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
            userAgent: {},
          },
          toolInput: {},
          toolOutput: {},
          toolCalls: [
            {
              name: "fetchData",
              args: { query: "test" },
              result: { data: [1, 2, 3] },
              isError: false,
              timestamp: Date.now(),
            },
            {
              name: "saveData",
              args: { items: [] },
              isError: true,
              timestamp: Date.now(),
            },
          ],
          stateChanges: [
            { state: { count: 0 }, timestamp: Date.now() },
            { state: { count: 1 }, timestamp: Date.now() },
          ],
          consoleLogs: [],
          pageErrors: [],
          dialogs: [],
          createdAt: Date.now(),
          source: "apps",
        },
      });
      expect(result.success).toBe(true);
    });

    it("should validate response with proxy metadata", async () => {
      const { getWidgetStateOutputSchema } = await import("../src/tools/get-widget-state");
      const result = getWidgetStateOutputSchema.safeParse({
        success: true,
        state: {
          sessionId: "test",
          toolName: "greet",
          protocol: "mcp",
          globals: {
            theme: "light",
            locale: "en-US",
            timeZone: "UTC",
            displayMode: "inline",
            viewport: { width: 800, height: 600 },
            safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
            userAgent: {},
          },
          toolInput: {},
          toolOutput: {},
          toolCalls: [],
          stateChanges: [],
          consoleLogs: [],
          pageErrors: [],
          dialogs: [],
          createdAt: Date.now(),
          source: "apps",
          proxyMetadata: {
            targetServerUrl: "http://localhost:3001/mcp",
            targetToolName: "original_greet",
          },
        },
      });
      expect(result.success).toBe(true);
    });
  });
});
