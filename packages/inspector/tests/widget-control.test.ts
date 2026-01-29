/**
 * Tests for widget_control tools (click, fill, drag, evaluate, etc.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConnectionManager } from "../src/connection";
import {
  createWidgetClickTool,
  createWidgetFillTool,
  createWidgetDragTool,
  createWidgetEvaluateTool,
  createWidgetLocatorTool,
  createWidgetRefreshTool,
  createWidgetWaitForSelectorTool,
} from "../src/tools/widget-control";
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

// Helper to create mock locator
function createMockLocator(options: { count?: number; tagName?: string } = {}) {
  const count = options.count ?? 1;
  const tagName = options.tagName ?? "BUTTON";
  const mockLocator = {
    count: vi.fn().mockResolvedValue(count),
    first: vi.fn().mockReturnThis(),
    nth: vi.fn().mockImplementation(() => mockLocator),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    type: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(tagName.toLowerCase()),
    boundingBox: vi.fn().mockResolvedValue({ x: 100, y: 200, width: 80, height: 40 }),
    waitFor: vi.fn().mockResolvedValue(undefined),
    dragTo: vi.fn().mockResolvedValue(undefined),
    isEnabled: vi.fn().mockResolvedValue(true),
    isVisible: vi.fn().mockResolvedValue(true),
    textContent: vi.fn().mockResolvedValue("Button text"),
    getAttribute: vi.fn().mockResolvedValue(null),
    selectOption: vi.fn().mockResolvedValue(undefined),
    pressSequentially: vi.fn().mockResolvedValue(undefined),
    press: vi.fn().mockResolvedValue(undefined),
    inputValue: vi.fn().mockRejectedValue(new Error("not input")),
  };
  return mockLocator;
}

// Helper to create mock page
function createMockPage(locator = createMockLocator()) {
  const mockFrameElement = {
    boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 800, height: 600 }),
  };
  const mockFrame = {
    locator: vi.fn().mockReturnValue(locator),
    getByText: vi.fn().mockReturnValue(locator),
    getByRole: vi.fn().mockReturnValue(locator),
    getByLabel: vi.fn().mockReturnValue(locator),
    getByPlaceholder: vi.fn().mockReturnValue(locator),
    getByTestId: vi.fn().mockReturnValue(locator),
    url: vi.fn().mockReturnValue("http://localhost/widget/test"),
    evaluate: vi.fn().mockResolvedValue({ result: "evaluated" }),
    content: vi.fn().mockResolvedValue("<html><body>Test</body></html>"),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    frameElement: vi.fn().mockResolvedValue(mockFrameElement),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
  };
  return {
    page: {
      isClosed: vi.fn().mockReturnValue(false),
      frame: vi.fn().mockReturnValue(mockFrame),
      mouse: {
        move: vi.fn().mockResolvedValue(undefined),
        down: vi.fn().mockResolvedValue(undefined),
        up: vi.fn().mockResolvedValue(undefined),
      },
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(undefined),
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

describe("widget_click Tool", () => {
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
      const tool = createWidgetClickTool(manager);
      expect(tool.description).toContain("click");
    });

    it("should have input and output schemas", () => {
      const tool = createWidgetClickTool(manager);
      expect(tool.input).toBeDefined();
      expect(tool.output).toBeDefined();
    });
  });

  describe("session validation", () => {
    it("should return error when session not found", async () => {
      const tool = createWidgetClickTool(manager);
      const result = await tool.handler(
        { sessionId: "non-existent-id", text: "Click me" },
        {} as never
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Session not found: non-existent-id");
    });
  });

  describe("not connected", () => {
    it("should return error when not connected", async () => {
      const disconnectedManager = new ConnectionManager();
      const tool = createWidgetClickTool(disconnectedManager);

      // These tools check session first before checking connection
      const result = await tool.handler({ sessionId: "test", text: "Click" }, {} as never);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Session not found");
    });
  });

  describe("input schema", () => {
    it("should have sessionId field", () => {
      const tool = createWidgetClickTool(manager);
      expect(tool.input.shape).toHaveProperty("sessionId");
    });

    it("should have locator fields", () => {
      const tool = createWidgetClickTool(manager);
      expect(tool.input.shape).toHaveProperty("selector");
      expect(tool.input.shape).toHaveProperty("text");
      expect(tool.input.shape).toHaveProperty("role");
      expect(tool.input.shape).toHaveProperty("name");
      expect(tool.input.shape).toHaveProperty("label");
      expect(tool.input.shape).toHaveProperty("placeholder");
      expect(tool.input.shape).toHaveProperty("testId");
    });

    it("should have stability options", () => {
      const tool = createWidgetClickTool(manager);
      expect(tool.input.shape).toHaveProperty("waitForStability");
      expect(tool.input.shape).toHaveProperty("stabilityOptions");
    });

    it("should have timeout option", () => {
      const tool = createWidgetClickTool(manager);
      expect(tool.input.shape).toHaveProperty("timeout");
    });
  });
});

describe("widget_fill Tool", () => {
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
      const tool = createWidgetFillTool(manager);
      expect(tool.description).toContain("fill");
    });
  });

  describe("session validation", () => {
    it("should return error when session not found", async () => {
      const tool = createWidgetFillTool(manager);
      const result = await tool.handler(
        { sessionId: "non-existent-id", selector: "#input", value: "test" },
        {} as never
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Session not found: non-existent-id");
    });
  });

  describe("input schema", () => {
    it("should have value field", () => {
      const tool = createWidgetFillTool(manager);
      expect(tool.input.shape).toHaveProperty("value");
    });

    it("should have locator fields", () => {
      const tool = createWidgetFillTool(manager);
      expect(tool.input.shape).toHaveProperty("selector");
      expect(tool.input.shape).toHaveProperty("label");
      expect(tool.input.shape).toHaveProperty("placeholder");
    });
  });
});

describe("widget_drag Tool", () => {
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
      const tool = createWidgetDragTool(manager);
      expect(tool.description).toContain("drag");
    });
  });

  describe("session validation", () => {
    it("should return error when session not found", async () => {
      const tool = createWidgetDragTool(manager);
      const result = await tool.handler(
        {
          sessionId: "non-existent-id",
          source: "#drag",
          target: "#drop",
        },
        {} as never
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Session not found: non-existent-id");
    });
  });

  describe("input schema", () => {
    it("should have source and target fields", () => {
      const tool = createWidgetDragTool(manager);
      expect(tool.input.shape).toHaveProperty("source");
      expect(tool.input.shape).toHaveProperty("target");
    });

    it("should have steps field", () => {
      const tool = createWidgetDragTool(manager);
      expect(tool.input.shape).toHaveProperty("steps");
    });
  });
});

describe("widget_evaluate Tool", () => {
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
      const tool = createWidgetEvaluateTool(manager);
      expect(tool.description).toContain("JavaScript");
    });
  });

  describe("session validation", () => {
    it("should return error when session not found", async () => {
      const tool = createWidgetEvaluateTool(manager);
      const result = await tool.handler(
        { sessionId: "non-existent-id", expression: "document.title" },
        {} as never
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Session not found: non-existent-id");
    });
  });

  describe("input schema", () => {
    it("should have expression field", () => {
      const tool = createWidgetEvaluateTool(manager);
      expect(tool.input.shape).toHaveProperty("expression");
    });

    it("should have sessionId field", () => {
      const tool = createWidgetEvaluateTool(manager);
      expect(tool.input.shape).toHaveProperty("sessionId");
    });
  });
});

describe("widget_locator Tool", () => {
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
      const tool = createWidgetLocatorTool(manager);
      // Description says "query elements... by css selector"
      expect(tool.description.toLowerCase()).toContain("selector");
    });
  });

  describe("session validation", () => {
    it("should return error when session not found", async () => {
      const tool = createWidgetLocatorTool(manager);
      const result = await tool.handler(
        { sessionId: "non-existent-id", selector: "#test" },
        {} as never
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Session not found: non-existent-id");
    });
  });

  describe("input schema", () => {
    it("should have selector field", () => {
      const tool = createWidgetLocatorTool(manager);
      expect(tool.input.shape).toHaveProperty("selector");
    });

    it("should have timeout field", () => {
      const tool = createWidgetLocatorTool(manager);
      expect(tool.input.shape).toHaveProperty("timeout");
    });
  });
});

describe("widget_refresh Tool", () => {
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
      const tool = createWidgetRefreshTool(manager);
      expect(tool.description.toLowerCase()).toContain("refresh");
    });
  });

  describe("session validation", () => {
    it("should return error when session not found", async () => {
      const tool = createWidgetRefreshTool(manager);
      const result = await tool.handler({ sessionId: "non-existent-id" }, {} as never);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Session not found: non-existent-id");
    });
  });

  describe("input schema", () => {
    it("should have sessionId field", () => {
      const tool = createWidgetRefreshTool(manager);
      expect(tool.input.shape).toHaveProperty("sessionId");
    });

    it("should have tool field", () => {
      const tool = createWidgetRefreshTool(manager);
      expect(tool.input.shape).toHaveProperty("tool");
    });

    it("should have arguments field", () => {
      const tool = createWidgetRefreshTool(manager);
      expect(tool.input.shape).toHaveProperty("arguments");
    });
  });
});

describe("widget_wait_for_selector Tool", () => {
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
      const tool = createWidgetWaitForSelectorTool(manager);
      expect(tool.description.toLowerCase()).toContain("wait");
    });
  });

  describe("session validation", () => {
    it("should return error when session not found", async () => {
      const tool = createWidgetWaitForSelectorTool(manager);
      const result = await tool.handler(
        { sessionId: "non-existent-id", selector: "#test" },
        {} as never
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Session not found: non-existent-id");
    });
  });

  describe("input schema", () => {
    it("should have selector field", () => {
      const tool = createWidgetWaitForSelectorTool(manager);
      expect(tool.input.shape).toHaveProperty("selector");
    });

    it("should have state field", () => {
      const tool = createWidgetWaitForSelectorTool(manager);
      expect(tool.input.shape).toHaveProperty("state");
    });

    it("should have timeout field", () => {
      const tool = createWidgetWaitForSelectorTool(manager);
      expect(tool.input.shape).toHaveProperty("timeout");
    });
  });
});

describe("widget_click handler with mock session", () => {
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

  it("should click element by text", async () => {
    const mockPageObj = createMockPage();
    const session = createMockSession("test-click-text", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetClickTool(manager);
    const result = await tool.handler(
      { sessionId: "test-click-text", text: "Click Me" },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(mockPageObj.frame.getByText).toHaveBeenCalled();
    expect(mockPageObj.locator.click).toHaveBeenCalled();
  });

  it("should click element by selector", async () => {
    const mockPageObj = createMockPage();
    const session = createMockSession("test-click-selector", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetClickTool(manager);
    const result = await tool.handler(
      { sessionId: "test-click-selector", selector: "#my-button" },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(mockPageObj.frame.locator).toHaveBeenCalledWith("#my-button");
  });

  it("should return error when no locator provided", async () => {
    const mockPageObj = createMockPage();
    const session = createMockSession("test-click-noloc", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetClickTool(manager);
    const result = await tool.handler({ sessionId: "test-click-noloc" }, {} as never);

    expect(result.success).toBe(false);
    expect(result.error).toContain("No locator specified");
  });
});

describe("widget_fill handler with mock session", () => {
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

  it("should fill input element", async () => {
    const inputLocator = createMockLocator({ tagName: "INPUT" });
    const mockPageObj = createMockPage(inputLocator);
    const session = createMockSession("test-fill", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetFillTool(manager);
    const result = await tool.handler(
      { sessionId: "test-fill", selector: "#email", value: "test@example.com" },
      {} as never
    );

    expect(result.success).toBe(true);
    // fill is called with value and options (timeout)
    expect(inputLocator.fill).toHaveBeenCalledWith("test@example.com", expect.any(Object));
  });

  it("should return error when no locator provided", async () => {
    const mockPageObj = createMockPage();
    const session = createMockSession("test-fill-noloc", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetFillTool(manager);
    const result = await tool.handler({ sessionId: "test-fill-noloc", value: "test" }, {} as never);

    expect(result.success).toBe(false);
    expect(result.error).toContain("No locator specified");
  });
});

describe("widget_evaluate handler with mock session", () => {
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

  it("should evaluate JavaScript expression", async () => {
    const mockPageObj = createMockPage();
    const session = createMockSession("test-eval", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetEvaluateTool(manager);
    const result = await tool.handler(
      { sessionId: "test-eval", expression: "document.title" },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(mockPageObj.frame.evaluate).toHaveBeenCalled();
  });

  it("should return error when page is closed", async () => {
    const mockPageObj = createMockPage();
    mockPageObj.page.isClosed.mockReturnValue(true);
    const session = createMockSession("test-eval-closed", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetEvaluateTool(manager);
    const result = await tool.handler(
      { sessionId: "test-eval-closed", expression: "1+1" },
      {} as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Page closed");
  });
});

describe("widget_locator handler with mock session", () => {
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

  it("should locate elements by selector", async () => {
    const mockLocator = createMockLocator({ count: 3 });
    const mockPageObj = createMockPage(mockLocator);
    const session = createMockSession("test-locator", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetLocatorTool(manager);
    const result = await tool.handler({ sessionId: "test-locator", selector: ".btn" }, {} as never);

    expect(result.success).toBe(true);
    expect(result.count).toBe(3);
  });
});

describe("widget_wait_for_selector handler with mock session", () => {
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

  it("should wait for selector", async () => {
    const mockPageObj = createMockPage();
    const session = createMockSession("test-wait", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetWaitForSelectorTool(manager);
    const result = await tool.handler(
      { sessionId: "test-wait", selector: "#loading", state: "hidden" },
      {} as never
    );

    expect(result.success).toBe(true);
    // waitForSelector is called on frame, not locator
    expect(mockPageObj.frame.waitForSelector).toHaveBeenCalledWith(
      "#loading",
      expect.objectContaining({ state: "hidden" })
    );
  });
});

describe("widget_control schemas", () => {
  describe("widgetClickInputSchema", () => {
    it("should export click input schema", async () => {
      const { widgetClickInputSchema } = await import("../src/tools/widget-control");
      expect(widgetClickInputSchema).toBeDefined();
    });

    it("should validate click input with text locator", async () => {
      const { widgetClickInputSchema } = await import("../src/tools/widget-control");
      const result = widgetClickInputSchema.safeParse({
        sessionId: "test-session",
        text: "Click me",
      });
      expect(result.success).toBe(true);
    });

    it("should validate click input with stability options", async () => {
      const { widgetClickInputSchema } = await import("../src/tools/widget-control");
      const result = widgetClickInputSchema.safeParse({
        sessionId: "test-session",
        selector: "#btn",
        waitForStability: true,
        stabilityOptions: {
          stabilityMs: 100,
          minWait: 50,
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("widgetFillInputSchema", () => {
    it("should export fill input schema", async () => {
      const { widgetFillInputSchema } = await import("../src/tools/widget-control");
      expect(widgetFillInputSchema).toBeDefined();
    });

    it("should validate fill input", async () => {
      const { widgetFillInputSchema } = await import("../src/tools/widget-control");
      const result = widgetFillInputSchema.safeParse({
        sessionId: "test-session",
        selector: "#email",
        value: "test@example.com",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("widgetDragInputSchema", () => {
    it("should export drag input schema", async () => {
      const { widgetDragInputSchema } = await import("../src/tools/widget-control");
      expect(widgetDragInputSchema).toBeDefined();
    });

    it("should validate drag input with selector strings", async () => {
      const { widgetDragInputSchema } = await import("../src/tools/widget-control");
      const result = widgetDragInputSchema.safeParse({
        sessionId: "test-session",
        source: "#drag-item",
        target: "#drop-zone",
        steps: 10,
      });
      expect(result.success).toBe(true);
    });

    it("should validate drag input with position objects", async () => {
      const { widgetDragInputSchema } = await import("../src/tools/widget-control");
      const result = widgetDragInputSchema.safeParse({
        sessionId: "test-session",
        source: { x: 100, y: 100 },
        target: { x: 200, y: 200 },
        steps: 5,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("widgetEvaluateInputSchema", () => {
    it("should export evaluate input schema", async () => {
      const { widgetEvaluateInputSchema } = await import("../src/tools/widget-control");
      expect(widgetEvaluateInputSchema).toBeDefined();
    });

    it("should validate evaluate input", async () => {
      const { widgetEvaluateInputSchema } = await import("../src/tools/widget-control");
      const result = widgetEvaluateInputSchema.safeParse({
        sessionId: "test-session",
        expression: "document.title",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("widgetWaitForSelectorInputSchema", () => {
    it("should export wait input schema", async () => {
      const { widgetWaitForSelectorInputSchema } = await import("../src/tools/widget-control");
      expect(widgetWaitForSelectorInputSchema).toBeDefined();
    });

    it("should validate wait input", async () => {
      const { widgetWaitForSelectorInputSchema } = await import("../src/tools/widget-control");
      const result = widgetWaitForSelectorInputSchema.safeParse({
        sessionId: "test-session",
        selector: "#loading",
        state: "hidden",
        timeout: 5000,
      });
      expect(result.success).toBe(true);
    });

    it("should accept all state values", async () => {
      const { widgetWaitForSelectorInputSchema } = await import("../src/tools/widget-control");
      const states = ["attached", "detached", "visible", "hidden"];
      for (const state of states) {
        const result = widgetWaitForSelectorInputSchema.safeParse({
          sessionId: "test",
          selector: "#test",
          state,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("output schemas", () => {
    it("should export click output schema", async () => {
      const { widgetClickOutputSchema } = await import("../src/tools/widget-control");
      expect(widgetClickOutputSchema).toBeDefined();
    });

    it("should export fill output schema", async () => {
      const { widgetFillOutputSchema } = await import("../src/tools/widget-control");
      expect(widgetFillOutputSchema).toBeDefined();
    });

    it("should export drag output schema", async () => {
      const { widgetDragOutputSchema } = await import("../src/tools/widget-control");
      expect(widgetDragOutputSchema).toBeDefined();
    });

    it("should export evaluate output schema", async () => {
      const { widgetEvaluateOutputSchema } = await import("../src/tools/widget-control");
      expect(widgetEvaluateOutputSchema).toBeDefined();
    });

    it("should validate click output", async () => {
      const { widgetClickOutputSchema } = await import("../src/tools/widget-control");
      const result = widgetClickOutputSchema.safeParse({
        success: true,
        locatorStrategy: "getByText('Button')",
        wasStable: true,
        stabilityWaitMs: 100,
      });
      expect(result.success).toBe(true);
    });

    it("should validate fill output", async () => {
      const { widgetFillOutputSchema } = await import("../src/tools/widget-control");
      const result = widgetFillOutputSchema.safeParse({
        success: true,
        locatorStrategy: "getByLabel('Email')",
        elementType: "input",
        fillMethod: "fill",
      });
      expect(result.success).toBe(true);
    });

    it("should validate drag output", async () => {
      const { widgetDragOutputSchema } = await import("../src/tools/widget-control");
      const result = widgetDragOutputSchema.safeParse({
        success: true,
        startPosition: { x: 100, y: 100 },
        endPosition: { x: 200, y: 200 },
      });
      expect(result.success).toBe(true);
    });

    it("should validate evaluate output", async () => {
      const { widgetEvaluateOutputSchema } = await import("../src/tools/widget-control");
      const result = widgetEvaluateOutputSchema.safeParse({
        success: true,
        result: "My Page Title",
      });
      expect(result.success).toBe(true);
    });
  });
});

// =============================================================================
// Additional handler tests for branch coverage
// =============================================================================

describe("widget_click handler - error branches", () => {
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

  it("should return hints for 'intercepts pointer events' error", async () => {
    const mockLocator = createMockLocator();
    mockLocator.click.mockRejectedValue(
      new Error("element with class 'modal-overlay' intercepts pointer events")
    );
    const mockPageObj = createMockPage(mockLocator);
    const session = createMockSession("test-click-blocked", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetClickTool(manager);
    const result = await tool.handler(
      { sessionId: "test-click-blocked", text: "Submit" },
      {} as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("intercepts pointer events");
    expect(result.hints?.next).toContain("blocked");
    expect(result.hints?.alternatives).toBeDefined();
  });

  it("should return hints for 'not found' error", async () => {
    const mockLocator = createMockLocator();
    mockLocator.click.mockRejectedValue(new Error("Element not found"));
    const mockPageObj = createMockPage(mockLocator);
    const session = createMockSession("test-click-notfound", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetClickTool(manager);
    const result = await tool.handler(
      { sessionId: "test-click-notfound", text: "Submit" },
      {} as never
    );

    expect(result.success).toBe(false);
    expect(result.hints?.next).toContain("widget_snapshot");
    expect(result.hints?.alternatives).toBeDefined();
  });

  it("should return hints for timeout error (lowercase)", async () => {
    const mockLocator = createMockLocator();
    mockLocator.click.mockRejectedValue(new Error("Locator.click: timeout 5000ms exceeded"));
    const mockPageObj = createMockPage(mockLocator);
    const session = createMockSession("test-click-timeout", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetClickTool(manager);
    const result = await tool.handler(
      { sessionId: "test-click-timeout", text: "Submit" },
      {} as never
    );

    expect(result.success).toBe(false);
    expect(result.hints?.alternatives).toBeDefined();
  });

  it("should return generic hints for unknown errors", async () => {
    const mockLocator = createMockLocator();
    mockLocator.click.mockRejectedValue(new Error("Unknown browser error"));
    const mockPageObj = createMockPage(mockLocator);
    const session = createMockSession("test-click-generic", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetClickTool(manager);
    const result = await tool.handler(
      { sessionId: "test-click-generic", text: "Submit" },
      {} as never
    );

    expect(result.success).toBe(false);
    expect(result.hints?.next).toContain("widget_snapshot");
  });

  it("should skip stability wait when waitForStability is false", async () => {
    const mockPageObj = createMockPage();
    const session = createMockSession("test-no-wait", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetClickTool(manager);
    const result = await tool.handler(
      { sessionId: "test-no-wait", text: "Submit", waitForStability: false },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(result.stabilityWaitMs).toBeUndefined();
    expect(result.wasStable).toBeUndefined();
  });

  it("should return error when widget iframe not found", async () => {
    const mockPageObj = createMockPage();
    mockPageObj.page.frame.mockReturnValue(null);
    const session = createMockSession("test-no-frame", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetClickTool(manager);
    const result = await tool.handler({ sessionId: "test-no-frame", text: "Submit" }, {} as never);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Widget iframe not found");
  });

  it("should return error when page is closed", async () => {
    const mockPageObj = createMockPage();
    mockPageObj.page.isClosed.mockReturnValue(true);
    const session = createMockSession("test-closed", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetClickTool(manager);
    const result = await tool.handler({ sessionId: "test-closed", text: "Submit" }, {} as never);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Page closed");
  });
});

describe("widget_fill handler - element type branches", () => {
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

  it("should fill select element using selectOption", async () => {
    const selectLocator = createMockLocator({ tagName: "SELECT" });
    selectLocator.evaluate.mockResolvedValue({
      tagName: "select",
      isContentEditable: false,
      inputType: "text",
    });
    selectLocator.selectOption = vi.fn().mockResolvedValue(undefined);
    const mockPageObj = createMockPage(selectLocator);
    const session = createMockSession("test-fill-select", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetFillTool(manager);
    const result = await tool.handler(
      { sessionId: "test-fill-select", selector: "select#country", value: "US" },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(result.fillMethod).toBe("selectOption");
    expect(selectLocator.selectOption).toHaveBeenCalledWith("US", expect.any(Object));
  });

  it("should fill contenteditable element", async () => {
    const ceLocator = createMockLocator({ tagName: "DIV" });
    ceLocator.evaluate.mockResolvedValue({
      tagName: "div",
      isContentEditable: true,
      inputType: "text",
    });
    ceLocator.pressSequentially = vi.fn().mockResolvedValue(undefined);
    ceLocator.press = vi.fn().mockResolvedValue(undefined);
    const mockPageObj = createMockPage(ceLocator);
    const session = createMockSession("test-fill-ce", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetFillTool(manager);
    const result = await tool.handler(
      { sessionId: "test-fill-ce", selector: "div.editable", value: "Hello world" },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(result.fillMethod).toBe("contenteditable");
    expect(result.elementType).toBe("div[contenteditable]");
    expect(ceLocator.pressSequentially).toHaveBeenCalledWith("Hello world", { delay: 10 });
  });

  it("should fill contenteditable with clear fallback", async () => {
    const ceLocator = createMockLocator({ tagName: "DIV" });
    ceLocator.evaluate.mockResolvedValue({
      tagName: "div",
      isContentEditable: true,
      inputType: "text",
    });
    // fill("") fails, triggers select-all + delete fallback
    ceLocator.fill.mockRejectedValue(new Error("Not supported"));
    ceLocator.pressSequentially = vi.fn().mockResolvedValue(undefined);
    ceLocator.press = vi.fn().mockResolvedValue(undefined);
    const mockPageObj = createMockPage(ceLocator);
    const session = createMockSession("test-fill-ce-fallback", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetFillTool(manager);
    const result = await tool.handler(
      { sessionId: "test-fill-ce-fallback", selector: "div.editable", value: "New content" },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(result.fillMethod).toBe("contenteditable");
    // Should have pressed select-all and backspace
    expect(ceLocator.press).toHaveBeenCalled();
  });

  it("should fill textarea element", async () => {
    const taLocator = createMockLocator({ tagName: "TEXTAREA" });
    taLocator.evaluate.mockResolvedValue({
      tagName: "textarea",
      isContentEditable: false,
      inputType: "text",
    });
    const mockPageObj = createMockPage(taLocator);
    const session = createMockSession("test-fill-textarea", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetFillTool(manager);
    const result = await tool.handler(
      { sessionId: "test-fill-textarea", selector: "textarea", value: "Long text" },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(result.elementType).toBe("textarea");
    expect(result.fillMethod).toBe("fill");
  });

  it("should use type fallback for textarea when fill fails", async () => {
    const taLocator = createMockLocator({ tagName: "TEXTAREA" });
    taLocator.evaluate.mockResolvedValue({
      tagName: "textarea",
      isContentEditable: false,
      inputType: "text",
    });
    taLocator.fill.mockRejectedValue(new Error("fill not supported"));
    taLocator.pressSequentially = vi.fn().mockResolvedValue(undefined);
    taLocator.press = vi.fn().mockResolvedValue(undefined);
    const mockPageObj = createMockPage(taLocator);
    const session = createMockSession("test-fill-ta-fallback", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetFillTool(manager);
    const result = await tool.handler(
      { sessionId: "test-fill-ta-fallback", selector: "textarea", value: "Text" },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(result.fillMethod).toBe("type");
  });

  it("should fill input element with type information", async () => {
    const inputLocator = createMockLocator({ tagName: "INPUT" });
    inputLocator.evaluate.mockResolvedValue({
      tagName: "input",
      isContentEditable: false,
      inputType: "email",
    });
    const mockPageObj = createMockPage(inputLocator);
    const session = createMockSession("test-fill-input-type", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetFillTool(manager);
    const result = await tool.handler(
      { sessionId: "test-fill-input-type", selector: "input[type=email]", value: "a@b.com" },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(result.elementType).toBe("input[type=email]");
    expect(result.fillMethod).toBe("fill");
  });

  it("should handle unknown element type with type fallback", async () => {
    const divLocator = createMockLocator({ tagName: "SPAN" });
    divLocator.evaluate.mockResolvedValue({
      tagName: "span",
      isContentEditable: false,
      inputType: "text",
    });
    divLocator.fill.mockRejectedValue(new Error("Not fillable"));
    divLocator.pressSequentially = vi.fn().mockResolvedValue(undefined);
    const mockPageObj = createMockPage(divLocator);
    const session = createMockSession("test-fill-unknown", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetFillTool(manager);
    const result = await tool.handler(
      { sessionId: "test-fill-unknown", selector: "span.editable", value: "val" },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(result.fillMethod).toBe("type");
  });

  it("should skip stability wait when waitForStability is false", async () => {
    const inputLocator = createMockLocator({ tagName: "INPUT" });
    inputLocator.evaluate.mockResolvedValue({
      tagName: "input",
      isContentEditable: false,
      inputType: "text",
    });
    const mockPageObj = createMockPage(inputLocator);
    const session = createMockSession("test-fill-no-wait", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetFillTool(manager);
    const result = await tool.handler(
      {
        sessionId: "test-fill-no-wait",
        selector: "#input",
        value: "test",
        waitForStability: false,
      },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(result.stabilityWaitMs).toBeUndefined();
  });

  it("should return hints for 'not found' error in fill", async () => {
    const inputLocator = createMockLocator({ tagName: "INPUT" });
    inputLocator.waitFor.mockRejectedValue(new Error("Element not found"));
    const mockPageObj = createMockPage(inputLocator);
    const session = createMockSession("test-fill-notfound", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetFillTool(manager);
    const result = await tool.handler(
      { sessionId: "test-fill-notfound", selector: "#input", value: "test" },
      {} as never
    );

    expect(result.success).toBe(false);
    expect(result.hints?.next).toContain("widget_snapshot");
    expect(result.hints?.alternatives).toBeDefined();
  });

  it("should return generic hints for unknown fill error", async () => {
    const inputLocator = createMockLocator({ tagName: "INPUT" });
    inputLocator.waitFor.mockRejectedValue(new Error("Something went wrong"));
    const mockPageObj = createMockPage(inputLocator);
    const session = createMockSession("test-fill-generic-err", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetFillTool(manager);
    const result = await tool.handler(
      { sessionId: "test-fill-generic-err", selector: "#input", value: "test" },
      {} as never
    );

    expect(result.success).toBe(false);
    expect(result.hints?.next).toContain("widget_snapshot");
  });
});

describe("widget_evaluate handler - additional branches", () => {
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

  it("should return error when widget iframe not found", async () => {
    const mockPageObj = createMockPage();
    mockPageObj.page.frame.mockReturnValue(null);
    const session = createMockSession("test-eval-noframe", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetEvaluateTool(manager);
    const result = await tool.handler(
      { sessionId: "test-eval-noframe", expression: "1+1" },
      {} as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Widget iframe not found");
  });

  it("should handle evaluation error", async () => {
    const mockPageObj = createMockPage();
    mockPageObj.frame.evaluate.mockRejectedValue(new Error("SyntaxError: unexpected token"));
    const session = createMockSession("test-eval-error", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetEvaluateTool(manager);
    const result = await tool.handler(
      { sessionId: "test-eval-error", expression: "invalid{{{" },
      {} as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("SyntaxError");
  });
});

describe("widget_drag handler - position branches", () => {
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

  it("should drag using position objects", async () => {
    const mockLocator = createMockLocator();
    const mockFrameElement = {
      boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 800, height: 600 }),
    };
    const mockPageObj = createMockPage(mockLocator);
    mockPageObj.frame.frameElement = vi.fn().mockResolvedValue(mockFrameElement);
    mockPageObj.page.waitForTimeout = vi.fn().mockResolvedValue(undefined);
    const session = createMockSession("test-drag-pos", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetDragTool(manager);
    const result = await tool.handler(
      {
        sessionId: "test-drag-pos",
        source: { x: 50, y: 50 },
        target: { x: 200, y: 200 },
        steps: 2,
      },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(result.startPosition).toEqual({ x: 50, y: 50 });
    expect(result.endPosition).toEqual({ x: 200, y: 200 });
  });

  it("should drag using CSS selector strings", async () => {
    const mockLocator = createMockLocator();
    mockLocator.boundingBox.mockResolvedValue({ x: 50, y: 50, width: 100, height: 50 });
    const mockFrameElement = {
      boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 800, height: 600 }),
    };
    const mockPageObj = createMockPage(mockLocator);
    mockPageObj.frame.frameElement = vi.fn().mockResolvedValue(mockFrameElement);
    mockPageObj.page.waitForTimeout = vi.fn().mockResolvedValue(undefined);
    const session = createMockSession("test-drag-sel", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetDragTool(manager);
    const result = await tool.handler(
      {
        sessionId: "test-drag-sel",
        source: "#item1",
        target: "#dropzone",
      },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(result.startPosition).toBeDefined();
    expect(result.endPosition).toBeDefined();
  });

  it("should return error when source element not visible", async () => {
    const mockLocator = createMockLocator();
    mockLocator.boundingBox.mockResolvedValue(null);
    const mockPageObj = createMockPage(mockLocator);
    const session = createMockSession("test-drag-nosource", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetDragTool(manager);
    const result = await tool.handler(
      {
        sessionId: "test-drag-nosource",
        source: "#hidden",
        target: "#dropzone",
      },
      {} as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Source element not found");
  });

  it("should return error when page is closed", async () => {
    const mockPageObj = createMockPage();
    mockPageObj.page.isClosed.mockReturnValue(true);
    const session = createMockSession("test-drag-closed", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetDragTool(manager);
    const result = await tool.handler(
      {
        sessionId: "test-drag-closed",
        source: "#item",
        target: "#drop",
      },
      {} as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Page closed");
  });

  it("should return error when widget iframe not found for drag", async () => {
    const mockPageObj = createMockPage();
    mockPageObj.page.frame.mockReturnValue(null);
    const session = createMockSession("test-drag-noframe", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetDragTool(manager);
    const result = await tool.handler(
      {
        sessionId: "test-drag-noframe",
        source: "#item",
        target: "#drop",
      },
      {} as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Widget iframe not found");
  });
});

describe("widget_refresh handler - additional branches", () => {
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

  it("should return error when page is closed", async () => {
    const mockPageObj = createMockPage();
    mockPageObj.page.isClosed.mockReturnValue(true);
    const session = createMockSession("test-refresh-closed", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetRefreshTool(manager);
    const result = await tool.handler({ sessionId: "test-refresh-closed" }, {} as never);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Page closed");
  });

  it("should return error when not connected", async () => {
    // Create a fresh manager, don't connect
    const disconnectedManager = new ConnectionManager();
    const mockPageObj = createMockPage();
    const session = createMockSession("test-refresh-disconn", mockPageObj.page);

    const sessionManager = disconnectedManager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetRefreshTool(disconnectedManager);
    const result = await tool.handler({ sessionId: "test-refresh-disconn" }, {} as never);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Not connected");
  });

  it("should return error when widget iframe not found for wait_for_selector", async () => {
    const mockPageObj = createMockPage();
    mockPageObj.page.frame.mockReturnValue(null);
    const session = createMockSession("test-wait-noframe", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetWaitForSelectorTool(manager);
    const result = await tool.handler(
      { sessionId: "test-wait-noframe", selector: "#test" },
      {} as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Widget iframe not found");
  });

  it("should return error when page is closed for wait_for_selector", async () => {
    const mockPageObj = createMockPage();
    mockPageObj.page.isClosed.mockReturnValue(true);
    const session = createMockSession("test-wait-closed", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetWaitForSelectorTool(manager);
    const result = await tool.handler(
      { sessionId: "test-wait-closed", selector: "#test" },
      {} as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Page closed");
  });

  it("should handle wait_for_selector timeout error", async () => {
    const mockPageObj = createMockPage();
    mockPageObj.frame.waitForSelector.mockRejectedValue(new Error("Timeout"));
    const session = createMockSession("test-wait-timeout", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetWaitForSelectorTool(manager);
    const result = await tool.handler(
      { sessionId: "test-wait-timeout", selector: "#test" },
      {} as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Timeout");
  });

  it("should return error when page is closed for locator", async () => {
    const mockPageObj = createMockPage();
    mockPageObj.page.isClosed.mockReturnValue(true);
    const session = createMockSession("test-loc-closed", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetLocatorTool(manager);
    const result = await tool.handler(
      { sessionId: "test-loc-closed", selector: "#test" },
      {} as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Page closed");
  });

  it("should return error when widget iframe not found for locator", async () => {
    const mockPageObj = createMockPage();
    mockPageObj.page.frame.mockReturnValue(null);
    const session = createMockSession("test-loc-noframe", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetLocatorTool(manager);
    const result = await tool.handler(
      { sessionId: "test-loc-noframe", selector: "#test" },
      {} as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Widget iframe not found");
  });
});
