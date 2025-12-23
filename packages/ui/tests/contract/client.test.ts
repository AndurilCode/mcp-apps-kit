/**
 * Contract tests for createClient
 *
 * Tests the public API contract for the unified client.
 */

import { describe, it, expect, vi } from "vitest";
import { createClient, detectProtocol } from "../../src/index";
import type { AppsClient, ToolDefs } from "../../src/types";

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
});
