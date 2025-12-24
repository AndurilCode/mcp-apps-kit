/**
 * Plugin, Middleware & Events Integration Tests
 *
 * Tests that plugins, middleware, and events can be configured together
 * without conflicts. These tests verify configuration compatibility.
 *
 * Execution order and pipeline behavior are tested in the individual
 * component test files (plugin-lifecycle.test.ts, middleware.test.ts, etc.)
 *
 * @module integration/plugin-middleware-events
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";
import { createApp, defineTool } from "../../src/createApp";
import { createPlugin } from "../../src/plugins/types";
import type { Middleware } from "../../src/middleware/types";

describe("Plugin + Middleware + Events Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should accept an app with plugins, middleware, and events configured together", async () => {
    // Verify that all three systems can be configured without conflicts
    const plugin = createPlugin({
      name: "test-plugin",
      version: "1.0.0",
      onInit: async () => {},
      beforeToolCall: async () => {},
    });

    const middleware: Middleware = async (_context, next) => {
      await next();
    };

    const app = createApp({
      name: "test-app",
      version: "1.0.0",
      plugins: [plugin],
      tools: {
        testTool: defineTool({
          description: "Test tool",
          input: z.object({}),
          output: z.object({ success: z.boolean() }),
          handler: async () => ({ success: true }),
        }),
      },
    });

    app.use(middleware);
    app.on("tool:called", () => {});

    // Should start without errors
    await app.start({ transport: "stdio" });
  });

  it("should support multiple plugins with multiple middleware and event listeners", async () => {
    const plugin1 = createPlugin({
      name: "plugin-1",
      version: "1.0.0",
    });

    const plugin2 = createPlugin({
      name: "plugin-2",
      version: "1.0.0",
    });

    const middleware1: Middleware = async (_context, next) => await next();
    const middleware2: Middleware = async (_context, next) => await next();

    const app = createApp({
      name: "test-app",
      version: "1.0.0",
      plugins: [plugin1, plugin2],
      tools: {
        tool1: defineTool({
          description: "Tool 1",
          input: z.object({}),
          output: z.object({ result: z.number() }),
          handler: async () => ({ result: 1 }),
        }),
        tool2: defineTool({
          description: "Tool 2",
          input: z.object({}),
          output: z.object({ result: z.number() }),
          handler: async () => ({ result: 2 }),
        }),
      },
    });

    app.use(middleware1);
    app.use(middleware2);
    app.on("tool:called", () => {});
    app.on("tool:success", () => {});
    app.on("tool:error", () => {});

    await app.start({ transport: "stdio" });
  });

  it("should allow plugins with all hook types alongside middleware and events", async () => {
    const fullPlugin = createPlugin({
      name: "full-plugin",
      version: "1.0.0",
      onInit: async () => {},
      onStart: async () => {},
      onShutdown: async () => {},
      beforeToolCall: async () => {},
      afterToolCall: async () => {},
      onToolError: async () => {},
      onRequest: async () => {},
      onResponse: async () => {},
      onUILoad: async () => {},
    });

    const middleware: Middleware = async (_context, next) => await next();

    const app = createApp({
      name: "test-app",
      version: "1.0.0",
      plugins: [fullPlugin],
      tools: {
        testTool: defineTool({
          description: "Test tool",
          input: z.object({}),
          output: z.object({ success: z.boolean() }),
          handler: async () => ({ success: true }),
        }),
      },
      ui: {
        testUI: {
          name: "Test UI",
          html: "<html><body>Test</body></html>",
        },
      },
    });

    app.use(middleware);
    app.on("app:init", () => {});
    app.on("app:start", () => {});
    app.on("app:shutdown", () => {});
    app.on("tool:called", () => {});
    app.on("tool:success", () => {});
    app.on("tool:error", () => {});

    await app.start({ transport: "stdio" });
  });

  it("should support conditional middleware with plugins and events", async () => {
    const plugin = createPlugin({
      name: "test-plugin",
      version: "1.0.0",
    });

    const conditionalMiddleware: Middleware = async (context, next) => {
      if (context.toolName === "specialTool") {
        context.state.set("special", true);
      }
      await next();
    };

    const app = createApp({
      name: "test-app",
      version: "1.0.0",
      plugins: [plugin],
      tools: {
        specialTool: defineTool({
          description: "Special tool",
          input: z.object({}),
          output: z.object({ special: z.boolean() }),
          handler: async () => ({ special: true }),
        }),
        normalTool: defineTool({
          description: "Normal tool",
          input: z.object({}),
          output: z.object({ normal: z.boolean() }),
          handler: async () => ({ normal: true }),
        }),
      },
    });

    app.use(conditionalMiddleware);
    app.on("tool:called", () => {});

    await app.start({ transport: "stdio" });
  });

  it("should support apps with plugins and events but no middleware", async () => {
    const plugin = createPlugin({
      name: "test-plugin",
      version: "1.0.0",
    });

    const app = createApp({
      name: "test-app",
      version: "1.0.0",
      plugins: [plugin],
      tools: {
        testTool: defineTool({
          description: "Test tool",
          input: z.object({}),
          output: z.object({ success: z.boolean() }),
          handler: async () => ({ success: true }),
        }),
      },
    });

    app.on("tool:called", () => {});
    app.on("tool:success", () => {});

    await app.start({ transport: "stdio" });
  });

  it("should support apps with middleware and events but no plugins", async () => {
    const middleware: Middleware = async (_context, next) => await next();

    const app = createApp({
      name: "test-app",
      version: "1.0.0",
      tools: {
        testTool: defineTool({
          description: "Test tool",
          input: z.object({}),
          output: z.object({ success: z.boolean() }),
          handler: async () => ({ success: true }),
        }),
      },
    });

    app.use(middleware);
    app.on("tool:called", () => {});
    app.on("tool:success", () => {});

    await app.start({ transport: "stdio" });
  });
});
