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
    it("should reject callTool when not properly connected to parent", async () => {
      await adapter.connect();
      // Without a real parent window, callTool will throw "not connected"
      // because the MCP App instance isn't fully initialized
      await expect(adapter.callTool("test", {})).rejects.toThrow();
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

  // =============================================================================
  // NEW MCP APPS API TESTS
  // =============================================================================

  describe("host capabilities", () => {
    it("should return undefined when not connected", () => {
      const capabilities = adapter.getHostCapabilities();
      expect(capabilities).toBeUndefined();
    });

    it("should have getHostCapabilities method", async () => {
      await adapter.connect();
      expect(typeof adapter.getHostCapabilities).toBe("function");
    });
  });

  describe("host version", () => {
    it("should return undefined when not connected", () => {
      const version = adapter.getHostVersion();
      expect(version).toBeUndefined();
    });

    it("should have getHostVersion method", async () => {
      await adapter.connect();
      expect(typeof adapter.getHostVersion).toBe("function");
    });
  });

  describe("protocol-level logging (sendLog)", () => {
    it("should throw when not connected", async () => {
      await expect(adapter.sendLog("info", { message: "test" })).rejects.toThrow(
        "MCP Apps adapter not connected"
      );
    });

    it("should have sendLog method", async () => {
      await adapter.connect();
      expect(typeof adapter.sendLog).toBe("function");
    });
  });

  describe("size notifications", () => {
    it("should throw when not connected", async () => {
      await expect(adapter.sendSizeChanged({ width: 800, height: 600 })).rejects.toThrow(
        "MCP Apps adapter not connected"
      );
    });

    it("should have sendSizeChanged method", async () => {
      await adapter.connect();
      expect(typeof adapter.sendSizeChanged).toBe("function");
    });
  });

  describe("partial tool input", () => {
    it("should return unsubscribe function for onToolInputPartial", async () => {
      await adapter.connect();
      const handler = vi.fn();
      const unsubscribe = adapter.onToolInputPartial(handler);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should allow multiple handlers", async () => {
      await adapter.connect();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsubscribe1 = adapter.onToolInputPartial(handler1);
      const unsubscribe2 = adapter.onToolInputPartial(handler2);

      expect(typeof unsubscribe1).toBe("function");
      expect(typeof unsubscribe2).toBe("function");

      unsubscribe1();
      unsubscribe2();
    });
  });

  describe("bidirectional tool support", () => {
    it("should have setCallToolHandler method", async () => {
      await adapter.connect();
      expect(typeof adapter.setCallToolHandler).toBe("function");
    });

    it("should have setListToolsHandler method", async () => {
      await adapter.connect();
      expect(typeof adapter.setListToolsHandler).toBe("function");
    });

    it("should register call tool handler without error", async () => {
      await adapter.connect();
      const handler = vi.fn().mockResolvedValue({ result: "success" });

      expect(() => adapter.setCallToolHandler(handler)).not.toThrow();
    });

    it("should register list tools handler without error", async () => {
      await adapter.connect();
      const handler = vi.fn().mockResolvedValue([{ name: "tool1" }]);

      expect(() => adapter.setListToolsHandler(handler)).not.toThrow();
    });
  });
});
