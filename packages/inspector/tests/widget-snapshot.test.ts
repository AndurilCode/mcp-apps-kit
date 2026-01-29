/**
 * Tests for widget_snapshot tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConnectionManager } from "../src/connection";
import { createWidgetSnapshotTool } from "../src/tools/widget-snapshot";
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
function createMockPage(options: { hasFocusedElement?: boolean } = {}) {
  const mockLocator = {
    ariaSnapshot: vi.fn().mockResolvedValue(`
- button "Submit"
- textbox "Email"${options.hasFocusedElement ? " [focused]" : ""}
- link "Cancel"
`),
    textContent: vi.fn().mockResolvedValue("Page content"),
  };
  const mockFrame = {
    locator: vi.fn().mockReturnValue(mockLocator),
    content: vi.fn().mockResolvedValue("<html><body>Test</body></html>"),
    url: vi.fn().mockReturnValue("http://localhost/widget/test"),
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

describe("widget_snapshot Tool", () => {
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
      const tool = createWidgetSnapshotTool(manager);
      expect(tool.description).toContain("accessibility tree snapshot");
      expect(tool.description).toContain("widget_snapshot_diff");
    });

    it("should have input and output schemas defined", () => {
      const tool = createWidgetSnapshotTool(manager);
      expect(tool.input).toBeDefined();
      expect(tool.output).toBeDefined();
    });
  });

  describe("session validation", () => {
    it("should return error when session not found", async () => {
      const tool = createWidgetSnapshotTool(manager);
      const result = await tool.handler({ sessionId: "non-existent-id" }, {} as never);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Session not found: non-existent-id");
      expect(result.hints?.next).toContain("Create a new session");
    });

    it("should return error with valid session ID format but no session", async () => {
      const tool = createWidgetSnapshotTool(manager);
      const result = await tool.handler({ sessionId: "abc123-def456-ghi789" }, {} as never);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Session not found");
    });
  });

  describe("not connected", () => {
    it("should return error when not connected", async () => {
      const disconnectedManager = new ConnectionManager();
      const tool = createWidgetSnapshotTool(disconnectedManager);

      // These tools check session first before checking connection
      const result = await tool.handler({ sessionId: "test-session" }, {} as never);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Session not found");
    });
  });

  describe("input validation", () => {
    it("should accept valid sessionId", () => {
      const tool = createWidgetSnapshotTool(manager);
      // Input schema should accept sessionId
      expect(tool.input.shape).toHaveProperty("sessionId");
    });

    it("should have optional includeDOM parameter", () => {
      const tool = createWidgetSnapshotTool(manager);
      expect(tool.input.shape).toHaveProperty("includeDOM");
    });

    it("should have optional compactDOM parameter", () => {
      const tool = createWidgetSnapshotTool(manager);
      expect(tool.input.shape).toHaveProperty("compactDOM");
    });

    it("should have optional filterRoles parameter", () => {
      const tool = createWidgetSnapshotTool(manager);
      expect(tool.input.shape).toHaveProperty("filterRoles");
    });

    it("should have optional maxDepth parameter", () => {
      const tool = createWidgetSnapshotTool(manager);
      expect(tool.input.shape).toHaveProperty("maxDepth");
    });
  });

  describe("output schema", () => {
    it("should have success field", () => {
      const tool = createWidgetSnapshotTool(manager);
      expect(tool.output).toBeDefined();
      expect(tool.output!.shape).toHaveProperty("success");
    });

    it("should have optional accessibilityTree field", () => {
      const tool = createWidgetSnapshotTool(manager);
      expect(tool.output!.shape).toHaveProperty("accessibilityTree");
    });

    it("should have optional interactiveElements field", () => {
      const tool = createWidgetSnapshotTool(manager);
      expect(tool.output!.shape).toHaveProperty("interactiveElements");
    });

    it("should have optional error field", () => {
      const tool = createWidgetSnapshotTool(manager);
      expect(tool.output!.shape).toHaveProperty("error");
    });

    it("should have optional hints field", () => {
      const tool = createWidgetSnapshotTool(manager);
      expect(tool.output!.shape).toHaveProperty("hints");
    });
  });
});

describe("widget_snapshot handler with mock session", () => {
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

  it("should capture accessibility tree when session exists", async () => {
    const mockPageObj = createMockPage();
    const session = createMockSession("test-session-123", mockPageObj.page);

    // Add session to session manager
    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetSnapshotTool(manager);
    const result = await tool.handler({ sessionId: "test-session-123" }, {} as never);

    expect(result.success).toBe(true);
    expect(result.accessibilityTree).toBeDefined();
    expect(result.interactiveElementCount).toBeGreaterThan(0);
    expect(result.interactiveElements).toBeDefined();
    expect(result.interactiveElements!.length).toBeGreaterThan(0);
    // Check that interactive elements include buttons and textboxes
    const roles = result.interactiveElements!.map((el) => el.role);
    expect(roles).toContain("button");
    expect(roles).toContain("textbox");
  });

  it("should include DOM when includeDOM is true", async () => {
    const mockPageObj = createMockPage();
    const session = createMockSession("test-session-dom", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetSnapshotTool(manager);
    const result = await tool.handler(
      { sessionId: "test-session-dom", includeDOM: true },
      {} as never
    );

    expect(result.success).toBe(true);
    expect(result.dom).toBeDefined();
    expect(result.dom!.html).toContain("<html>");
    expect(result.dom!.textContent).toBeDefined();
  });

  it("should handle empty ariaSnapshot", async () => {
    const mockPageObj = createMockPage();
    mockPageObj.locator.ariaSnapshot.mockResolvedValue("");
    const session = createMockSession("test-session-empty", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetSnapshotTool(manager);
    const result = await tool.handler({ sessionId: "test-session-empty" }, {} as never);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to capture accessibility tree");
  });

  it("should filter by roles when filterRoles is provided", async () => {
    const mockPageObj = createMockPage();
    const session = createMockSession("test-session-filter", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetSnapshotTool(manager);
    const result = await tool.handler(
      { sessionId: "test-session-filter", filterRoles: ["button"] },
      {} as never
    );

    expect(result.success).toBe(true);
    // Should only include buttons in interactive elements
    if (result.interactiveElements) {
      for (const el of result.interactiveElements) {
        expect(el.role).toBe("button");
      }
    }
  });

  it("should return error when page is closed", async () => {
    const mockPageObj = createMockPage();
    mockPageObj.page.isClosed.mockReturnValue(true);
    const session = createMockSession("test-session-closed", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetSnapshotTool(manager);
    const result = await tool.handler({ sessionId: "test-session-closed" }, {} as never);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Page closed");
  });

  it("should return error when widget frame not found", async () => {
    const mockPageObj = createMockPage();
    mockPageObj.page.frame.mockReturnValue(null);
    const session = createMockSession("test-session-noframe", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetSnapshotTool(manager);
    const result = await tool.handler({ sessionId: "test-session-noframe" }, {} as never);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Widget iframe not found");
  });

  it("should cache snapshot for diff tool", async () => {
    const mockPageObj = createMockPage();
    const session = createMockSession("test-session-cache", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetSnapshotTool(manager);
    const result = await tool.handler({ sessionId: "test-session-cache" }, {} as never);

    expect(result.success).toBe(true);
    // Session should have lastSnapshot set for diff tool
    expect(session.lastSnapshot).toBeDefined();
    expect(session.lastSnapshotTimestamp).toBeDefined();
  });
});

describe("widget_snapshot schemas", () => {
  describe("widgetSnapshotInputSchema", () => {
    it("should export input schema", async () => {
      const { widgetSnapshotInputSchema } = await import("../src/tools/widget-snapshot");
      expect(widgetSnapshotInputSchema).toBeDefined();
    });

    it("should validate correct input", async () => {
      const { widgetSnapshotInputSchema } = await import("../src/tools/widget-snapshot");
      const result = widgetSnapshotInputSchema.safeParse({
        sessionId: "test-session",
      });
      expect(result.success).toBe(true);
    });

    it("should validate input with all optional fields", async () => {
      const { widgetSnapshotInputSchema } = await import("../src/tools/widget-snapshot");
      const result = widgetSnapshotInputSchema.safeParse({
        sessionId: "test-session",
        includeDOM: true,
        compactDOM: true,
        filterRoles: ["button", "textbox"],
        maxDepth: 5,
      });
      expect(result.success).toBe(true);
    });

    it("should reject input without sessionId", async () => {
      const { widgetSnapshotInputSchema } = await import("../src/tools/widget-snapshot");
      const result = widgetSnapshotInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should reject non-string sessionId", async () => {
      const { widgetSnapshotInputSchema } = await import("../src/tools/widget-snapshot");
      const result = widgetSnapshotInputSchema.safeParse({
        sessionId: 12345,
      });
      expect(result.success).toBe(false);
    });

    it("should reject non-boolean includeDOM", async () => {
      const { widgetSnapshotInputSchema } = await import("../src/tools/widget-snapshot");
      const result = widgetSnapshotInputSchema.safeParse({
        sessionId: "test",
        includeDOM: "yes",
      });
      expect(result.success).toBe(false);
    });

    it("should reject non-array filterRoles", async () => {
      const { widgetSnapshotInputSchema } = await import("../src/tools/widget-snapshot");
      const result = widgetSnapshotInputSchema.safeParse({
        sessionId: "test",
        filterRoles: "button",
      });
      expect(result.success).toBe(false);
    });

    it("should reject non-number maxDepth", async () => {
      const { widgetSnapshotInputSchema } = await import("../src/tools/widget-snapshot");
      const result = widgetSnapshotInputSchema.safeParse({
        sessionId: "test",
        maxDepth: "5",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("widgetSnapshotOutputSchema", () => {
    it("should export output schema", async () => {
      const { widgetSnapshotOutputSchema } = await import("../src/tools/widget-snapshot");
      expect(widgetSnapshotOutputSchema).toBeDefined();
    });

    it("should validate success response", async () => {
      const { widgetSnapshotOutputSchema } = await import("../src/tools/widget-snapshot");
      const result = widgetSnapshotOutputSchema.safeParse({
        success: true,
        accessibilityTree: { role: "button", name: "Submit", nodeIndex: 0 },
        interactiveElementCount: 1,
        interactiveElements: [
          { nodeIndex: 0, role: "button", name: "Submit", locatorHint: "getByRole('button')" },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("should validate error response", async () => {
      const { widgetSnapshotOutputSchema } = await import("../src/tools/widget-snapshot");
      const result = widgetSnapshotOutputSchema.safeParse({
        success: false,
        error: "Session not found",
        hints: { next: "Create a new session" },
      });
      expect(result.success).toBe(true);
    });

    it("should validate response with DOM", async () => {
      const { widgetSnapshotOutputSchema } = await import("../src/tools/widget-snapshot");
      const result = widgetSnapshotOutputSchema.safeParse({
        success: true,
        dom: {
          html: "<html><body>Test</body></html>",
          textContent: "Test",
        },
      });
      expect(result.success).toBe(true);
    });
  });
});
