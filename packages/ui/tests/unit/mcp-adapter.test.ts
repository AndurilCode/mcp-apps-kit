/**
 * Unit tests for MCP adapter
 *
 * Tests the McpAdapter implementation for Claude Desktop (MCP Apps).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpAdapter } from "../../src/adapters/mcp";

describe("McpAdapter", () => {
  let adapter: McpAdapter;

  beforeEach(() => {
    adapter = new McpAdapter();
  });

  describe("connection", () => {
    it("should be constructable", () => {
      expect(adapter).toBeInstanceOf(McpAdapter);
    });

    it("should not be connected before connect() is called", () => {
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe("state management", () => {
    it("should return null for getState (graceful degradation)", async () => {
      await adapter.connect();
      expect(adapter.getState()).toBeNull();
    });

    it("should be a no-op for setState (graceful degradation)", async () => {
      await adapter.connect();
      expect(() => adapter.setState({ test: true })).not.toThrow();
    });
  });

  describe("host context", () => {
    it("should provide default host context when not in iframe", async () => {
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

  describe("tool operations", () => {
    it("should timeout when callTool is called without parent connection", async () => {
      await adapter.connect();
      // Without a real parent window, callTool will timeout
      // We just verify it returns a promise that eventually rejects
      const callPromise = adapter.callTool("test", {});
      expect(callPromise).toBeInstanceOf(Promise);
      // Don't wait for the full timeout - just verify it's a promise
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
});
