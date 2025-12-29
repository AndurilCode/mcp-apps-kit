/**
 * Contract tests for createClient
 *
 * Tests the public API contract for the unified client.
 */

import { describe, it, expect, vi } from "vitest";
import { createClient, detectProtocol } from "../../src/index";
import type { AppsClient, ToolDefs, HostCapabilities, HostVersion } from "../../src/types";

describe("createClient contract", () => {
  describe("detectProtocol", () => {
    it("should be exported from the package", () => {
      expect(typeof detectProtocol).toBe("function");
    });

    it("should return a valid protocol type", () => {
      const result = detectProtocol();
      expect(["mcp", "openai", "mock"]).toContain(result);
    });
  });

  describe("createClient", () => {
    it("should be exported from the package", () => {
      expect(typeof createClient).toBe("function");
    });

    it("should return a promise", () => {
      const result = createClient({ forceAdapter: "mock" });
      expect(result).toBeInstanceOf(Promise);
    });

    it("should create a client with mock adapter", async () => {
      const client = await createClient({ forceAdapter: "mock" });

      expect(client).toBeDefined();
      expect(typeof client.callTool).toBe("function");
      expect(typeof client.sendMessage).toBe("function");
      expect(typeof client.openLink).toBe("function");
    });

    it("should have all required methods on the client", async () => {
      const client = await createClient({ forceAdapter: "mock" });

      // Tool operations
      expect(typeof client.callTool).toBe("function");

      // Messaging
      expect(typeof client.sendMessage).toBe("function");
      expect(typeof client.sendFollowUpMessage).toBe("function");

      // Navigation
      expect(typeof client.openLink).toBe("function");
      expect(typeof client.requestDisplayMode).toBe("function");
      expect(typeof client.requestClose).toBe("function");

      // State
      expect(typeof client.getState).toBe("function");
      expect(typeof client.setState).toBe("function");

      // Resources
      expect(typeof client.readResource).toBe("function");

      // Logging
      expect(typeof client.log).toBe("function");

      // Events
      expect(typeof client.onToolResult).toBe("function");
      expect(typeof client.onToolInput).toBe("function");
      expect(typeof client.onToolCancelled).toBe("function");
      expect(typeof client.onHostContextChange).toBe("function");
      expect(typeof client.onTeardown).toBe("function");

      // Accessors
      expect(client.hostContext).toBeDefined();
    });

    it("should provide hostContext with required properties", async () => {
      const client = await createClient({ forceAdapter: "mock" });
      const context = client.hostContext;

      expect(context.theme).toMatch(/^(light|dark)$/);
      expect(context.displayMode).toBeDefined();
      expect(context.availableDisplayModes).toBeInstanceOf(Array);
      expect(context.viewport).toBeDefined();
      expect(typeof context.viewport.width).toBe("number");
      expect(typeof context.viewport.height).toBe("number");
      expect(context.locale).toBeDefined();
      expect(context.platform).toBeDefined();
    });
  });

  describe("type safety", () => {
    it("should support typed tool definitions", async () => {
      type MyTools = {
        greet: { input: { name: string }; output: { message: string } };
        add: { input: { a: number; b: number }; output: { result: number } };
      };

      const client = await createClient<MyTools>({ forceAdapter: "mock" });

      // Type system should enforce correct tool names
      expect(typeof client.callTool).toBe("function");
    });
  });

  describe("state management", () => {
    it("should store and retrieve state with mock adapter", async () => {
      const client = await createClient({ forceAdapter: "mock" });

      client.setState({ count: 42 });
      const state = client.getState<{ count: number }>();

      expect(state).toEqual({ count: 42 });
    });

    it("should return null for unset state", async () => {
      const client = await createClient({ forceAdapter: "mock" });

      expect(client.getState()).toBeNull();
    });
  });

  describe("event subscriptions", () => {
    it("should return unsubscribe functions", async () => {
      const client = await createClient({ forceAdapter: "mock" });

      const unsub1 = client.onToolResult(() => {});
      const unsub2 = client.onHostContextChange(() => {});

      expect(typeof unsub1).toBe("function");
      expect(typeof unsub2).toBe("function");

      // Should not throw
      unsub1();
      unsub2();
    });
  });

  describe("error handling", () => {
    it("should throw for unknown forced adapter", async () => {
      await expect(createClient({ forceAdapter: "invalid" as "mock" })).rejects.toThrow();
    });
  });

  // =============================================================================
  // NEW MCP APPS API CONTRACT TESTS
  // =============================================================================

  describe("new MCP Apps API methods", () => {
    it("should have all new methods on the client", async () => {
      const client = await createClient({ forceAdapter: "mock" });

      // Host information
      expect(typeof client.getHostCapabilities).toBe("function");
      expect(typeof client.getHostVersion).toBe("function");

      // Protocol-level logging
      expect(typeof client.sendLog).toBe("function");

      // Size notifications
      expect(typeof client.sendSizeChanged).toBe("function");
      expect(typeof client.setupSizeChangedNotifications).toBe("function");

      // Partial tool input
      expect(typeof client.onToolInputPartial).toBe("function");

      // Bidirectional tool support
      expect(typeof client.setCallToolHandler).toBe("function");
      expect(typeof client.setListToolsHandler).toBe("function");
    });

    describe("host capabilities", () => {
      it("should return host capabilities", async () => {
        const client = await createClient({ forceAdapter: "mock" });
        const capabilities: HostCapabilities | undefined = client.getHostCapabilities();

        expect(capabilities).toBeDefined();
        expect(capabilities).toMatchObject({
          logging: expect.any(Object),
          openLinks: expect.any(Object),
        });
      });
    });

    describe("host version", () => {
      it("should return host version", async () => {
        const client = await createClient({ forceAdapter: "mock" });
        const version: HostVersion | undefined = client.getHostVersion();

        expect(version).toBeDefined();
        expect(version).toMatchObject({
          name: expect.any(String),
          version: expect.any(String),
        });
      });
    });

    describe("protocol-level logging", () => {
      it("should send log without error", async () => {
        const client = await createClient({ forceAdapter: "mock" });

        await expect(client.sendLog("info", { message: "test" })).resolves.toBeUndefined();
      });

      it("should accept all log levels", async () => {
        const client = await createClient({ forceAdapter: "mock" });
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
          await expect(client.sendLog(level, { level })).resolves.toBeUndefined();
        }
      });
    });

    describe("size notifications", () => {
      it("should send size changed without error", async () => {
        const client = await createClient({ forceAdapter: "mock" });

        await expect(
          client.sendSizeChanged({ width: 800, height: 600 })
        ).resolves.toBeUndefined();
      });

      it("should setup size changed notifications and return cleanup function", async () => {
        const client = await createClient({ forceAdapter: "mock" });

        const cleanup = client.setupSizeChangedNotifications();
        expect(typeof cleanup).toBe("function");

        // Should not throw
        cleanup();
      });
    });

    describe("partial tool input", () => {
      it("should return unsubscribe function for onToolInputPartial", async () => {
        const client = await createClient({ forceAdapter: "mock" });

        const handler = vi.fn();
        const unsubscribe = client.onToolInputPartial(handler);

        expect(typeof unsubscribe).toBe("function");
        unsubscribe();
      });
    });

    describe("bidirectional tool support", () => {
      it("should register call tool handler without error", async () => {
        const client = await createClient({ forceAdapter: "mock" });

        const handler = vi.fn().mockResolvedValue({ result: "success" });
        expect(() => client.setCallToolHandler(handler)).not.toThrow();
      });

      it("should register list tools handler without error", async () => {
        const client = await createClient({ forceAdapter: "mock" });

        const handler = vi.fn().mockResolvedValue([{ name: "tool1" }]);
        expect(() => client.setListToolsHandler(handler)).not.toThrow();
      });
    });
  });
});
