/**
 * Tests for widget_query tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConnectionManager } from "../src/connection";
import { createWidgetQueryTool } from "../src/tools/widget-query";
import type { WidgetSession } from "../src/types";
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

// Helper to create mock locator with configurable count
function createMockLocator(count = 1) {
  const locator = {
    count: vi.fn().mockResolvedValue(count),
    nth: vi.fn().mockReturnThis(),
    first: vi.fn().mockReturnThis(),
    evaluate: vi.fn().mockResolvedValue("button"),
    all: vi.fn().mockResolvedValue([]),
    textContent: vi.fn().mockResolvedValue("Click Me"),
    inputValue: vi.fn().mockRejectedValue(new Error("not input")),
    isVisible: vi.fn().mockResolvedValue(true),
    isEnabled: vi.fn().mockResolvedValue(true),
    boundingBox: vi.fn().mockResolvedValue({ x: 100, y: 200, width: 80, height: 40 }),
    getAttribute: vi.fn().mockResolvedValue(null),
  };
  return locator;
}

// Helper to create mock page
function createMockPage(locator = createMockLocator()) {
  const mockFrame = {
    locator: vi.fn().mockReturnValue(locator),
    getByText: vi.fn().mockReturnValue(locator),
    getByRole: vi.fn().mockReturnValue(locator),
    getByLabel: vi.fn().mockReturnValue(locator),
    getByPlaceholder: vi.fn().mockReturnValue(locator),
    getByTestId: vi.fn().mockReturnValue(locator),
    url: vi.fn().mockReturnValue("http://localhost/widget/test"),
  };
  return {
    page: {
      isClosed: vi.fn().mockReturnValue(false),
      frame: vi.fn().mockReturnValue(mockFrame),
    },
    frame: mockFrame,
    locator,
  };
}

// Helper to create mock session
function createMockSession(
  id: string,
  page: ReturnType<typeof createMockPage>["page"]
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
    consoleLogs: [],
    pageErrors: [],
    dialogs: [],
    toolCalls: [],
    source: "agent",
  };
}

describe("widget_query Tool", () => {
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
      const tool = createWidgetQueryTool(createMockRegistry(manager));
      expect(tool.description).toContain("Query elements");
      expect(tool.description).toContain("semantic locators");
    });

    it("should have input and output schemas defined", () => {
      const tool = createWidgetQueryTool(createMockRegistry(manager));
      expect(tool.input).toBeDefined();
      expect(tool.output).toBeDefined();
    });
  });

  describe("session validation", () => {
    it("should return error when session not found", async () => {
      const tool = createWidgetQueryTool(createMockRegistry(manager));
      const result = await tool.handler(
        { sessionId: "non-existent-id", text: "Click me" },
        {} as never
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Session not found: non-existent-id");
      expect(result.hints?.next).toContain("Create a new session");
    });
  });

  describe("locator validation", () => {
    it("should return error when no locator is provided", async () => {
      const tool = createWidgetQueryTool(createMockRegistry(manager));
      // First need a valid session - but since we can't create one easily,
      // we'll test the schema validation instead
      const result = await tool.handler({ sessionId: "test-session" }, {} as never);

      // Since session doesn't exist, we get session error first
      // But the locator validation happens after session validation
      expect(result.success).toBe(false);
    });
  });

  describe("not connected", () => {
    it("should return error when not connected", async () => {
      const disconnectedManager = new ConnectionManager();
      const tool = createWidgetQueryTool(createMockRegistry(disconnectedManager));

      // These tools check session first before checking connection
      const result = await tool.handler(
        { sessionId: "test-session", text: "Click me" },
        {} as never
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Session not found");
    });
  });

  describe("input schema validation", () => {
    it("should accept text locator", () => {
      const tool = createWidgetQueryTool(createMockRegistry(manager));
      expect(tool.input.shape).toHaveProperty("text");
    });

    it("should accept selector locator", () => {
      const tool = createWidgetQueryTool(createMockRegistry(manager));
      expect(tool.input.shape).toHaveProperty("selector");
    });

    it("should accept role locator", () => {
      const tool = createWidgetQueryTool(createMockRegistry(manager));
      expect(tool.input.shape).toHaveProperty("role");
    });

    it("should accept name parameter for role locator", () => {
      const tool = createWidgetQueryTool(createMockRegistry(manager));
      expect(tool.input.shape).toHaveProperty("name");
    });

    it("should accept label locator", () => {
      const tool = createWidgetQueryTool(createMockRegistry(manager));
      expect(tool.input.shape).toHaveProperty("label");
    });

    it("should accept placeholder locator", () => {
      const tool = createWidgetQueryTool(createMockRegistry(manager));
      expect(tool.input.shape).toHaveProperty("placeholder");
    });

    it("should accept testId locator", () => {
      const tool = createWidgetQueryTool(createMockRegistry(manager));
      expect(tool.input.shape).toHaveProperty("testId");
    });

    it("should accept exact matching option", () => {
      const tool = createWidgetQueryTool(createMockRegistry(manager));
      expect(tool.input.shape).toHaveProperty("exact");
    });

    it("should accept nth option", () => {
      const tool = createWidgetQueryTool(createMockRegistry(manager));
      expect(tool.input.shape).toHaveProperty("nth");
    });

    it("should accept maxResults option", () => {
      const tool = createWidgetQueryTool(createMockRegistry(manager));
      expect(tool.input.shape).toHaveProperty("maxResults");
    });

    it("should accept timeout option", () => {
      const tool = createWidgetQueryTool(createMockRegistry(manager));
      expect(tool.input.shape).toHaveProperty("timeout");
    });
  });

  describe("output schema validation", () => {
    it("should have success field", () => {
      const tool = createWidgetQueryTool(createMockRegistry(manager));
      expect(tool.output).toBeDefined();
      expect(tool.output!.shape).toHaveProperty("success");
    });

    it("should have count field", () => {
      const tool = createWidgetQueryTool(createMockRegistry(manager));
      expect(tool.output!.shape).toHaveProperty("count");
    });

    it("should have elements field", () => {
      const tool = createWidgetQueryTool(createMockRegistry(manager));
      expect(tool.output!.shape).toHaveProperty("elements");
    });

    it("should have locatorStrategy field", () => {
      const tool = createWidgetQueryTool(createMockRegistry(manager));
      expect(tool.output!.shape).toHaveProperty("locatorStrategy");
    });

    it("should have error field", () => {
      const tool = createWidgetQueryTool(createMockRegistry(manager));
      expect(tool.output!.shape).toHaveProperty("error");
    });

    it("should have hints field", () => {
      const tool = createWidgetQueryTool(createMockRegistry(manager));
      expect(tool.output!.shape).toHaveProperty("hints");
    });
  });
});

describe("widget_query handler with mock session", () => {
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

  it("should query elements by text", async () => {
    const mockPageObj = createMockPage();
    const session = createMockSession("test-session-text", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetQueryTool(createMockRegistry(manager));
    const result = await tool.handler(
      { sessionId: "test-session-text", text: "Click Me" },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.elements).toBeDefined();
    expect(mockPageObj.frame.getByText).toHaveBeenCalledWith("Click Me", expect.any(Object));
  });

  it("should query elements by role", async () => {
    const mockPageObj = createMockPage();
    const session = createMockSession("test-session-role", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetQueryTool(createMockRegistry(manager));
    const result = await tool.handler(
      { sessionId: "test-session-role", role: "button" },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(mockPageObj.frame.getByRole).toHaveBeenCalled();
  });

  it("should query elements by CSS selector", async () => {
    const mockPageObj = createMockPage();
    const session = createMockSession("test-session-selector", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetQueryTool(createMockRegistry(manager));
    const result = await tool.handler(
      { sessionId: "test-session-selector", selector: "#my-button" },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(mockPageObj.frame.locator).toHaveBeenCalledWith("#my-button");
  });

  it("should query elements by label", async () => {
    const mockPageObj = createMockPage();
    const session = createMockSession("test-session-label", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetQueryTool(createMockRegistry(manager));
    const result = await tool.handler(
      { sessionId: "test-session-label", label: "Email" },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(mockPageObj.frame.getByLabel).toHaveBeenCalledWith("Email", expect.any(Object));
  });

  it("should query elements by placeholder", async () => {
    const mockPageObj = createMockPage();
    const session = createMockSession("test-session-placeholder", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetQueryTool(createMockRegistry(manager));
    const result = await tool.handler(
      { sessionId: "test-session-placeholder", placeholder: "Enter email" },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(mockPageObj.frame.getByPlaceholder).toHaveBeenCalledWith(
      "Enter email",
      expect.any(Object)
    );
  });

  it("should query elements by testId", async () => {
    const mockPageObj = createMockPage();
    const session = createMockSession("test-session-testid", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetQueryTool(createMockRegistry(manager));
    const result = await tool.handler(
      { sessionId: "test-session-testid", testId: "submit-btn" },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(mockPageObj.frame.getByTestId).toHaveBeenCalledWith("submit-btn");
  });

  it("should return error when no locator specified", async () => {
    const mockPageObj = createMockPage();
    const session = createMockSession("test-session-no-loc", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetQueryTool(createMockRegistry(manager));
    const result = await tool.handler({ sessionId: "test-session-no-loc" }, {} as never);

    expect(result.success).toBe(false);
    expect(result.error).toContain("No locator specified");
  });

  it("should return error when page is closed", async () => {
    const mockPageObj = createMockPage();
    mockPageObj.page.isClosed.mockReturnValue(true);
    const session = createMockSession("test-session-closed", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetQueryTool(createMockRegistry(manager));
    const result = await tool.handler(
      { sessionId: "test-session-closed", text: "test" },
      {} as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Page closed");
  });

  it("should handle multiple matching elements", async () => {
    const mockLocator = createMockLocator(3);
    const mockPageObj = createMockPage(mockLocator);
    const session = createMockSession("test-session-multi", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetQueryTool(createMockRegistry(manager));
    const result = await tool.handler(
      { sessionId: "test-session-multi", role: "button", maxResults: 3 },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(result.count).toBe(3);
  });

  it("should respect maxResults limit", async () => {
    const mockLocator = createMockLocator(10);
    const mockPageObj = createMockPage(mockLocator);
    const session = createMockSession("test-session-limit", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetQueryTool(createMockRegistry(manager));
    const result = await tool.handler(
      { sessionId: "test-session-limit", role: "button", maxResults: 5 },
      {} as never
    );

    expect(result.success).toBe(true);
    // The count should be total matches, but elements array respects maxResults
    expect(result.count).toBe(10);
  });
});

describe("widget_query schemas", () => {
  describe("widgetQueryInputSchema", () => {
    it("should export input schema", async () => {
      const { widgetQueryInputSchema } = await import("../src/tools/widget-query");
      expect(widgetQueryInputSchema).toBeDefined();
    });

    it("should validate input with text locator", async () => {
      const { widgetQueryInputSchema } = await import("../src/tools/widget-query");
      const result = widgetQueryInputSchema.safeParse({
        sessionId: "test-session",
        text: "Click me",
      });
      expect(result.success).toBe(true);
    });

    it("should validate input with selector locator", async () => {
      const { widgetQueryInputSchema } = await import("../src/tools/widget-query");
      const result = widgetQueryInputSchema.safeParse({
        sessionId: "test-session",
        selector: "#submit-button",
      });
      expect(result.success).toBe(true);
    });

    it("should validate input with role and name locators", async () => {
      const { widgetQueryInputSchema } = await import("../src/tools/widget-query");
      const result = widgetQueryInputSchema.safeParse({
        sessionId: "test-session",
        role: "button",
        name: "Submit",
      });
      expect(result.success).toBe(true);
    });

    it("should validate input with label locator", async () => {
      const { widgetQueryInputSchema } = await import("../src/tools/widget-query");
      const result = widgetQueryInputSchema.safeParse({
        sessionId: "test-session",
        label: "Email Address",
      });
      expect(result.success).toBe(true);
    });

    it("should validate input with placeholder locator", async () => {
      const { widgetQueryInputSchema } = await import("../src/tools/widget-query");
      const result = widgetQueryInputSchema.safeParse({
        sessionId: "test-session",
        placeholder: "Enter your email",
      });
      expect(result.success).toBe(true);
    });

    it("should validate input with testId locator", async () => {
      const { widgetQueryInputSchema } = await import("../src/tools/widget-query");
      const result = widgetQueryInputSchema.safeParse({
        sessionId: "test-session",
        testId: "submit-btn",
      });
      expect(result.success).toBe(true);
    });

    it("should validate input with all options", async () => {
      const { widgetQueryInputSchema } = await import("../src/tools/widget-query");
      const result = widgetQueryInputSchema.safeParse({
        sessionId: "test-session",
        text: "Click me",
        exact: true,
        nth: 0,
        maxResults: 5,
        timeout: 10000,
      });
      expect(result.success).toBe(true);
    });

    it("should reject input without sessionId", async () => {
      const { widgetQueryInputSchema } = await import("../src/tools/widget-query");
      const result = widgetQueryInputSchema.safeParse({
        text: "Click me",
      });
      expect(result.success).toBe(false);
    });

    it("should reject non-string text", async () => {
      const { widgetQueryInputSchema } = await import("../src/tools/widget-query");
      const result = widgetQueryInputSchema.safeParse({
        sessionId: "test",
        text: 123,
      });
      expect(result.success).toBe(false);
    });

    it("should reject non-boolean exact", async () => {
      const { widgetQueryInputSchema } = await import("../src/tools/widget-query");
      const result = widgetQueryInputSchema.safeParse({
        sessionId: "test",
        text: "Click",
        exact: "true",
      });
      expect(result.success).toBe(false);
    });

    it("should reject non-number nth", async () => {
      const { widgetQueryInputSchema } = await import("../src/tools/widget-query");
      const result = widgetQueryInputSchema.safeParse({
        sessionId: "test",
        text: "Click",
        nth: "first",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("widgetQueryOutputSchema", () => {
    it("should export output schema", async () => {
      const { widgetQueryOutputSchema } = await import("../src/tools/widget-query");
      expect(widgetQueryOutputSchema).toBeDefined();
    });

    it("should validate success response with elements", async () => {
      const { widgetQueryOutputSchema } = await import("../src/tools/widget-query");
      const result = widgetQueryOutputSchema.safeParse({
        success: true,
        count: 2,
        elements: [
          {
            index: 0,
            tagName: "BUTTON",
            role: "button",
            name: "Submit",
            textContent: "Submit",
            isVisible: true,
            isEnabled: true,
          },
          {
            index: 1,
            tagName: "BUTTON",
            role: "button",
            name: "Cancel",
            textContent: "Cancel",
            isVisible: true,
            isEnabled: true,
          },
        ],
        locatorStrategy: "getByText('Submit')",
      });
      expect(result.success).toBe(true);
    });

    it("should validate success response with bounding box", async () => {
      const { widgetQueryOutputSchema } = await import("../src/tools/widget-query");
      const result = widgetQueryOutputSchema.safeParse({
        success: true,
        count: 1,
        elements: [
          {
            index: 0,
            tagName: "BUTTON",
            textContent: "Click",
            isVisible: true,
            isEnabled: true,
            boundingBox: { x: 100, y: 200, width: 80, height: 40 },
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("should validate error response", async () => {
      const { widgetQueryOutputSchema } = await import("../src/tools/widget-query");
      const result = widgetQueryOutputSchema.safeParse({
        success: false,
        error: "No locator specified",
        hints: { next: "Provide a text, selector, role, label, placeholder, or testId" },
      });
      expect(result.success).toBe(true);
    });

    it("should validate empty elements response", async () => {
      const { widgetQueryOutputSchema } = await import("../src/tools/widget-query");
      const result = widgetQueryOutputSchema.safeParse({
        success: true,
        count: 0,
        elements: [],
        locatorStrategy: "getByText('NonExistent')",
      });
      expect(result.success).toBe(true);
    });
  });
});

// =============================================================================
// Additional handler tests for branch coverage
// =============================================================================

describe("widget_query handler - branch coverage", () => {
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

  it("should query by role with name (regex branch)", async () => {
    const mockLocator = createMockLocator(1);
    const mockPageObj = createMockPage(mockLocator);
    const session = createMockSession("test-role-name", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetQueryTool(createMockRegistry(manager));
    const result = await tool.handler(
      { sessionId: "test-role-name", role: "button", name: "Submit" },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(mockPageObj.frame.getByRole).toHaveBeenCalled();
  });

  it("should query by role with name and exact matching", async () => {
    const mockLocator = createMockLocator(1);
    const mockPageObj = createMockPage(mockLocator);
    const session = createMockSession("test-role-exact", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetQueryTool(createMockRegistry(manager));
    const result = await tool.handler(
      { sessionId: "test-role-exact", role: "button", name: "Submit", exact: true },
      {} as never
    );

    expect(result.success).toBe(true);
  });

  it("should query by nth valid index", async () => {
    const mockLocator = createMockLocator(3);
    mockLocator.getAttribute = vi.fn().mockImplementation((attr: string) => {
      if (attr === "id") return Promise.resolve("btn-1");
      if (attr === "class") return Promise.resolve("primary");
      return Promise.resolve(null);
    });

    const mockPageObj = createMockPage(mockLocator);
    const session = createMockSession("test-nth-valid", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetQueryTool(createMockRegistry(manager));
    const result = await tool.handler(
      { sessionId: "test-nth-valid", text: "Button", nth: 1 },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.elements).toHaveLength(1);
    expect(result.elements![0].index).toBe(1);
  });

  it("should return error for nth out of range", async () => {
    const mockLocator = createMockLocator(2);
    const mockPageObj = createMockPage(mockLocator);
    const session = createMockSession("test-nth-invalid", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetQueryTool(createMockRegistry(manager));
    const result = await tool.handler(
      { sessionId: "test-nth-invalid", text: "Button", nth: 5 },
      {} as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("out of range");
  });

  it("should handle element extraction error at nth index", async () => {
    const mockLocator = createMockLocator(3);
    mockLocator.evaluate = vi.fn().mockRejectedValue(new Error("Element detached"));
    const mockPageObj = createMockPage(mockLocator);
    const session = createMockSession("test-nth-error", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetQueryTool(createMockRegistry(manager));
    const result = await tool.handler(
      { sessionId: "test-nth-error", text: "Button", nth: 0 },
      {} as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to extract element");
  });

  it("should show warning for more than 5 matches", async () => {
    const mockLocator = createMockLocator(8);
    mockLocator.boundingBox = vi.fn().mockResolvedValue(null);

    const mockPageObj = createMockPage(mockLocator);
    const session = createMockSession("test-many-matches", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetQueryTool(createMockRegistry(manager));
    const result = await tool.handler(
      { sessionId: "test-many-matches", role: "button" },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(result.count).toBe(8);
    expect(result.hints?.warning).toContain("Multiple matches");
  });

  it("should show hint for zero matches", async () => {
    const mockLocator = createMockLocator(0);
    const mockPageObj = createMockPage(mockLocator);
    const session = createMockSession("test-zero-matches", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetQueryTool(createMockRegistry(manager));
    const result = await tool.handler(
      { sessionId: "test-zero-matches", text: "NonExistent" },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
    expect(result.hints?.next).toContain("No elements match");
  });

  it("should handle single match hint without warning", async () => {
    const mockLocator = createMockLocator(1);
    mockLocator.boundingBox = vi.fn().mockResolvedValue(null);

    const mockPageObj = createMockPage(mockLocator);
    const session = createMockSession("test-single-match", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetQueryTool(createMockRegistry(manager));
    const result = await tool.handler(
      { sessionId: "test-single-match", text: "Submit" },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.hints?.next).toContain("widget_click");
    expect(result.hints?.warning).toBeUndefined();
  });

  it("should handle widget iframe not found", async () => {
    const mockPageObj = createMockPage();
    mockPageObj.page.frame.mockReturnValue(null);
    const session = createMockSession("test-q-noframe", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetQueryTool(createMockRegistry(manager));
    const result = await tool.handler({ sessionId: "test-q-noframe", text: "Submit" }, {} as never);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Widget iframe not found");
  });

  it("should handle error during element iteration", async () => {
    const mockLocator = createMockLocator(2);
    mockLocator.boundingBox = vi.fn().mockResolvedValue(null);
    // First call succeeds, second call throws
    let callCount = 0;
    mockLocator.evaluate = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount > 1) throw new Error("Detached");
      return "button";
    });

    const mockPageObj = createMockPage(mockLocator);
    const session = createMockSession("test-iter-error", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetQueryTool(createMockRegistry(manager));
    const result = await tool.handler(
      { sessionId: "test-iter-error", role: "button" },
      {} as never
    );

    // Should still succeed, just skip errored elements
    expect(result.success).toBe(true);
  });

  it("should handle catch in main handler", async () => {
    const mockLocator = createMockLocator(1);
    mockLocator.count = vi.fn().mockRejectedValue(new Error("Frame detached"));
    const mockPageObj = createMockPage(mockLocator);
    const session = createMockSession("test-main-error", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetQueryTool(createMockRegistry(manager));
    const result = await tool.handler(
      { sessionId: "test-main-error", text: "Submit" },
      {} as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Frame detached");
    expect(result.hints?.next).toContain("different locator strategy");
  });

  it("should return multiple matches hint for count between 2-5", async () => {
    const mockLocator = createMockLocator(3);
    mockLocator.boundingBox = vi.fn().mockResolvedValue(null);

    const mockPageObj = createMockPage(mockLocator);
    const session = createMockSession("test-multi-hint", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetQueryTool(createMockRegistry(manager));
    const result = await tool.handler(
      { sessionId: "test-multi-hint", role: "button" },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(result.count).toBe(3);
    expect(result.hints?.next).toContain("Found 3 matches");
    // No warning for <= 5 matches
    expect(result.hints?.warning).toBeUndefined();
  });
});
