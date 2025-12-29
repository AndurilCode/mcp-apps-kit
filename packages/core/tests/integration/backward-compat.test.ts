/**
 * Backward Compatibility Tests
 *
 * Verifies that existing apps (without plugins, middleware, or events)
 * continue to work without any code changes. Tests 100% backward compatibility.
 *
 * @module integration/backward-compat
 */

import { describe, it } from "vitest";
import { z } from "zod";
import { createApp, defineTool, defineUI } from "../../src/createApp";

describe("Backward Compatibility", () => {
  describe("Apps without new features", () => {
    it("should work with no plugins defined", async () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          testTool: defineTool({
            description: "Test tool",
            input: z.object({}),
            output: z.object({ result: z.number() }),
            handler: async () => ({ result: 42 }),
          }),
        },
      });

      await app.start({ transport: "stdio" });
    });

    it("should work with empty plugins array", async () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        plugins: [],
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
    });

    it("should work without calling app.use()", async () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          add: defineTool({
            description: "Add two numbers",
            input: z.object({ a: z.number(), b: z.number() }),
            output: z.object({ sum: z.number() }),
            handler: async ({ a, b }) => ({ sum: a + b }),
          }),
        },
      });

      await app.start({ transport: "stdio" });
    });

    it("should work with plugins but no middleware", async () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        plugins: [],
        tools: {
          testTool: defineTool({
            description: "Test tool",
            input: z.object({}),
            output: z.object({ success: z.boolean() }),
            handler: async () => ({ success: true }),
          }),
        },
      });

      // No app.use() calls
      await app.start({ transport: "stdio" });
    });

    it("should work without calling app.on()", async () => {
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

      // No event listeners
      await app.start({ transport: "stdio" });
    });

    it("should work with plugins and middleware but no events", async () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        plugins: [],
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
      // No event listeners
      await app.start({ transport: "stdio" });
    });
  });

  describe("Minimal patterns", () => {
    it("should support the minimal createApp pattern", async () => {
      const app = createApp({
        name: "minimal-app",
        version: "1.0.0",
        tools: {
          greet: defineTool({
            description: "Greet a user",
            input: z.object({ name: z.string() }),
            output: z.object({ message: z.string() }),
            handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
          }),
        },
      });

      await app.start({ transport: "stdio" });
    });

    it("should support apps with only config (no plugins/middleware/events)", async () => {
      const app = createApp({
        name: "config-app",
        version: "1.0.0",
        config: {
          protocol: "mcp" as const,
        },
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
    });

    it("should support apps with colocated UI resources (no plugins/middleware/events)", async () => {
      const app = createApp({
        name: "ui-app",
        version: "1.0.0",
        tools: {
          testTool: defineTool({
            description: "A tool with UI",
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
    });
  });

  describe("Integration with existing tool features", () => {
    it("should support tool input/output validation without new features", async () => {
      const app = createApp({
        name: "validation-app",
        version: "1.0.0",
        tools: {
          divide: defineTool({
            description: "Divide two numbers",
            input: z.object({
              numerator: z.number(),
              denominator: z.number(),
            }),
            output: z.object({ result: z.number() }),
            handler: async ({ numerator, denominator }) => {
              if (denominator === 0) {
                throw new Error("Cannot divide by zero");
              }
              return { result: numerator / denominator };
            },
          }),
        },
      });

      await app.start({ transport: "stdio" });
    });

    it("should support tool context metadata without new features", async () => {
      const app = createApp({
        name: "context-app",
        version: "1.0.0",
        tools: {
          testTool: defineTool({
            description: "Test tool",
            input: z.object({}),
            output: z.object({ success: z.boolean() }),
            handler: async (_input, _context) => {
              // Handler is defined but not invoked during app.start()
              return { success: true };
            },
          }),
        },
      });

      await app.start({ transport: "stdio" });
    });

    it("should support tool error handling without new features", async () => {
      const app = createApp({
        name: "error-app",
        version: "1.0.0",
        tools: {
          failingTool: defineTool({
            description: "Tool that fails",
            input: z.object({}),
            handler: async () => {
              throw new Error("Tool error");
            },
          }),
        },
      });

      await app.start({ transport: "stdio" });
    });

    it("should not require changes to existing tool definitions", async () => {
      // Legacy tool definition pattern
      const app = createApp({
        name: "legacy-app",
        version: "1.0.0",
        tools: {
          add: defineTool({
            description: "Add numbers",
            input: z.object({ a: z.number(), b: z.number() }),
            output: z.object({ result: z.number() }),
            handler: async ({ a, b }) => ({ result: a + b }),
          }),
          multiply: defineTool({
            description: "Multiply numbers",
            input: z.object({ a: z.number(), b: z.number() }),
            output: z.object({ result: z.number() }),
            handler: async ({ a, b }) => ({ result: a * b }),
          }),
        },
      });

      await app.start({ transport: "stdio" });
    });

    it("should not require changes to app.start() calls", async () => {
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

      // All these should work
      await app.start({ transport: "stdio" });
    });
  });
});
