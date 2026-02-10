/**
 * Logger module tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger, defaultLogger } from "../src/debug/logger";
import type { LogLevel } from "../src/debug/logger";

describe("createLogger", () => {
  const originalEnv = process.env.MCP_APPS_LOG_LEVEL;

  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalEnv === undefined) {
      delete process.env.MCP_APPS_LOG_LEVEL;
    } else {
      process.env.MCP_APPS_LOG_LEVEL = originalEnv;
    }
  });

  it("exports defaultLogger instance", () => {
    expect(defaultLogger).toBeDefined();
    expect(typeof defaultLogger.info).toBe("function");
    expect(typeof defaultLogger.debug).toBe("function");
    expect(typeof defaultLogger.warn).toBe("function");
    expect(typeof defaultLogger.error).toBe("function");
  });

  it("includes timestamp and source prefix in output", () => {
    const logger = createLogger("test-source");
    logger.info("hello");

    expect(console.info).toHaveBeenCalledOnce();
    const prefix = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    // Timestamp: ISO format
    expect(prefix).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Level
    expect(prefix).toContain("[INFO]");
    // Source
    expect(prefix).toContain("[test-source]");
  });

  it("default level is info — suppresses debug", () => {
    delete process.env.MCP_APPS_LOG_LEVEL;
    const logger = createLogger("s");
    logger.debug("hidden");
    logger.info("shown");
    expect(console.debug).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledOnce();
  });

  it("respects MCP_APPS_LOG_LEVEL=debug", () => {
    process.env.MCP_APPS_LOG_LEVEL = "debug";
    const logger = createLogger("s");
    logger.debug("visible");
    expect(console.debug).toHaveBeenCalledOnce();
  });

  it("respects MCP_APPS_LOG_LEVEL=error — suppresses info and warn", () => {
    process.env.MCP_APPS_LOG_LEVEL = "error";
    const logger = createLogger("s");
    logger.info("no");
    logger.warn("no");
    logger.error("yes");
    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledOnce();
  });

  it("silent level suppresses everything", () => {
    process.env.MCP_APPS_LOG_LEVEL = "silent";
    const logger = createLogger("s");
    logger.debug("no");
    logger.info("no");
    logger.warn("no");
    logger.error("no");
    expect(console.debug).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("falls back to info for invalid MCP_APPS_LOG_LEVEL", () => {
    process.env.MCP_APPS_LOG_LEVEL = "GARBAGE";
    const logger = createLogger("s");
    logger.debug("hidden");
    logger.info("shown");
    expect(console.debug).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledOnce();
  });

  it("passes additional arguments through", () => {
    const logger = createLogger("s");
    const obj = { foo: 1 };
    logger.warn("msg", obj, 42);
    const args = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[1]).toBe("msg");
    expect(args[2]).toBe(obj);
    expect(args[3]).toBe(42);
  });
});
