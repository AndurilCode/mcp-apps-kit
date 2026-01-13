/**
 * Unit tests for OpenAI/ChatGPT adapter
 *
 * Tests the OpenAIAdapter implementation for ChatGPT Apps.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenAIAdapter } from "../../src/adapters/openai";

describe("OpenAIAdapter", () => {
  let adapter: OpenAIAdapter;

  beforeEach(() => {
    adapter = new OpenAIAdapter();
  });

  describe("connection", () => {
    it("should be constructable", () => {
      expect(adapter).toBeInstanceOf(OpenAIAdapter);
    });

    it("should not be connected before connect() is called", () => {
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe("state management", () => {
    it("should store and retrieve state", async () => {
      await adapter.connect();
      const state = { count: 42 };

      adapter.setState(state);
      expect(adapter.getState()).toEqual(state);
    });

    it("should return null when no state is set", async () => {
      await adapter.connect();
      expect(adapter.getState()).toBeNull();
    });
  });

  describe("host context", () => {
    it("should provide default host context", async () => {
      await adapter.connect();
      const context = adapter.getHostContext();

      expect(context).toMatchObject({
        theme: expect.stringMatching(/^(light|dark)$/),
        displayMode: expect.any(String),
        platform: expect.any(String),
      });
    });
  });

  describe("event subscriptions", () => {
    it("should return unsubscribe function for onToolResult", async () => {
      await adapter.connect();
      const handler = vi.fn();
      const unsubscribe = adapter.onToolResult(handler);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should return unsubscribe function for onHostContextChange", async () => {
      await adapter.connect();
      const handler = vi.fn();
      const unsubscribe = adapter.onHostContextChange(handler);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should return unsubscribe function for onToolInput", async () => {
      await adapter.connect();
      const handler = vi.fn();
      const unsubscribe = adapter.onToolInput(handler);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should return unsubscribe function for onToolCancelled", async () => {
      await adapter.connect();
      const handler = vi.fn();
      const unsubscribe = adapter.onToolCancelled(handler);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should return unsubscribe function for onTeardown", async () => {
      await adapter.connect();
      const handler = vi.fn();
      const unsubscribe = adapter.onTeardown(handler);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });
  });

  describe("logging", () => {
    it("should log to console", async () => {
      await adapter.connect();
      const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});

      adapter.log("info", { message: "test" });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("file operations", () => {
    it("should have uploadFile method defined", async () => {
      await adapter.connect();
      expect(typeof adapter.uploadFile).toBe("function");
    });

    it("should have getFileDownloadUrl method defined", async () => {
      await adapter.connect();
      expect(typeof adapter.getFileDownloadUrl).toBe("function");
    });
  });

  // =============================================================================
  // NEW MCP APPS API TESTS
  // =============================================================================

  describe("host capabilities", () => {
    it("should return ChatGPT capabilities", async () => {
      await adapter.connect();
      const capabilities = adapter.getHostCapabilities();

      expect(capabilities).toBeDefined();
      // Common capabilities - always available
      expect(capabilities).toMatchObject({
        openLinks: expect.any(Object),
        logging: expect.any(Object),
        theming: expect.objectContaining({
          themes: expect.arrayContaining(["light", "dark"]),
        }),
        displayModes: expect.objectContaining({
          modes: expect.arrayContaining(["inline", "fullscreen", "pip"]),
        }),
        statePersistence: expect.objectContaining({
          persistent: false,
        }),
      });
      // ChatGPT-specific capabilities are dynamically detected from runtime
      // In test environment without real SDK, these may be undefined
      // We just verify the method returns without error
    });

    it("should detect fileUpload capability when SDK provides uploadFile", async () => {
      // Mock window.openai with uploadFile
      const mockOpenAI = {
        uploadFile: vi.fn(),
      };
      Object.defineProperty(window, "openai", {
        value: mockOpenAI,
        writable: true,
        configurable: true,
      });

      await adapter.connect();
      const capabilities = adapter.getHostCapabilities();

      expect(capabilities?.fileUpload).toBeDefined();

      // Cleanup
      // @ts-expect-error - cleaning up mock
      delete window.openai;
    });
  });

  describe("host version", () => {
    it("should return undefined (not exposed by ChatGPT)", async () => {
      await adapter.connect();
      const version = adapter.getHostVersion();

      expect(version).toBeUndefined();
    });
  });

  describe("protocol-level logging (sendLog)", () => {
    it("should map to adapter log method", async () => {
      await adapter.connect();
      const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});

      await adapter.sendLog("info", { message: "test" });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should accept all log levels", async () => {
      await adapter.connect();
      const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      vi.spyOn(console, "debug").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});

      const levels = [
        "debug",
        "info",
        "notice",
        "warning",
        "error",
        "critical",
        "alert",
        "emergency",
      ] as const;

      for (const level of levels) {
        await expect(adapter.sendLog(level, { level })).resolves.toBeUndefined();
      }

      consoleSpy.mockRestore();
    });
  });

  describe("sendLogs batch logging", () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    let consoleInfoSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ processed: 2 }),
      });
      vi.stubGlobal("fetch", fetchMock);
      consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      consoleInfoSpy.mockRestore();
    });

    it("should send logs to API endpoint when configured", async () => {
      await adapter.connect();
      adapter.configureLogging({
        transport: "api",
        apiEndpoint: "https://example.com/api/logs",
      });

      const entries = [
        { level: "info" as const, message: "Log 1", timestamp: new Date().toISOString() },
        { level: "error" as const, message: "Log 2", timestamp: new Date().toISOString() },
      ];

      const result = await adapter.sendLogs(entries);

      expect(fetchMock).toHaveBeenCalledWith(
        "https://example.com/api/logs",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
      expect(result.processed).toBe(2);
    });

    it("should fall back to console when API fails", async () => {
      await adapter.connect();
      adapter.configureLogging({
        transport: "api",
        apiEndpoint: "https://example.com/api/logs",
      });

      fetchMock.mockRejectedValueOnce(new Error("Network error"));

      const entries = [
        { level: "info" as const, message: "Log 1", timestamp: new Date().toISOString() },
      ];

      const result = await adapter.sendLogs(entries);

      expect(result.processed).toBe(1); // Fell back to console
      expect(consoleInfoSpy).toHaveBeenCalled();
    });

    it("should fall back to console when no API endpoint configured", async () => {
      await adapter.connect();
      adapter.configureLogging({
        transport: "api",
        apiEndpoint: undefined,
      });

      const entries = [
        { level: "info" as const, message: "Log 1", timestamp: new Date().toISOString() },
      ];

      const result = await adapter.sendLogs(entries);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.processed).toBe(1);
    });

    it("should reset failure state when transport changes", async () => {
      await adapter.connect();
      adapter.configureLogging({
        transport: "api",
        apiEndpoint: "https://example.com/api/logs",
      });

      // First call fails
      fetchMock.mockRejectedValueOnce(new Error("Network error"));
      await adapter.sendLogs([
        { level: "info" as const, message: "Log 1", timestamp: new Date().toISOString() },
      ]);

      // Change transport and back - should reset failure state
      adapter.configureLogging({ transport: "tool" });
      adapter.configureLogging({ transport: "api" });

      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ processed: 1 }),
      });

      await adapter.sendLogs([
        { level: "info" as const, message: "Log 2", timestamp: new Date().toISOString() },
      ]);

      // Should try API again
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe("size notifications", () => {
    it("should have sendSizeChanged method", async () => {
      await adapter.connect();
      expect(typeof adapter.sendSizeChanged).toBe("function");
    });

    it("should handle sendSizeChanged without error when no OpenAI SDK", async () => {
      await adapter.connect();
      // Without the actual OpenAI SDK, this should be a no-op
      await expect(adapter.sendSizeChanged({ width: 800, height: 600 })).resolves.toBeUndefined();
    });
  });

  describe("partial tool input", () => {
    it("should return unsubscribe function for onToolInputPartial", async () => {
      await adapter.connect();
      const consoleSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      const handler = vi.fn();
      const unsubscribe = adapter.onToolInputPartial(handler);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
      consoleSpy.mockRestore();
    });

    it("should log that partial input is not supported", async () => {
      await adapter.connect();
      const consoleSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      adapter.onToolInputPartial(vi.fn());

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("bidirectional tool support", () => {
    it("should have setCallToolHandler method (no-op)", async () => {
      await adapter.connect();
      const consoleSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      const handler = vi.fn();
      expect(() => adapter.setCallToolHandler(handler)).not.toThrow();

      consoleSpy.mockRestore();
    });

    it("should have setListToolsHandler method (no-op)", async () => {
      await adapter.connect();
      const consoleSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      const handler = vi.fn();
      expect(() => adapter.setListToolsHandler(handler)).not.toThrow();

      consoleSpy.mockRestore();
    });

    it("should log that bidirectional tools are not supported", async () => {
      await adapter.connect();
      const consoleSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      adapter.setCallToolHandler(vi.fn());
      adapter.setListToolsHandler(vi.fn());

      expect(consoleSpy).toHaveBeenCalledTimes(2);
      consoleSpy.mockRestore();
    });
  });

  // =============================================================================
  // ext-apps v0.4.0 API TESTS
  // =============================================================================

  describe("updateModelContext (ext-apps v0.4.0+)", () => {
    it("should call setState (which calls setWidgetState) with structured content", async () => {
      const mockSetWidgetState = vi.fn();
      const mockOpenAI = {
        setWidgetState: mockSetWidgetState,
      };
      Object.defineProperty(window, "openai", {
        value: mockOpenAI,
        writable: true,
        configurable: true,
      });

      await adapter.connect();

      await adapter.updateModelContext({
        structuredContent: { itemCount: 3, total: 150 },
      });

      // setState internally calls setWidgetState
      expect(mockSetWidgetState).toHaveBeenCalledWith({
        _type: "modelContext",
        itemCount: 3,
        total: 150,
      });

      // Cleanup
      // @ts-expect-error - cleaning up mock
      delete window.openai;
    });

    it("should include text content in model context", async () => {
      const mockSetWidgetState = vi.fn();
      const mockOpenAI = {
        setWidgetState: mockSetWidgetState,
      };
      Object.defineProperty(window, "openai", {
        value: mockOpenAI,
        writable: true,
        configurable: true,
      });

      await adapter.connect();

      await adapter.updateModelContext({
        content: [
          { type: "text", text: "Line 1" },
          { type: "text", text: "Line 2" },
        ],
      });

      expect(mockSetWidgetState).toHaveBeenCalledWith({
        _type: "modelContext",
        _textContent: "Line 1\nLine 2",
      });

      // Cleanup
      // @ts-expect-error - cleaning up mock
      delete window.openai;
    });

    it("should work without OpenAI SDK (graceful no-op for setWidgetState)", async () => {
      await adapter.connect();

      // Should not throw - setState internally handles missing SDK gracefully
      await expect(
        adapter.updateModelContext({
          structuredContent: { test: true },
        })
      ).resolves.toBeUndefined();

      // The state is stored locally even without SDK
      expect(adapter.getState()).toEqual({
        _type: "modelContext",
        test: true,
      });
    });
  });
});
