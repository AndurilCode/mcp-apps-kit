/**
 * Contract tests for createApp basic structure
 *
 * Tests the public API contract of createApp as defined in the specification.
 * These tests verify that the function signature and return type match expectations.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createApp, type AppConfig, type ToolDefs } from "../../src/index";

describe("createApp contract", () => {
  describe("basic structure", () => {
    it("should accept minimal config with name and version", () => {
      const config: AppConfig<ToolDefs> = {
        name: "test-app",
        version: "1.0.0",
        tools: {},
      };

      const app = createApp(config);

      expect(app).toBeDefined();
      expect(typeof app.start).toBe("function");
      expect(typeof app.getServer).toBe("function");
      expect(typeof app.handler).toBe("function");
    });

    it("should accept config with tools", () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          greet: {
            description: "Greet a user",
            input: z.object({ name: z.string() }),
            output: z.object({ message: z.string() }),
            handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
          },
        },
      });

      expect(app).toBeDefined();
      expect(app.tools).toBeDefined();
      expect(app.tools.greet).toBeDefined();
    });

    it("should expose tools on the app instance", () => {
      const tools = {
        add: {
          description: "Add two numbers",
          input: z.object({ a: z.number(), b: z.number() }),
          output: z.object({ result: z.number() }),
          handler: async ({ a, b }: { a: number; b: number }) => ({ result: a + b }),
        },
      };

      const app = createApp({
        name: "calculator",
        version: "1.0.0",
        tools,
      });

      expect(app.tools).toHaveProperty("add");
    });
  });

  describe("App interface compliance", () => {
    it("should return an object implementing App<T> interface", () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
      });

      // Verify all App interface methods exist
      expect(app).toHaveProperty("start");
      expect(app).toHaveProperty("getServer");
      expect(app).toHaveProperty("handler");
      expect(app).toHaveProperty("handleRequest");
      expect(app).toHaveProperty("tools");
    });
  });

  describe("config validation", () => {
    it("should require name field", () => {
      expect(() =>
        // @ts-expect-error - Testing runtime validation
        createApp({ version: "1.0.0", tools: {} })
      ).toThrow();
    });

    it("should require version field", () => {
      expect(() =>
        // @ts-expect-error - Testing runtime validation
        createApp({ name: "test", tools: {} })
      ).toThrow();
    });

    it("should require tools field", () => {
      expect(() =>
        // @ts-expect-error - Testing runtime validation
        createApp({ name: "test", version: "1.0.0" })
      ).toThrow();
    });
  });
});
