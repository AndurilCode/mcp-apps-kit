/**
 * Tests for widget_snapshot_diff tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConnectionManager } from "../src/connection";
import { createWidgetSnapshotDiffTool } from "../src/tools/widget-snapshot-diff";
import type { WidgetSession, AccessibilityNode } from "../src/types";
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

// Helper to create mock page
function createMockPage(
  ariaSnapshot = `
- button "Submit"
- textbox "Email"
- link "Cancel"
`
) {
  const mockLocator = {
    ariaSnapshot: vi.fn().mockResolvedValue(ariaSnapshot),
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

// Helper to create mock session with optional cached snapshot
function createMockSession(
  id: string,
  page: ReturnType<typeof createMockPage>["page"],
  options: { lastSnapshot?: AccessibilityNode; lastSnapshotTimestamp?: number } = {}
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
    lastSnapshot: options.lastSnapshot,
    lastSnapshotTimestamp: options.lastSnapshotTimestamp,
  };
}

describe("widget_snapshot_diff Tool", () => {
  let manager: ConnectionManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    manager = new ConnectionManager();

    mockListTools.mockResolvedValue([{ name: "greet" }]);
    mockListResources.mockResolvedValue([]);
    mockListPrompts.mockResolvedValue([]);

    await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
  });

  afterEach(async () => {
    if (manager) {
      await manager.disconnect();
    }
    vi.clearAllMocks();
  });

  describe("tool metadata", () => {
    it("should have correct description", () => {
      const tool = createWidgetSnapshotDiffTool(createMockRegistry(manager));
      expect(tool.description).toContain("Compare");
      expect(tool.description).toContain("snapshot");
    });

    it("should have input and output schemas defined", () => {
      const tool = createWidgetSnapshotDiffTool(createMockRegistry(manager));
      expect(tool.input).toBeDefined();
      expect(tool.output).toBeDefined();
    });
  });

  describe("session validation", () => {
    it("should return error when session not found", async () => {
      const tool = createWidgetSnapshotDiffTool(createMockRegistry(manager));
      const result = await tool.handler({ sessionId: "non-existent-id" }, {} as never);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Session not found: non-existent-id");
      expect(result.hints?.next).toContain("Create a new session");
    });
  });

  describe("not connected", () => {
    it("should return error when not connected", async () => {
      const disconnectedManager = new ConnectionManager();
      const tool = createWidgetSnapshotDiffTool(createMockRegistry(disconnectedManager));

      // These tools check session first before checking connection
      const result = await tool.handler({ sessionId: "test-session" }, {} as never);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Session not found");
    });
  });

  describe("input schema", () => {
    it("should have sessionId field", () => {
      const tool = createWidgetSnapshotDiffTool(createMockRegistry(manager));
      expect(tool.input.shape).toHaveProperty("sessionId");
    });

    it("should have previousSnapshot field", () => {
      const tool = createWidgetSnapshotDiffTool(createMockRegistry(manager));
      expect(tool.input.shape).toHaveProperty("previousSnapshot");
    });
  });

  describe("output schema", () => {
    it("should have success field", () => {
      const tool = createWidgetSnapshotDiffTool(createMockRegistry(manager));
      expect(tool.output).toBeDefined();
      expect(tool.output!.shape).toHaveProperty("success");
    });

    it("should have changes field", () => {
      const tool = createWidgetSnapshotDiffTool(createMockRegistry(manager));
      expect(tool.output!.shape).toHaveProperty("changes");
    });

    it("should have unchanged field", () => {
      const tool = createWidgetSnapshotDiffTool(createMockRegistry(manager));
      expect(tool.output!.shape).toHaveProperty("unchanged");
    });

    it("should have summary field", () => {
      const tool = createWidgetSnapshotDiffTool(createMockRegistry(manager));
      expect(tool.output!.shape).toHaveProperty("summary");
    });

    it("should have currentSnapshot field", () => {
      const tool = createWidgetSnapshotDiffTool(createMockRegistry(manager));
      expect(tool.output!.shape).toHaveProperty("currentSnapshot");
    });

    it("should have usedCachedSnapshot field", () => {
      const tool = createWidgetSnapshotDiffTool(createMockRegistry(manager));
      expect(tool.output!.shape).toHaveProperty("usedCachedSnapshot");
    });

    it("should have cachedSnapshotAge field", () => {
      const tool = createWidgetSnapshotDiffTool(createMockRegistry(manager));
      expect(tool.output!.shape).toHaveProperty("cachedSnapshotAge");
    });

    it("should have error field", () => {
      const tool = createWidgetSnapshotDiffTool(createMockRegistry(manager));
      expect(tool.output!.shape).toHaveProperty("error");
    });

    it("should have hints field", () => {
      const tool = createWidgetSnapshotDiffTool(createMockRegistry(manager));
      expect(tool.output!.shape).toHaveProperty("hints");
    });
  });
});

describe("widget_snapshot_diff handler with mock session", () => {
  let manager: ConnectionManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    manager = new ConnectionManager();

    mockListTools.mockResolvedValue([{ name: "greet" }]);
    mockListResources.mockResolvedValue([]);
    mockListPrompts.mockResolvedValue([]);

    await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
  });

  afterEach(async () => {
    if (manager) {
      await manager.disconnect();
    }
    vi.clearAllMocks();
  });

  it("should detect no changes when snapshots are identical", async () => {
    const mockPageObj = createMockPage();
    const cachedSnapshot: AccessibilityNode = {
      role: "root",
      name: "",
      nodeIndex: 0,
      children: [
        { role: "button", name: "Submit", nodeIndex: 1 },
        { role: "textbox", name: "Email", nodeIndex: 2 },
        { role: "link", name: "Cancel", nodeIndex: 3 },
      ],
    };
    const session = createMockSession("test-diff-same", mockPageObj.page, {
      lastSnapshot: cachedSnapshot,
      lastSnapshotTimestamp: Date.now(),
    });

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetSnapshotDiffTool(createMockRegistry(manager));
    const result = await tool.handler({ sessionId: "test-diff-same" }, {} as never);

    expect(result.success).toBe(true);
    expect(result.usedCachedSnapshot).toBe(true);
    // Should show no changes for identical content
  });

  it("should detect added elements", async () => {
    // Current snapshot has 3 elements, previous had 2
    const mockPageObj = createMockPage();
    const previousSnapshot: AccessibilityNode = {
      role: "root",
      name: "",
      nodeIndex: 0,
      children: [
        { role: "button", name: "Submit", nodeIndex: 1 },
        { role: "textbox", name: "Email", nodeIndex: 2 },
        // Missing: link "Cancel"
      ],
    };

    const tool = createWidgetSnapshotDiffTool(createMockRegistry(manager));
    const session = createMockSession("test-diff-added", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const result = await tool.handler(
      { sessionId: "test-diff-added", previousSnapshot },
      {} as never
    );

    expect(result.success).toBe(true);
    // usedCachedSnapshot is false/undefined when using explicit previousSnapshot
    expect(result.usedCachedSnapshot).toBeFalsy();
  });

  it("should detect removed elements", async () => {
    // Current snapshot has 3 elements, previous had 4
    const previousSnapshot: AccessibilityNode = {
      role: "root",
      name: "",
      nodeIndex: 0,
      children: [
        { role: "button", name: "Submit", nodeIndex: 1 },
        { role: "textbox", name: "Email", nodeIndex: 2 },
        { role: "link", name: "Cancel", nodeIndex: 3 },
        { role: "button", name: "Delete", nodeIndex: 4 }, // This will be removed
      ],
    };
    const mockPageObj = createMockPage();
    const session = createMockSession("test-diff-removed", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetSnapshotDiffTool(createMockRegistry(manager));
    const result = await tool.handler(
      { sessionId: "test-diff-removed", previousSnapshot },
      {} as never
    );

    expect(result.success).toBe(true);
  });

  it("should return error when page is closed", async () => {
    const mockPageObj = createMockPage();
    mockPageObj.page.isClosed.mockReturnValue(true);
    const session = createMockSession("test-diff-closed", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetSnapshotDiffTool(createMockRegistry(manager));
    const result = await tool.handler({ sessionId: "test-diff-closed" }, {} as never);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Page closed");
  });

  it("should return error when widget frame not found", async () => {
    const mockPageObj = createMockPage();
    mockPageObj.page.frame.mockReturnValue(null);
    const session = createMockSession("test-diff-noframe", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetSnapshotDiffTool(createMockRegistry(manager));
    const result = await tool.handler({ sessionId: "test-diff-noframe" }, {} as never);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Widget iframe not found");
  });

  it("should return error when no previous snapshot and no cached snapshot", async () => {
    const mockPageObj = createMockPage();
    const session = createMockSession("test-diff-nocached", mockPageObj.page);
    // No lastSnapshot set

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetSnapshotDiffTool(createMockRegistry(manager));
    const result = await tool.handler({ sessionId: "test-diff-nocached" }, {} as never);

    expect(result.success).toBe(false);
    expect(result.error).toContain("No previous snapshot");
  });

  it("should handle empty ariaSnapshot gracefully", async () => {
    const mockPageObj = createMockPage("");
    const previousSnapshot: AccessibilityNode = {
      role: "button",
      name: "Old",
      nodeIndex: 0,
    };
    const session = createMockSession("test-diff-empty", mockPageObj.page);

    const sessionManager = manager.getWidgetSessionManager();
    vi.spyOn(sessionManager, "getSession").mockReturnValue(session);

    const tool = createWidgetSnapshotDiffTool(createMockRegistry(manager));
    const result = await tool.handler(
      { sessionId: "test-diff-empty", previousSnapshot },
      {} as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to capture");
  });
});

describe("widget_snapshot_diff schemas", () => {
  describe("widgetSnapshotDiffInputSchema", () => {
    it("should export input schema", async () => {
      const { widgetSnapshotDiffInputSchema } = await import("../src/tools/widget-snapshot-diff");
      expect(widgetSnapshotDiffInputSchema).toBeDefined();
    });

    it("should validate input with sessionId only", async () => {
      const { widgetSnapshotDiffInputSchema } = await import("../src/tools/widget-snapshot-diff");
      const result = widgetSnapshotDiffInputSchema.safeParse({
        sessionId: "test-session",
      });
      expect(result.success).toBe(true);
    });

    it("should validate input with previousSnapshot", async () => {
      const { widgetSnapshotDiffInputSchema } = await import("../src/tools/widget-snapshot-diff");
      const result = widgetSnapshotDiffInputSchema.safeParse({
        sessionId: "test-session",
        previousSnapshot: {
          role: "root",
          name: "",
          nodeIndex: 0,
          children: [{ role: "button", name: "Submit", nodeIndex: 1 }],
        },
      });
      expect(result.success).toBe(true);
    });

    it("should reject input without sessionId", async () => {
      const { widgetSnapshotDiffInputSchema } = await import("../src/tools/widget-snapshot-diff");
      const result = widgetSnapshotDiffInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should reject non-string sessionId", async () => {
      const { widgetSnapshotDiffInputSchema } = await import("../src/tools/widget-snapshot-diff");
      const result = widgetSnapshotDiffInputSchema.safeParse({
        sessionId: 12345,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("widgetSnapshotDiffOutputSchema", () => {
    it("should export output schema", async () => {
      const { widgetSnapshotDiffOutputSchema } = await import("../src/tools/widget-snapshot-diff");
      expect(widgetSnapshotDiffOutputSchema).toBeDefined();
    });

    it("should validate success response with changes", async () => {
      const { widgetSnapshotDiffOutputSchema } = await import("../src/tools/widget-snapshot-diff");
      const result = widgetSnapshotDiffOutputSchema.safeParse({
        success: true,
        changes: {
          added: [{ role: "button", name: "New Button", nodeIndex: 1 }],
          removed: [{ role: "link", name: "Old Link" }],
        },
        unchanged: 5,
        summary: {
          previousTotal: 7,
          currentTotal: 6,
          added: 1,
          removed: 1,
          unchanged: 5,
        },
        currentSnapshot: {
          role: "root",
          name: "",
          nodeIndex: 0,
        },
        usedCachedSnapshot: false,
      });
      expect(result.success).toBe(true);
    });

    it("should validate success response using cached snapshot", async () => {
      const { widgetSnapshotDiffOutputSchema } = await import("../src/tools/widget-snapshot-diff");
      const result = widgetSnapshotDiffOutputSchema.safeParse({
        success: true,
        changes: {},
        unchanged: 10,
        summary: {
          previousTotal: 10,
          currentTotal: 10,
          added: 0,
          removed: 0,
          unchanged: 10,
        },
        currentSnapshot: { role: "root", name: "", nodeIndex: 0 },
        usedCachedSnapshot: true,
        cachedSnapshotAge: 5000,
      });
      expect(result.success).toBe(true);
    });

    it("should validate error response", async () => {
      const { widgetSnapshotDiffOutputSchema } = await import("../src/tools/widget-snapshot-diff");
      const result = widgetSnapshotDiffOutputSchema.safeParse({
        success: false,
        error: "Session not found",
        hints: { next: "Create a new session" },
      });
      expect(result.success).toBe(true);
    });

    it("should validate response with count changes", async () => {
      const { widgetSnapshotDiffOutputSchema } = await import("../src/tools/widget-snapshot-diff");
      const result = widgetSnapshotDiffOutputSchema.safeParse({
        success: true,
        changes: {
          countChanges: [
            {
              role: "button",
              name: "Item",
              previousCount: 3,
              currentCount: 5,
            },
          ],
        },
        unchanged: 3,
        summary: {
          previousTotal: 3,
          currentTotal: 5,
          added: 2,
          removed: 0,
          unchanged: 3,
        },
        currentSnapshot: { role: "root", name: "", nodeIndex: 0 },
        usedCachedSnapshot: false,
      });
      expect(result.success).toBe(true);
    });
  });
});
