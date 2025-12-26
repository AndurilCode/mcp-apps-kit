/**
 * Debug Logger Unit Tests
 *
 * Tests the server-side debug logging functionality.
 *
 * Test Coverage:
 * - Logger configuration
 * - Log level filtering
 * - Log entry creation
 * - Circular reference handling
 * - Output handler customization
 * - Log entry processing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DebugLogger,
  debugLogger,
  configureDebugLogger,
  shouldLog,
  safeStringify,
  safeSerialize,
  consoleOutputHandler,
  type LogEntry,
} from "../../../src/debug/logger";

describe("Debug Logger", () => {
  describe("shouldLog", () => {
    it("should return true when level >= minLevel", () => {
      expect(shouldLog("error", "debug")).toBe(true);
      expect(shouldLog("error", "info")).toBe(true);
      expect(shouldLog("error", "warn")).toBe(true);
      expect(shouldLog("error", "error")).toBe(true);

      expect(shouldLog("warn", "debug")).toBe(true);
      expect(shouldLog("warn", "info")).toBe(true);
      expect(shouldLog("warn", "warn")).toBe(true);

      expect(shouldLog("info", "debug")).toBe(true);
      expect(shouldLog("info", "info")).toBe(true);

      expect(shouldLog("debug", "debug")).toBe(true);
    });

    it("should return false when level < minLevel", () => {
      expect(shouldLog("debug", "info")).toBe(false);
      expect(shouldLog("debug", "warn")).toBe(false);
      expect(shouldLog("debug", "error")).toBe(false);

      expect(shouldLog("info", "warn")).toBe(false);
      expect(shouldLog("info", "error")).toBe(false);

      expect(shouldLog("warn", "error")).toBe(false);
    });
  });

  describe("safeStringify", () => {
    it("should stringify simple values", () => {
      expect(safeStringify("hello")).toBe("hello");
      expect(safeStringify(42)).toBe("42");
      expect(safeStringify(null)).toBe("null");
      expect(safeStringify(undefined)).toBe("undefined");
    });

    it("should stringify objects", () => {
      const result = safeStringify({ name: "test", value: 42 });
      expect(result).toContain("name");
      expect(result).toContain("test");
      expect(result).toContain("42");
    });

    it("should handle Error objects", () => {
      const error = new Error("Test error");
      const result = safeStringify(error);
      expect(result).toContain("Test error");
      expect(result).toContain("Error");
    });

    it("should handle circular references", () => {
      const circular: Record<string, unknown> = { name: "test" };
      circular.self = circular;

      const result = safeStringify(circular);
      expect(result).toContain("[Circular]");
    });
  });

  describe("safeSerialize", () => {
    it("should pass through primitive values", () => {
      expect(safeSerialize("hello")).toBe("hello");
      expect(safeSerialize(42)).toBe(42);
      expect(safeSerialize(true)).toBe(true);
      expect(safeSerialize(null)).toBe(null);
      expect(safeSerialize(undefined)).toBe(undefined);
    });

    it("should serialize objects", () => {
      const obj = { name: "test", value: 42 };
      const result = safeSerialize(obj);
      expect(result).toEqual(obj);
    });

    it("should serialize Error objects", () => {
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

  describe("DebugLogger", () => {
    let logger: DebugLogger;
    let outputEntries: LogEntry[];

    beforeEach(() => {
      outputEntries = [];
      const mockHandler = (entry: LogEntry) => {
        outputEntries.push(entry);
      };
      logger = new DebugLogger({ level: "debug" }, mockHandler, "test");
    });

    it("should create log entries with correct properties", () => {
      logger.info("Test message", { key: "value" });

      expect(outputEntries).toHaveLength(1);
      expect(outputEntries[0].level).toBe("info");
      expect(outputEntries[0].message).toBe("Test message");
      expect(outputEntries[0].data).toEqual({ key: "value" });
      expect(outputEntries[0].timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(outputEntries[0].source).toBe("test");
    });

    it("should filter logs by level", () => {
      logger.setLevel("warn");

      logger.debug("Debug message");
      logger.info("Info message");
      logger.warn("Warn message");
      logger.error("Error message");

      expect(outputEntries).toHaveLength(2);
      expect(outputEntries[0].level).toBe("warn");
      expect(outputEntries[1].level).toBe("error");
    });

    it("should log at all levels when set to debug", () => {
      logger.setLevel("debug");

      logger.debug("Debug message");
      logger.info("Info message");
      logger.warn("Warn message");
      logger.error("Error message");

      expect(outputEntries).toHaveLength(4);
    });

    it("should only log errors when set to error level", () => {
      logger.setLevel("error");

      logger.debug("Debug message");
      logger.info("Info message");
      logger.warn("Warn message");
      logger.error("Error message");

      expect(outputEntries).toHaveLength(1);
      expect(outputEntries[0].level).toBe("error");
    });

    it("should process log entries from external source", () => {
      const entries: LogEntry[] = [
        { level: "info", message: "External log 1", timestamp: new Date().toISOString() },
        { level: "error", message: "External log 2", timestamp: new Date().toISOString() },
        { level: "debug", message: "External log 3", timestamp: new Date().toISOString() },
      ];

      const processed = logger.processEntries(entries);

      expect(processed).toBe(3);
      expect(outputEntries).toHaveLength(3);
    });

    it("should filter processed entries by level", () => {
      logger.setLevel("error");

      const entries: LogEntry[] = [
        { level: "info", message: "External log 1", timestamp: new Date().toISOString() },
        { level: "error", message: "External log 2", timestamp: new Date().toISOString() },
        { level: "debug", message: "External log 3", timestamp: new Date().toISOString() },
      ];

      const processed = logger.processEntries(entries);

      expect(processed).toBe(1);
      expect(outputEntries).toHaveLength(1);
      expect(outputEntries[0].level).toBe("error");
    });
  });

  describe("consoleOutputHandler", () => {
    let consoleDebugSpy: ReturnType<typeof vi.spyOn>;
    let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleDebugSpy.mockRestore();
      consoleInfoSpy.mockRestore();
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it("should output debug messages to console.debug", () => {
      consoleOutputHandler({
        level: "debug",
        message: "Debug message",
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(consoleDebugSpy).toHaveBeenCalled();
      expect(consoleDebugSpy.mock.calls[0][0]).toContain("DEBUG");
      expect(consoleDebugSpy.mock.calls[0][0]).toContain("Debug message");
    });

    it("should output info messages to console.info", () => {
      consoleOutputHandler({
        level: "info",
        message: "Info message",
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(consoleInfoSpy).toHaveBeenCalled();
      expect(consoleInfoSpy.mock.calls[0][0]).toContain("INFO");
    });

    it("should output warn messages to console.warn", () => {
      consoleOutputHandler({
        level: "warn",
        message: "Warn message",
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleWarnSpy.mock.calls[0][0]).toContain("WARN");
    });

    it("should output error messages to console.error", () => {
      consoleOutputHandler({
        level: "error",
        message: "Error message",
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("ERROR");
    });

    it("should include source in output when present", () => {
      consoleOutputHandler({
        level: "info",
        message: "Message",
        timestamp: "2025-01-01T00:00:00.000Z",
        source: "my-app",
      });

      expect(consoleInfoSpy.mock.calls[0][0]).toContain("[my-app]");
    });

    it("should include data in output when present", () => {
      consoleOutputHandler({
        level: "info",
        message: "Message",
        timestamp: "2025-01-01T00:00:00.000Z",
        data: { key: "value" },
      });

      expect(consoleInfoSpy.mock.calls[0][0]).toContain("key");
      expect(consoleInfoSpy.mock.calls[0][0]).toContain("value");
    });
  });

  describe("configureDebugLogger", () => {
    it("should configure the global debug logger", () => {
      const originalLevel = debugLogger["minLevel"];

      configureDebugLogger({ level: "debug" });
      expect(debugLogger["minLevel"]).toBe("debug");

      configureDebugLogger({ level: "error" });
      expect(debugLogger["minLevel"]).toBe("error");

      // Restore
      debugLogger.setLevel(originalLevel);
    });
  });
});
