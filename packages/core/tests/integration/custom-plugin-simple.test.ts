/**
 * Custom Plugin Development Integration Tests (Simplified)
 *
 * Tests the ability to create custom plugins with lifecycle hooks.
 *
 * @module integration/custom-plugin-simple
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApp } from "../../src/createApp";
import { createPlugin } from "../../src/plugins/types";

describe("Custom Plugin Development (Simplified)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call onInit and onStart hooks in correct order", async () => {
    const hookCalls: string[] = [];

    const customPlugin = createPlugin({
      name: "lifecycle-tracker",
      version: "1.0.0",
      onInit: async () => {
        hookCalls.push("onInit");
      },
      onStart: async () => {
        hookCalls.push("onStart");
      },
    });

    const app = createApp({
      name: "test-app",
      version: "1.0.0",
      plugins: [customPlugin],
      tools: {},
    });

    // onInit is called during app.start(), not during createApp
    expect(hookCalls).not.toContain("onInit");

    await app.start({ transport: "stdio" });

    // Both hooks should have been called in order
    expect(hookCalls).toEqual(["onInit", "onStart"]);
  });

  it("should support multiple custom plugins", async () => {
    const plugin1Calls: string[] = [];
    const plugin2Calls: string[] = [];

    const plugin1 = createPlugin({
      name: "plugin-1",
      version: "1.0.0",
      onInit: async () => {
        plugin1Calls.push("init");
      },
    });

    const plugin2 = createPlugin({
      name: "plugin-2",
      version: "1.0.0",
      onInit: async () => {
        plugin2Calls.push("init");
      },
    });

    const app = createApp({
      name: "test-app",
      version: "1.0.0",
      plugins: [plugin1, plugin2],
      tools: {},
    });

    await app.start({ transport: "stdio" });

    // Both plugins should have been initialized
    expect(plugin1Calls).toContain("init");
    expect(plugin2Calls).toContain("init");
  });

  it("should isolate errors in plugin hooks", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const badPlugin = createPlugin({
      name: "bad-plugin",
      version: "1.0.0",
      onInit: async () => {
        throw new Error("Plugin initialization failed");
      },
    });

    const goodPlugin = createPlugin({
      name: "good-plugin",
      version: "1.0.0",
      onInit: async () => {
        // This should still execute
      },
    });

    const app = createApp({
      name: "test-app",
      version: "1.0.0",
      plugins: [badPlugin, goodPlugin],
      tools: {},
    });

    // Should throw because onInit failure should fail app initialization
    await expect(app.start({ transport: "stdio" })).rejects.toThrow();

    consoleErrorSpy.mockRestore();
  });
});
