/**
 * Unit tests for OpenAI/ChatGPT adapter
 *
 * Tests the OpenAIAdapter implementation for ChatGPT Apps.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
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
    it("should return minimal capabilities", async () => {
      await adapter.connect();
      const capabilities = adapter.getHostCapabilities();

      expect(capabilities).toBeDefined();
      expect(capabilities).toMatchObject({
        openLinks: expect.any(Object),
      });
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
});
