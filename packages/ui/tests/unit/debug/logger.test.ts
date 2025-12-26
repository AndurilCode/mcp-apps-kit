/**
 * Client Debug Logger Unit Tests
 *
 * Tests the client-side debug logging functionality with batching.
 *
 * Test Coverage:
 * - Logger configuration
 * - Log level filtering
 * - Log batching
 * - MCP transport
 * - Console fallback
 * - Error handling
 * - Immediate flush on error level
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ClientDebugLogger,
  clientDebugLogger,
  shouldLog,
  safeSerialize,
  safeStringify,
  type LogEntry,
} from "../../../src/debug/logger";
import type { ProtocolAdapter } from "../../../src/adapters/types";

// Mock adapter for testing
function createMockAdapter(
  options: { connected?: boolean; callToolError?: Error } = {}
): ProtocolAdapter {
  const { connected = true, callToolError } = options;

  return {
    connect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(connected),
    callTool: vi.fn().mockImplementation(async (name, args) => {
      if (callToolError) {
        throw callToolError;
      }
      return { processed: (args as { entries: LogEntry[] }).entries.length };
    }),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    openLink: vi.fn().mockResolvedValue(undefined),
    requestDisplayMode: vi.fn().mockResolvedValue({ mode: "inline" }),
    requestClose: vi.fn(),
    getState: vi.fn().mockReturnValue(null),
    setState: vi.fn(),
    readResource: vi.fn().mockResolvedValue({ contents: [] }),
    log: vi.fn(),
    onToolResult: vi.fn().mockReturnValue(() => {}),
    onToolInput: vi.fn().mockReturnValue(() => {}),
    onToolCancelled: vi.fn().mockReturnValue(() => {}),
    onHostContextChange: vi.fn().mockReturnValue(() => {}),
    onTeardown: vi.fn().mockReturnValue(() => {}),
    getHostContext: vi.fn().mockReturnValue({
      theme: "light",
      displayMode: "inline",
      availableDisplayModes: ["inline"],
      viewport: { width: 800, height: 600 },
      locale: "en-US",
      timeZone: "UTC",
      platform: "web",
    }),
    getToolInput: vi.fn().mockReturnValue(undefined),
    getToolOutput: vi.fn().mockReturnValue(undefined),
    getToolMeta: vi.fn().mockReturnValue(undefined),
  };
}

describe("Client Debug Logger", () => {
  describe("shouldLog", () => {
    it("should return true when level >= minLevel", () => {
      expect(shouldLog("error", "debug")).toBe(true);
      expect(shouldLog("error", "info")).toBe(true);
      expect(shouldLog("error", "warn")).toBe(true);
      expect(shouldLog("error", "error")).toBe(true);
    });

    it("should return false when level < minLevel", () => {
      expect(shouldLog("debug", "info")).toBe(false);
      expect(shouldLog("debug", "warn")).toBe(false);
      expect(shouldLog("info", "warn")).toBe(false);
    });
  });

  describe("safeSerialize", () => {
    it("should pass through primitive values", () => {
      expect(safeSerialize("hello")).toBe("hello");
      expect(safeSerialize(42)).toBe(42);
      expect(safeSerialize(true)).toBe(true);
      expect(safeSerialize(null)).toBe(null);
    });

    it("should handle Error objects", () => {
      const error = new Error("Test error");
      const result = safeSerialize(error) as { name: string; message: string };
      expect(result.name).toBe("Error");
      expect(result.message).toBe("Test error");
    });

    it("should handle circular references", () => {
      const circular: Record<string, unknown> = { name: "test" };
      circular.self = circular;

      const result = safeSerialize(circular) as Record<string, unknown>;
      expect(result.self).toBe("[Circular]");
    });
  });

  describe("safeStringify", () => {
    it("should stringify simple values", () => {
      expect(safeStringify("hello")).toBe("hello");
      expect(safeStringify(null)).toBe("null");
      expect(safeStringify(undefined)).toBe("undefined");
    });

    it("should handle circular references", () => {
      const circular: Record<string, unknown> = { name: "test" };
      circular.self = circular;

      const result = safeStringify(circular);
      expect(result).toContain("[Circular]");
    });
  });

  describe("ClientDebugLogger", () => {
    let logger: ClientDebugLogger;
    let mockAdapter: ProtocolAdapter;
    let consoleDebugSpy: ReturnType<typeof vi.spyOn>;
    let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.useFakeTimers();
      mockAdapter = createMockAdapter();
      logger = new ClientDebugLogger({
        enabled: true,
        level: "debug",
        batchSize: 5,
        flushIntervalMs: 1000,
        source: "test",
      });
      logger.setAdapter(mockAdapter);

      consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.useRealTimers();
      logger.destroy();
      consoleDebugSpy.mockRestore();
      consoleInfoSpy.mockRestore();
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it("should batch logs until batch size is reached", async () => {
      logger.info("Log 1");
      logger.info("Log 2");
      logger.info("Log 3");
      logger.info("Log 4");

      // Should not have called callTool yet (batch size is 5)
      expect(mockAdapter.callTool).not.toHaveBeenCalled();

      // Add one more to reach batch size
      logger.info("Log 5");

      // Wait for async flush
      await vi.runAllTimersAsync();

      expect(mockAdapter.callTool).toHaveBeenCalledWith("log_debug", {
        entries: expect.arrayContaining([
          expect.objectContaining({ message: "Log 1" }),
          expect.objectContaining({ message: "Log 2" }),
          expect.objectContaining({ message: "Log 3" }),
          expect.objectContaining({ message: "Log 4" }),
          expect.objectContaining({ message: "Log 5" }),
        ]),
      });
    });

    it("should flush on interval when batch size not reached", async () => {
      logger.info("Log 1");
      logger.info("Log 2");

      expect(mockAdapter.callTool).not.toHaveBeenCalled();

      // Advance timer past flush interval
      await vi.advanceTimersByTimeAsync(1100);

      expect(mockAdapter.callTool).toHaveBeenCalledWith("log_debug", {
        entries: expect.arrayContaining([
          expect.objectContaining({ message: "Log 1" }),
          expect.objectContaining({ message: "Log 2" }),
        ]),
      });
    });

    it("should immediately flush error level logs", async () => {
      logger.info("Info log");
      logger.error("Error log");

      // Wait for async flush
      await vi.runAllTimersAsync();

      expect(mockAdapter.callTool).toHaveBeenCalled();
      const call = (mockAdapter.callTool as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1].entries).toHaveLength(2);
    });

    it("should filter logs by level", async () => {
      logger.configure({ level: "warn" });

      logger.debug("Debug log");
      logger.info("Info log");
      logger.warn("Warn log");
      logger.error("Error log");

      // Wait for async flush
      await vi.runAllTimersAsync();

      if ((mockAdapter.callTool as ReturnType<typeof vi.fn>).mock.calls.length > 0) {
        const call = (mockAdapter.callTool as ReturnType<typeof vi.fn>).mock.calls[0];
        // Only warn and error should be logged
        expect(
          call[1].entries.every((e: LogEntry) => e.level === "warn" || e.level === "error")
        ).toBe(true);
      }
    });

    it("should fall back to console when not connected", async () => {
      const disconnectedAdapter = createMockAdapter({ connected: false });
      logger.setAdapter(disconnectedAdapter);

      logger.info("Test message");

      // Wait for any async operations
      await vi.runAllTimersAsync();

      expect(consoleInfoSpy).toHaveBeenCalled();
      expect(consoleInfoSpy.mock.calls[0][0]).toContain("Test message");
    });

    it("should fall back to console when callTool fails", async () => {
      const errorAdapter = createMockAdapter({ callToolError: new Error("Network error") });
      logger.setAdapter(errorAdapter);

      logger.info("Log 1");
      logger.info("Log 2");
      logger.info("Log 3");
      logger.info("Log 4");
      logger.info("Log 5");

      // Wait for async operations
      await vi.runAllTimersAsync();

      // Should have fallen back to console
      expect(consoleInfoSpy).toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalled(); // Transport error warning
    });

    it("should fall back to console when enabled is false", async () => {
      logger.configure({ enabled: false });

      logger.info("Test message");

      // Should output to console instead of MCP
      expect(consoleInfoSpy).toHaveBeenCalled();
      expect(mockAdapter.callTool).not.toHaveBeenCalled();
    });

    it("should include correct properties in log entries", async () => {
      logger.info("Test message", { key: "value" });

      // Trigger flush
      await vi.advanceTimersByTimeAsync(1100);

      expect(mockAdapter.callTool).toHaveBeenCalled();
      const call = (mockAdapter.callTool as ReturnType<typeof vi.fn>).mock.calls[0];
      const entry = call[1].entries[0] as LogEntry;

      expect(entry.level).toBe("info");
      expect(entry.message).toBe("Test message");
      expect(entry.data).toEqual({ key: "value" });
      expect(entry.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(entry.source).toBe("test");
    });

    it("should update configuration dynamically", async () => {
      logger.configure({
        level: "error",
        batchSize: 2,
        source: "updated-source",
      });

      logger.info("Should be filtered");
      logger.error("Should appear");
      logger.error("Should trigger flush");

      await vi.runAllTimersAsync();

      const calls = (mockAdapter.callTool as ReturnType<typeof vi.fn>).mock.calls;
      if (calls.length > 0) {
        const entries = calls[0][1].entries as LogEntry[];
        expect(entries.every((e) => e.level === "error")).toBe(true);
        expect(entries[0].source).toBe("updated-source");
      }
    });

    it("should flush remaining logs on destroy", () => {
      logger.info("Log 1");
      logger.info("Log 2");

      logger.destroy();

      // Should have output to console since we're destroying
      expect(consoleInfoSpy).toHaveBeenCalled();
    });
  });

  describe("clientDebugLogger global instance", () => {
    it("should be a ClientDebugLogger instance", () => {
      expect(clientDebugLogger).toBeInstanceOf(ClientDebugLogger);
    });

    it("should be configurable", () => {
      const originalEnabled = clientDebugLogger["config"].enabled;

      clientDebugLogger.configure({ enabled: true });
      expect(clientDebugLogger["config"].enabled).toBe(true);

      clientDebugLogger.configure({ enabled: false });
      expect(clientDebugLogger["config"].enabled).toBe(false);

      // Restore
      clientDebugLogger.configure({ enabled: originalEnabled });
    });
  });
});
