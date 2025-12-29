/**
 * Unit tests for Mock adapter
 *
 * Tests the MockAdapter implementation used for development and testing.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockAdapter } from "../../src/adapters/mock";
import type { HostContext, HostCapabilities, HostVersion } from "../../src/types";

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
      await expect(adapter.sendMessage({ type: "text", text: "Hello" })).resolves.toBeUndefined();
    });
  });

  describe("navigation", () => {
    it("should handle openLink without error", async () => {
      await adapter.connect();
      await expect(adapter.openLink("https://example.com")).resolves.toBeUndefined();
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

  // =============================================================================
  // NEW MCP APPS API TESTS
  // =============================================================================

  describe("host capabilities", () => {
    it("should return default host capabilities", async () => {
      await adapter.connect();
      const capabilities = adapter.getHostCapabilities();

      expect(capabilities).toBeDefined();
      expect(capabilities).toMatchObject({
        logging: expect.any(Object),
        openLinks: expect.any(Object),
        serverTools: expect.objectContaining({ listChanged: expect.any(Boolean) }),
        serverResources: expect.objectContaining({ listChanged: expect.any(Boolean) }),
      });
    });

    it("should allow setting mock host capabilities", async () => {
      await adapter.connect();
      const customCapabilities: Partial<HostCapabilities> = {
        logging: {},
        serverTools: { listChanged: true },
      };

      adapter.setMockHostCapabilities(customCapabilities);
      const capabilities = adapter.getHostCapabilities();

      expect(capabilities?.serverTools?.listChanged).toBe(true);
    });
  });

  describe("host version", () => {
    it("should return default host version", async () => {
      await adapter.connect();
      const version = adapter.getHostVersion();

      expect(version).toBeDefined();
      expect(version).toMatchObject({
        name: expect.any(String),
        version: expect.any(String),
      });
    });

    it("should allow setting mock host version", async () => {
      await adapter.connect();
      const customVersion: HostVersion = {
        name: "TestHost",
        version: "2.0.0",
      };

      adapter.setMockHostVersion(customVersion);
      const version = adapter.getHostVersion();

      expect(version).toEqual(customVersion);
    });
  });

  describe("protocol-level logging (sendLog)", () => {
    it("should handle sendLog calls", async () => {
      await adapter.connect();
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await adapter.sendLog("info", { message: "test log" });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should accept all log levels", async () => {
      await adapter.connect();
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

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
    it("should handle sendSizeChanged calls", async () => {
      await adapter.connect();
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await adapter.sendSizeChanged({ width: 800, height: 600 });

      expect(consoleSpy).toHaveBeenCalledWith(
        "[MockAdapter] sendSizeChanged:",
        { width: 800, height: 600 }
      );
      consoleSpy.mockRestore();
    });
  });

  describe("partial tool input", () => {
    it("should allow subscribing to partial tool input", async () => {
      await adapter.connect();
      const handler = vi.fn();

      const unsubscribe = adapter.onToolInputPartial(handler);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should call handler when emitToolInputPartial is called", async () => {
      await adapter.connect();
      const handler = vi.fn();
      adapter.onToolInputPartial(handler);

      adapter.emitToolInputPartial({ partial: "data" });

      expect(handler).toHaveBeenCalledWith({ partial: "data" });
    });

    it("should unsubscribe correctly", async () => {
      await adapter.connect();
      const handler = vi.fn();

      const unsubscribe = adapter.onToolInputPartial(handler);
      unsubscribe();

      adapter.emitToolInputPartial({ partial: "data" });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("bidirectional tool support", () => {
    describe("setCallToolHandler", () => {
      it("should register a call tool handler", async () => {
        await adapter.connect();
        const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

        const handler = vi.fn().mockResolvedValue({ result: "success" });
        adapter.setCallToolHandler(handler);

        expect(consoleSpy).toHaveBeenCalledWith(
          "[MockAdapter] setCallToolHandler: handler registered"
        );
        consoleSpy.mockRestore();
      });

      it("should call registered handler via simulateHostToolCall", async () => {
        await adapter.connect();
        const handler = vi.fn().mockResolvedValue({ greeting: "Hello, World!" });
        adapter.setCallToolHandler(handler);

        const result = await adapter.simulateHostToolCall("greet", { name: "World" });

        expect(handler).toHaveBeenCalledWith("greet", { name: "World" });
        expect(result).toEqual({ greeting: "Hello, World!" });
      });

      it("should throw if no handler is registered", async () => {
        await adapter.connect();

        await expect(
          adapter.simulateHostToolCall("greet", { name: "World" })
        ).rejects.toThrow("No call tool handler registered");
      });
    });

    describe("setListToolsHandler", () => {
      it("should register a list tools handler", async () => {
        await adapter.connect();
        const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

        const handler = vi.fn().mockResolvedValue([{ name: "tool1" }]);
        adapter.setListToolsHandler(handler);

        expect(consoleSpy).toHaveBeenCalledWith(
          "[MockAdapter] setListToolsHandler: handler registered"
        );
        consoleSpy.mockRestore();
      });

      it("should call registered handler via simulateHostListTools", async () => {
        await adapter.connect();
        const tools = [
          { name: "greet", description: "Greet someone" },
          { name: "add", description: "Add numbers" },
        ];
        const handler = vi.fn().mockResolvedValue(tools);
        adapter.setListToolsHandler(handler);

        const result = await adapter.simulateHostListTools();

        expect(handler).toHaveBeenCalled();
        expect(result).toEqual(tools);
      });

      it("should return empty tools if no handler is registered", async () => {
        await adapter.connect();

        const result = await adapter.simulateHostListTools();

        expect(result).toEqual({ tools: [] });
      });
    });
  });
});
