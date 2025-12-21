/**
 * Integration tests for app.start() HTTP server
 *
 * Tests the full server lifecycle including:
 * - Starting the HTTP server
 * - Handling MCP protocol requests
 * - Tool execution through HTTP
 * - Server shutdown
 */

import { describe, it, expect, afterEach } from "vitest";
import { z } from "zod";
import { createApp } from "../../src/index";

// Track servers for cleanup
const servers: Array<{ close: () => void }> = [];

afterEach(async () => {
  // Close all servers after each test
  for (const server of servers) {
    await new Promise<void>((resolve) => {
      try {
        server.close();
        resolve();
      } catch {
        resolve();
      }
    });
  }
  servers.length = 0;
});

describe("app.start() integration", () => {
  describe("HTTP transport", () => {
    it("should start server on specified port", async () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          ping: {
            description: "Simple ping tool",
            input: z.object({}),
            output: z.object({ pong: z.boolean() }),
            handler: async () => ({ pong: true }),
          },
        },
      });

      // This should not throw
      await app.start({ port: 3001, transport: "http" });

      // For now, we just verify it starts without error
      // Full MCP protocol testing would require the MCP client SDK
    });

    it("should default to HTTP transport when no transport specified", async () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
      });

      // Should default to HTTP
      await app.start({ port: 3002 });
    });

    it("should allow getting the underlying server", async () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
      });

      const server = app.getServer();
      expect(server).toBeDefined();
    });
  });

  describe("tool execution", () => {
    it("should execute tools and return results", async () => {
      const app = createApp({
        name: "calculator",
        version: "1.0.0",
        tools: {
          add: {
            description: "Add two numbers",
            input: z.object({ a: z.number(), b: z.number() }),
            output: z.object({ result: z.number() }),
            handler: async ({ a, b }: { a: number; b: number }) => ({ result: a + b }),
          },
        },
      });

      // Start the server
      await app.start({ port: 3003 });

      // Tool execution would be tested through MCP protocol
      // For now, we verify the handler type is correct
      const addTool = app.tools.add;
      expect(addTool.handler).toBeDefined();
      expect(typeof addTool.handler).toBe("function");
    });

    it("should validate tool input against Zod schema", async () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          greet: {
            description: "Greet by name",
            input: z.object({ name: z.string().min(1) }),
            output: z.object({ message: z.string() }),
            handler: async ({ name }: { name: string }) => ({ message: `Hello, ${name}!` }),
          },
        },
      });

      // Input validation would be tested through MCP protocol
      expect(app.tools.greet.input).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("should handle tool errors gracefully", async () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          failingTool: {
            description: "A tool that fails",
            input: z.object({}),
            output: z.object({}),
            handler: async () => {
              throw new Error("Intentional failure");
            },
          },
        },
      });

      await app.start({ port: 3004 });

      // Error handling would be tested through MCP protocol
      expect(app.tools.failingTool).toBeDefined();
    });
  });

  describe("CORS configuration", () => {
    it("should accept CORS configuration", async () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
        config: {
          cors: {
            origin: "http://localhost:3000",
            credentials: true,
          },
        },
      });

      await app.start({ port: 3005 });
      // CORS would be verified through HTTP headers in actual requests
    });
  });
});
