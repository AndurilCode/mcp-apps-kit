/**
 * Tests for WidgetSessionManager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WidgetSessionManager } from "../src/widget-session-manager";

// Mock Page type
interface MockPage {
  on: ReturnType<typeof vi.fn>;
  isClosed: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  url: ReturnType<typeof vi.fn>;
  evaluate: ReturnType<typeof vi.fn>;
  frames: ReturnType<typeof vi.fn>;
  mainFrame: ReturnType<typeof vi.fn>;
}

function createMockPage(): MockPage {
  return {
    on: vi.fn(),
    isClosed: vi.fn().mockReturnValue(false),
    close: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue("http://localhost/host/session-123"),
    evaluate: vi.fn().mockResolvedValue(undefined),
    frames: vi.fn().mockReturnValue([]),
    mainFrame: vi.fn().mockReturnValue({}),
  };
}

describe("WidgetSessionManager", () => {
  let manager: WidgetSessionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new WidgetSessionManager({ debug: false, ttl: 5 * 60 * 1000 });
  });

  afterEach(async () => {
    await manager.dispose();
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should use default TTL when not provided", () => {
      const defaultManager = new WidgetSessionManager();
      expect(defaultManager).toBeDefined();
    });

    it("should accept debug option", () => {
      const debugManager = new WidgetSessionManager({ debug: true });
      expect(debugManager).toBeDefined();
    });

    it("should accept custom TTL", () => {
      const customManager = new WidgetSessionManager({ ttl: 1000 });
      expect(customManager).toBeDefined();
    });
  });

  describe("createSession", () => {
    it("should create a new session with all required properties", async () => {
      const mockPage = createMockPage();

      const session = await manager.createSession(
        "greet",
        { name: "Alice" },
        { message: "Hello Alice" },
        mockPage as unknown as Parameters<typeof manager.createSession>[3],
        "widget-session-123",
        "mcp"
      );

      expect(session.id).toBeDefined();
      expect(session.toolName).toBe("greet");
      expect(session.toolArgs).toEqual({ name: "Alice" });
      expect(session.toolResult).toEqual({ message: "Hello Alice" });
      expect(session.protocol).toBe("mcp");
      expect(session.source).toBe("agent");
      expect(session.consoleLogs).toEqual([]);
      expect(session.pageErrors).toEqual([]);
      expect(session.createdAt).toBeDefined();
    });

    it("should set up console log listener", async () => {
      const mockPage = createMockPage();

      await manager.createSession(
        "greet",
        {},
        {},
        mockPage as unknown as Parameters<typeof manager.createSession>[3],
        "widget-123",
        "mcp"
      );

      expect(mockPage.on).toHaveBeenCalledWith("console", expect.any(Function));
    });

    it("should set up page error listener", async () => {
      const mockPage = createMockPage();

      await manager.createSession(
        "greet",
        {},
        {},
        mockPage as unknown as Parameters<typeof manager.createSession>[3],
        "widget-123",
        "mcp"
      );

      expect(mockPage.on).toHaveBeenCalledWith("pageerror", expect.any(Function));
    });

    it("should support custom source parameter", async () => {
      const mockPage = createMockPage();

      const session = await manager.createSession(
        "greet",
        {},
        {},
        mockPage as unknown as Parameters<typeof manager.createSession>[3],
        "widget-123",
        "mcp",
        "apps"
      );

      expect(session.source).toBe("apps");
    });

    it("should support proxy metadata", async () => {
      const mockPage = createMockPage();

      const session = await manager.createSession(
        "greet",
        {},
        {},
        mockPage as unknown as Parameters<typeof manager.createSession>[3],
        "widget-123",
        "mcp",
        "apps",
        { targetServerUrl: "http://example.com", targetToolName: "original_greet" }
      );

      expect(session.proxyMetadata).toEqual({
        targetServerUrl: "http://example.com",
        targetToolName: "original_greet",
      });
    });

    it("should capture console logs via listener", async () => {
      const mockPage = createMockPage();
      let consoleHandler:
        | ((msg: {
            type: () => string;
            text: () => string;
            location: () => { url: string; lineNumber: number };
          }) => void)
        | null = null;
      mockPage.on.mockImplementation(
        (
          event: string,
          handler: (msg: {
            type: () => string;
            text: () => string;
            location: () => { url: string; lineNumber: number };
          }) => void
        ) => {
          if (event === "console") {
            consoleHandler = handler;
          }
        }
      );

      const session = await manager.createSession(
        "greet",
        {},
        {},
        mockPage as unknown as Parameters<typeof manager.createSession>[3],
        "widget-123",
        "mcp"
      );

      // Simulate console message
      consoleHandler!({
        type: () => "log",
        text: () => "Test message",
        location: () => ({ url: "/widget/content", lineNumber: 10 }),
      });

      expect(session.consoleLogs).toHaveLength(1);
      expect(session.consoleLogs[0]?.text).toBe("Test message");
      expect(session.consoleLogs[0]?.level).toBe("log");
      expect(session.consoleLogs[0]?.source).toBe("widget");
    });

    it("should capture page errors via listener", async () => {
      const mockPage = createMockPage();
      let errorHandler: ((err: { message: string }) => void) | null = null;
      mockPage.on.mockImplementation(
        (event: string, handler: (err: { message: string }) => void) => {
          if (event === "pageerror") {
            errorHandler = handler;
          }
        }
      );

      const session = await manager.createSession(
        "greet",
        {},
        {},
        mockPage as unknown as Parameters<typeof manager.createSession>[3],
        "widget-123",
        "mcp"
      );

      // Simulate page error
      errorHandler!({ message: "Uncaught TypeError: foo is not defined" });

      expect(session.pageErrors).toHaveLength(1);
      expect(session.pageErrors[0]).toBe("Uncaught TypeError: foo is not defined");
    });

    it("should log creation when debug is enabled", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const debugManager = new WidgetSessionManager({ debug: true });
      const mockPage = createMockPage();

      await debugManager.createSession(
        "greet",
        {},
        {},
        mockPage as unknown as Parameters<typeof manager.createSession>[3],
        "widget-123",
        "mcp"
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[WidgetSessionManager] Created session")
      );

      await debugManager.dispose();
      consoleSpy.mockRestore();
    });
  });

  describe("getSession", () => {
    it("should return session when it exists", async () => {
      const mockPage = createMockPage();
      const created = await manager.createSession(
        "greet",
        {},
        {},
        mockPage as unknown as Parameters<typeof manager.createSession>[3],
        "widget-123",
        "mcp"
      );

      const retrieved = manager.getSession(created.id);

      expect(retrieved).toBe(created);
    });

    it("should return null when session does not exist", () => {
      const result = manager.getSession("non-existent-id");
      expect(result).toBeNull();
    });
  });

  describe("listSessions", () => {
    it("should return empty array when no sessions", () => {
      const sessions = manager.listSessions();
      expect(sessions).toEqual([]);
    });

    it("should return all sessions with info", async () => {
      const mockPage1 = createMockPage();
      const mockPage2 = createMockPage();

      await manager.createSession(
        "greet",
        {},
        {},
        mockPage1 as unknown as Parameters<typeof manager.createSession>[3],
        "widget-1",
        "mcp"
      );

      await manager.createSession(
        "search",
        {},
        {},
        mockPage2 as unknown as Parameters<typeof manager.createSession>[3],
        "widget-2",
        "openai"
      );

      const sessions = manager.listSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions[0]?.toolName).toBe("greet");
      expect(sessions[0]?.protocol).toBe("mcp");
      expect(sessions[1]?.toolName).toBe("search");
      expect(sessions[1]?.protocol).toBe("openai");
    });

    it("should include log and error counts", async () => {
      type ConsoleMsg = {
        type: () => string;
        text: () => string;
        location: () => { url: string; lineNumber: number };
      };
      type PageErr = { message: string };
      const mockPage = createMockPage();
      let consoleHandler: ((msg: ConsoleMsg) => void) | null = null;
      let errorHandler: ((err: PageErr) => void) | null = null;
      mockPage.on.mockImplementation(
        (event: string, handler: ((msg: ConsoleMsg) => void) | ((err: PageErr) => void)) => {
          if (event === "console") consoleHandler = handler as (msg: ConsoleMsg) => void;
          if (event === "pageerror") errorHandler = handler as (err: PageErr) => void;
        }
      );

      await manager.createSession(
        "greet",
        {},
        {},
        mockPage as unknown as Parameters<typeof manager.createSession>[3],
        "widget-1",
        "mcp"
      );

      // Add some logs and errors
      consoleHandler!({
        type: () => "log",
        text: () => "msg1",
        location: () => ({ url: "", lineNumber: 0 }),
      });
      consoleHandler!({
        type: () => "error",
        text: () => "msg2",
        location: () => ({ url: "", lineNumber: 0 }),
      });
      errorHandler!({ message: "Error 1" });

      const sessions = manager.listSessions();

      expect(sessions[0]?.logCount).toBe(2);
      expect(sessions[0]?.errorCount).toBe(1);
    });
  });

  describe("closeSession", () => {
    it("should close an existing session and return true", async () => {
      const mockPage = createMockPage();
      const session = await manager.createSession(
        "greet",
        {},
        {},
        mockPage as unknown as Parameters<typeof manager.createSession>[3],
        "widget-123",
        "mcp"
      );

      const result = await manager.closeSession(session.id);

      expect(result).toBe(true);
      expect(mockPage.close).toHaveBeenCalled();
      expect(manager.getSession(session.id)).toBeNull();
    });

    it("should return false for non-existent session", async () => {
      const result = await manager.closeSession("non-existent-id");
      expect(result).toBe(false);
    });

    it("should not throw if page is already closed", async () => {
      const mockPage = createMockPage();
      mockPage.isClosed.mockReturnValue(true);

      const session = await manager.createSession(
        "greet",
        {},
        {},
        mockPage as unknown as Parameters<typeof manager.createSession>[3],
        "widget-123",
        "mcp"
      );

      const result = await manager.closeSession(session.id);

      expect(result).toBe(true);
      expect(mockPage.close).not.toHaveBeenCalled();
    });

    it("should handle page close error gracefully", async () => {
      const mockPage = createMockPage();
      mockPage.close.mockRejectedValue(new Error("Page already closed"));

      const session = await manager.createSession(
        "greet",
        {},
        {},
        mockPage as unknown as Parameters<typeof manager.createSession>[3],
        "widget-123",
        "mcp"
      );

      const result = await manager.closeSession(session.id);

      expect(result).toBe(true);
      expect(manager.getSession(session.id)).toBeNull();
    });
  });

  describe("closeAllSessions", () => {
    it("should return 0 when no sessions", async () => {
      const count = await manager.closeAllSessions();
      expect(count).toBe(0);
    });

    it("should close all sessions and return count", async () => {
      const mockPage1 = createMockPage();
      const mockPage2 = createMockPage();

      await manager.createSession(
        "greet",
        {},
        {},
        mockPage1 as unknown as Parameters<typeof manager.createSession>[3],
        "widget-1",
        "mcp"
      );
      await manager.createSession(
        "search",
        {},
        {},
        mockPage2 as unknown as Parameters<typeof manager.createSession>[3],
        "widget-2",
        "openai"
      );

      const count = await manager.closeAllSessions();

      expect(count).toBe(2);
      expect(manager.listSessions()).toEqual([]);
    });
  });

  describe("updateSessionGlobals", () => {
    it("should return false for non-existent session", async () => {
      const result = await manager.updateSessionGlobals("non-existent", {
        theme: "dark",
        locale: "en-US",
        timeZone: "UTC",
        displayMode: "inline",
        viewport: { width: 800, height: 600 },
        safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        userAgent: { device: { type: "desktop" }, capabilities: { hover: true, touch: false } },
      });
      expect(result).toBe(false);
    });

    it("should return false if page is closed", async () => {
      const mockPage = createMockPage();
      mockPage.isClosed.mockReturnValue(true);

      const session = await manager.createSession(
        "greet",
        {},
        {},
        mockPage as unknown as Parameters<typeof manager.createSession>[3],
        "widget-123",
        "mcp"
      );

      const result = await manager.updateSessionGlobals(session.id, {
        theme: "dark",
        locale: "en-US",
        timeZone: "UTC",
        displayMode: "inline",
        viewport: { width: 800, height: 600 },
        safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        userAgent: {},
      });

      expect(result).toBe(false);
    });

    it("should update MCP session globals via postMessage", async () => {
      const mockPage = createMockPage();

      const session = await manager.createSession(
        "greet",
        {},
        {},
        mockPage as unknown as Parameters<typeof manager.createSession>[3],
        "widget-123",
        "mcp"
      );

      const result = await manager.updateSessionGlobals(session.id, {
        theme: "dark",
        locale: "fr-FR",
        timeZone: "Europe/Paris",
        displayMode: "fullscreen",
        viewport: { width: 1024, height: 768 },
        safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        userAgent: { device: { type: "desktop" } },
      });

      expect(result).toBe(true);
      expect(mockPage.evaluate).toHaveBeenCalled();
    });

    it("should update OpenAI session globals via postMessage to iframe", async () => {
      // OpenAI now sends from host page (page.evaluate) to iframe
      // This ensures event.source === window.parent in the widget
      const mockPage = createMockPage();
      const mainFrameObj = { id: "main" };
      mockPage.mainFrame.mockReturnValue(mainFrameObj);
      mockPage.frames.mockReturnValue([mainFrameObj]);

      const session = await manager.createSession(
        "greet",
        {},
        {},
        mockPage as unknown as Parameters<typeof manager.createSession>[3],
        "widget-123",
        "openai"
      );

      const result = await manager.updateSessionGlobals(session.id, {
        theme: "dark",
        locale: "es-ES",
        timeZone: "America/New_York",
        displayMode: "pip",
        viewport: { width: 640, height: 480 },
        maxHeight: 400,
        safeAreaInsets: { top: 20, right: 0, bottom: 34, left: 0 },
        userAgent: { device: { type: "mobile" } },
        userLocation: { city: "New York", country: "US" },
      });

      expect(result).toBe(true);
      // OpenAI now uses page.evaluate (host page) to send to iframe
      expect(mockPage.evaluate).toHaveBeenCalled();
    });

    it("should succeed for OpenAI even without finding widget frame (sends from host)", async () => {
      // With new host-to-iframe approach, we don't need to find the widget frame
      // The message is sent from the host page which finds the iframe by ID
      const debugManager = new WidgetSessionManager({ debug: true });
      const mockPage = createMockPage();
      // Only main frame - but this is fine now since we send from host
      const mainFrameObj = { id: "main" };
      mockPage.mainFrame.mockReturnValue(mainFrameObj);
      mockPage.frames.mockReturnValue([mainFrameObj]);

      const session = await debugManager.createSession(
        "greet",
        {},
        {},
        mockPage as unknown as Parameters<typeof manager.createSession>[3],
        "widget-123",
        "openai"
      );

      const result = await debugManager.updateSessionGlobals(session.id, {
        theme: "dark",
        locale: "en-US",
        timeZone: "UTC",
        displayMode: "inline",
        viewport: { width: 800, height: 600 },
        safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        userAgent: {},
      });

      // Should now succeed since we send from host page to iframe
      expect(result).toBe(true);
      expect(mockPage.evaluate).toHaveBeenCalled();
      await debugManager.dispose();
    });

    it("should handle evaluate error gracefully", async () => {
      const mockPage = createMockPage();
      mockPage.evaluate.mockRejectedValue(new Error("Evaluation failed"));

      const session = await manager.createSession(
        "greet",
        {},
        {},
        mockPage as unknown as Parameters<typeof manager.createSession>[3],
        "widget-123",
        "mcp"
      );

      const result = await manager.updateSessionGlobals(session.id, {
        theme: "dark",
        locale: "en-US",
        timeZone: "UTC",
        displayMode: "inline",
        viewport: { width: 800, height: 600 },
        safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        userAgent: {},
      });

      expect(result).toBe(false);
    });
  });

  describe("updateAllSessionGlobals", () => {
    it("should return 0 when no sessions", async () => {
      const count = await manager.updateAllSessionGlobals({
        theme: "dark",
        locale: "en-US",
        timeZone: "UTC",
        displayMode: "inline",
        viewport: { width: 800, height: 600 },
        safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        userAgent: {},
      });
      expect(count).toBe(0);
    });

    it("should update all sessions and return count", async () => {
      const mockPage1 = createMockPage();
      const mockPage2 = createMockPage();

      await manager.createSession(
        "greet",
        {},
        {},
        mockPage1 as unknown as Parameters<typeof manager.createSession>[3],
        "widget-1",
        "mcp"
      );
      await manager.createSession(
        "search",
        {},
        {},
        mockPage2 as unknown as Parameters<typeof manager.createSession>[3],
        "widget-2",
        "mcp"
      );

      const count = await manager.updateAllSessionGlobals({
        theme: "light",
        locale: "en-US",
        timeZone: "UTC",
        displayMode: "inline",
        viewport: { width: 800, height: 600 },
        safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        userAgent: {},
      });

      expect(count).toBe(2);
    });
  });

  describe("cleanupStaleSessions", () => {
    it("should clean up sessions when manually triggered through dispose", async () => {
      // Use real timers for this test to avoid the infinite loop
      vi.useRealTimers();

      const shortTTLManager = new WidgetSessionManager({ ttl: 100 });
      const mockPage = createMockPage();

      await shortTTLManager.createSession(
        "greet",
        {},
        {},
        mockPage as unknown as Parameters<typeof manager.createSession>[3],
        "widget-123",
        "mcp"
      );

      expect(shortTTLManager.listSessions()).toHaveLength(1);

      // Dispose should close all sessions
      await shortTTLManager.dispose();

      expect(shortTTLManager.listSessions()).toHaveLength(0);

      vi.useFakeTimers();
    });
  });

  describe("dispose", () => {
    it("should clear cleanup interval and close all sessions", async () => {
      const mockPage = createMockPage();

      await manager.createSession(
        "greet",
        {},
        {},
        mockPage as unknown as Parameters<typeof manager.createSession>[3],
        "widget-123",
        "mcp"
      );

      await manager.dispose();

      expect(manager.listSessions()).toHaveLength(0);
    });

    it("should log disposal when debug is enabled", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const debugManager = new WidgetSessionManager({ debug: true });

      await debugManager.dispose();

      expect(consoleSpy).toHaveBeenCalledWith("[WidgetSessionManager] Disposed");
      consoleSpy.mockRestore();
    });
  });
});
