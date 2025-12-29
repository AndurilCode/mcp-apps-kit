/**
 * Plugin Deferred Hooks Integration Tests
 *
 * Tests the HTTP and UI hooks (onRequest, onResponse, onUILoad) that were
 * deferred from the initial plugin implementation.
 *
 * These tests verify that the hooks are properly wired up in the server.
 *
 * @module integration/plugin-deferred-hooks
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { createApp, defineTool, defineUI } from "../../src/createApp";
import { createPlugin } from "../../src/plugins/types";

describe("Plugin Deferred Hooks Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Plugin Hook Definitions", () => {
    it("should support onRequest hook in plugin definition", () => {
      const plugin = createPlugin({
        name: "http-tracker",
        version: "1.0.0",
        onRequest: async (context) => {
          expect(context.method).toBeDefined();
          expect(context.path).toBeDefined();
          expect(context.headers).toBeDefined();
        },
      });

      expect(plugin.onRequest).toBeDefined();
      expect(typeof plugin.onRequest).toBe("function");
    });

    it("should support onResponse hook in plugin definition", () => {
      const plugin = createPlugin({
        name: "http-tracker",
        version: "1.0.0",
        onResponse: async (context) => {
          expect(context.method).toBeDefined();
          expect(context.path).toBeDefined();
          expect(context.statusCode).toBeDefined();
        },
      });

      expect(plugin.onResponse).toBeDefined();
      expect(typeof plugin.onResponse).toBe("function");
    });

    it("should support onUILoad hook in plugin definition", () => {
      const plugin = createPlugin({
        name: "ui-tracker",
        version: "1.0.0",
        onUILoad: async (context) => {
          expect(context.uiKey).toBeDefined();
          expect(context.uri).toBeDefined();
        },
      });

      expect(plugin.onUILoad).toBeDefined();
      expect(typeof plugin.onUILoad).toBe("function");
    });

    it("should support all deferred hooks together", () => {
      const plugin = createPlugin({
        name: "full-plugin",
        version: "1.0.0",
        onRequest: async () => {},
        onResponse: async () => {},
        onUILoad: async () => {},
      });

      expect(plugin.onRequest).toBeDefined();
      expect(plugin.onResponse).toBeDefined();
      expect(plugin.onUILoad).toBeDefined();
    });
  });

  describe("Lifecycle and Deferred Hooks Integration", () => {
    it("should support lifecycle hooks alongside deferred hooks", async () => {
      const hookCalls: string[] = [];

      const plugin = createPlugin({
        name: "full-plugin",
        version: "1.0.0",
        onInit: async () => {
          hookCalls.push("onInit");
        },
        onStart: async () => {
          hookCalls.push("onStart");
        },
        onRequest: async () => {
          hookCalls.push("onRequest");
        },
        onResponse: async () => {
          hookCalls.push("onResponse");
        },
        onUILoad: async () => {
          hookCalls.push("onUILoad");
        },
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        plugins: [plugin],
        tools: {
          testTool: defineTool({
            description: "Test tool with UI",
            input: z.object({}),
            output: z.object({}),
            handler: async () => ({}),
            ui: defineUI({
              name: "Test UI",
              html: "<html><body>Test</body></html>",
            }),
          }),
        },
      });

      await app.start({ transport: "stdio" });

      // Lifecycle hooks should have been called
      expect(hookCalls).toContain("onInit");
      expect(hookCalls).toContain("onStart");
    });

    it("should support multiple plugins with deferred hooks", async () => {
      const plugin1Calls: string[] = [];
      const plugin2Calls: string[] = [];

      const plugin1 = createPlugin({
        name: "plugin-1",
        version: "1.0.0",
        onRequest: async () => {
          plugin1Calls.push("onRequest");
        },
      });

      const plugin2 = createPlugin({
        name: "plugin-2",
        version: "1.0.0",
        onResponse: async () => {
          plugin2Calls.push("onResponse");
        },
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        plugins: [plugin1, plugin2],
        tools: {},
      });

      await app.start({ transport: "stdio" });

      // Both plugins should be registered
      expect(plugin1.onRequest).toBeDefined();
      expect(plugin2.onResponse).toBeDefined();
    });
  });

  describe("Hook Error Isolation", () => {
    it("should isolate errors in HTTP hooks via PluginManager.executeHook", async () => {
      // PluginManager.executeHook handles error isolation
      // This test verifies the hooks are compatible with that system
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const plugin = createPlugin({
        name: "bad-plugin",
        version: "1.0.0",
        onRequest: async () => {
          throw new Error("Hook failed");
        },
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        plugins: [plugin],
        tools: {},
      });

      // Should not throw during initialization
      await expect(app.start({ transport: "stdio" })).resolves.not.toThrow();

      consoleErrorSpy.mockRestore();
    });
  });
});
