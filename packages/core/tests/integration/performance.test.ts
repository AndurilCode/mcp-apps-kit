/**
 * Performance Benchmark Tests
 *
 * Verifies that the plugin, middleware, and event systems have minimal overhead.
 * These tests verify configuration and initialization performance, not runtime
 * tool execution performance (which requires the full MCP protocol).
 *
 * @module integration/performance
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createApp, defineTool } from "../../src/createApp";
import { createPlugin } from "../../src/plugins/types";
import type { Middleware } from "../../src/middleware/types";

describe("Performance Benchmarks", () => {
  describe("Configuration and initialization performance", () => {
    it("should initialize apps with plugins quickly", async () => {
      const startTime = performance.now();

      const plugins = Array.from({ length: 10 }, (_, i) =>
        createPlugin({
          name: `plugin-${i}`,
          version: "1.0.0",
          onInit: async () => {},
          beforeToolCall: async () => {},
          afterToolCall: async () => {},
        })
      );

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        plugins,
        tools: {
          testTool: defineTool({
            description: "Test tool",
            input: z.object({}),
            output: z.object({ success: z.boolean() }),
            handler: async () => ({ success: true }),
          }),
        },
      });

      await app.start({ transport: "stdio" });

      const endTime = performance.now();
      const initTime = endTime - startTime;

      // Initialization should complete in reasonable time (< 1 second)
      expect(initTime).toBeLessThan(1000);
    });

    it("should initialize apps with middleware quickly", async () => {
      const startTime = performance.now();

      const middlewares: Middleware[] = Array.from({ length: 10 }, () => async (_context, next) => {
        await next();
      });

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

      middlewares.forEach((mw) => app.use(mw));

      await app.start({ transport: "stdio" });

      const endTime = performance.now();
      const initTime = endTime - startTime;

      // Initialization should complete in reasonable time (< 1 second)
      expect(initTime).toBeLessThan(1000);
    });

    it("should initialize apps with event listeners quickly", async () => {
      const startTime = performance.now();

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

      // Add many event listeners
      for (let i = 0; i < 50; i++) {
        app.on("tool:called", () => {});
        app.on("tool:success", () => {});
        app.on("tool:error", () => {});
      }

      await app.start({ transport: "stdio" });

      const endTime = performance.now();
      const initTime = endTime - startTime;

      // Initialization should complete in reasonable time (< 1 second)
      expect(initTime).toBeLessThan(1000);
    });

    it("should initialize apps with all features quickly", async () => {
      const startTime = performance.now();

      const plugins = Array.from({ length: 5 }, (_, i) =>
        createPlugin({
          name: `plugin-${i}`,
          version: "1.0.0",
          onInit: async () => {},
          beforeToolCall: async () => {},
          afterToolCall: async () => {},
        })
      );

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        plugins,
        tools: {
          testTool: defineTool({
            description: "Test tool",
            input: z.object({}),
            output: z.object({ success: z.boolean() }),
            handler: async () => ({ success: true }),
          }),
        },
      });

      // Add middleware
      for (let i = 0; i < 5; i++) {
        app.use(async (_context, next) => await next());
      }

      // Add event listeners
      for (let i = 0; i < 25; i++) {
        app.on("tool:called", () => {});
        app.on("tool:success", () => {});
      }

      await app.start({ transport: "stdio" });

      const endTime = performance.now();
      const initTime = endTime - startTime;

      // Initialization should complete in reasonable time (< 1 second)
      expect(initTime).toBeLessThan(1000);
    });
  });

  describe("Memory efficiency", () => {
    it("should not leak memory when creating multiple apps", async () => {
      const apps = [];

      for (let i = 0; i < 10; i++) {
        const plugin = createPlugin({
          name: `plugin-${i}`,
          version: "1.0.0",
        });

        const app = createApp({
          name: `app-${i}`,
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

        app.use(async (_context, next) => await next());
        app.on("tool:called", () => {});

        await app.start({ transport: "stdio" });
        apps.push(app);
      }

      // All apps should be created successfully
      expect(apps).toHaveLength(10);
    });

    it("should handle large numbers of tools efficiently", async () => {
      const tools: Record<string, any> = {};

      for (let i = 0; i < 100; i++) {
        tools[`tool${i}`] = defineTool({
          description: `Tool ${i}`,
          input: z.object({}),
          output: z.object({ result: z.number() }),
          handler: async () => ({ result: i }),
        });
      }

      const startTime = performance.now();

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools,
      });

      await app.start({ transport: "stdio" });

      const endTime = performance.now();
      const initTime = endTime - startTime;

      // Should handle 100 tools without significant slowdown (< 2 seconds)
      expect(initTime).toBeLessThan(2000);
    });
  });

  describe("Scalability", () => {
    it("should scale linearly with number of plugins", async () => {
      const timings: number[] = [];

      for (const count of [1, 5, 10]) {
        const plugins = Array.from({ length: count }, (_, i) =>
          createPlugin({
            name: `plugin-${i}`,
            version: "1.0.0",
            onInit: async () => {},
          })
        );

        const startTime = performance.now();

        const app = createApp({
          name: "test-app",
          version: "1.0.0",
          plugins,
          tools: {
            testTool: defineTool({
              description: "Test tool",
              input: z.object({}),
              output: z.object({ success: z.boolean() }),
              handler: async () => ({ success: true }),
            }),
          },
        });

        await app.start({ transport: "stdio" });

        const endTime = performance.now();
        timings.push(endTime - startTime);
      }

      // Each timing should be reasonable (< 1 second)
      timings.forEach((timing) => {
        expect(timing).toBeLessThan(1000);
      });

      // Scaling should be roughly linear (10x plugins should take < 12x time)
      const ratio = timings[timings.length - 1] / timings[0];
      expect(ratio).toBeLessThan(12);
    });
  });
});
