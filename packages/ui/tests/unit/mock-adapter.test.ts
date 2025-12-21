/**
 * Unit tests for Mock adapter
 *
 * Tests the MockAdapter implementation used for development and testing.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockAdapter } from "../../src/adapters/mock";
import type { HostContext } from "../../src/types";

describe("MockAdapter", () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
  });

  describe("connection", () => {
    it("should connect successfully", async () => {
      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);
    });

    it("should not be connected before connect() is called", () => {
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe("host context", () => {
    it("should provide a default host context", async () => {
      await adapter.connect();
      const context = adapter.getHostContext();

      expect(context).toMatchObject({
        theme: expect.stringMatching(/^(light|dark)$/),
        displayMode: "inline",
        locale: expect.any(String),
        platform: "web",
      });
    });

    it("should include viewport information", async () => {
      await adapter.connect();
      const context = adapter.getHostContext();

      expect(context.viewport).toMatchObject({
        width: expect.any(Number),
        height: expect.any(Number),
      });
    });
  });

  describe("tool operations", () => {
    it("should return mock result for callTool", async () => {
      await adapter.connect();
      const result = await adapter.callTool("testTool", { arg: "value" });

      expect(result).toBeDefined();
    });

    it("should log tool calls when called", async () => {
      await adapter.connect();
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await adapter.callTool("greet", { name: "Alice" });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("state management", () => {
    it("should store and retrieve state", async () => {
      await adapter.connect();
      const state = { count: 42, name: "test" };

      adapter.setState(state);
      const retrieved = adapter.getState<typeof state>();

      expect(retrieved).toEqual(state);
    });

    it("should return null when no state is set", async () => {
      await adapter.connect();
      expect(adapter.getState()).toBeNull();
    });

    it("should overwrite previous state", async () => {
      await adapter.connect();
      adapter.setState({ first: true });
      adapter.setState({ second: true });

      expect(adapter.getState()).toEqual({ second: true });
    });
  });

  describe("messaging", () => {
    it("should handle sendMessage without error", async () => {
      await adapter.connect();
      await expect(
        adapter.sendMessage({ type: "text", text: "Hello" })
      ).resolves.toBeUndefined();
    });
  });

  describe("navigation", () => {
    it("should handle openLink without error", async () => {
      await adapter.connect();
      await expect(
        adapter.openLink("https://example.com")
      ).resolves.toBeUndefined();
    });

    it("should return the requested display mode", async () => {
      await adapter.connect();
      const result = await adapter.requestDisplayMode("fullscreen");

      expect(result).toEqual({ mode: "fullscreen" });
    });

    it("should handle requestClose without error", async () => {
      await adapter.connect();
      expect(() => adapter.requestClose()).not.toThrow();
    });
  });

  describe("events", () => {
    it("should allow subscribing to tool results", async () => {
      await adapter.connect();
      const handler = vi.fn();

      const unsubscribe = adapter.onToolResult(handler);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should allow subscribing to host context changes", async () => {
      await adapter.connect();
      const handler = vi.fn();

      const unsubscribe = adapter.onHostContextChange(handler);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should call handler when emitToolResult is called", async () => {
      await adapter.connect();
      const handler = vi.fn();
      adapter.onToolResult(handler);

      // Mock adapter should have a way to emit test events
      adapter.emitToolResult({ greeting: "Hello" });

      expect(handler).toHaveBeenCalledWith({ greeting: "Hello" });
    });
  });

  describe("logging", () => {
    it("should handle log calls", async () => {
      await adapter.connect();
      const consoleSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      adapter.log("debug", { message: "test" });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("resources", () => {
    it("should return empty contents for readResource", async () => {
      await adapter.connect();
      const result = await adapter.readResource("resource://test");

      expect(result.contents).toEqual([]);
    });
  });
});
