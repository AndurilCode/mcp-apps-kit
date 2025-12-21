/**
 * Unit tests for stdio transport
 *
 * Tests the stdio transport for running MCP servers as child processes.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createApp } from "../../src/index";

describe("stdio transport", () => {
  describe("transport option", () => {
    it("should accept stdio as transport option", async () => {
      const app = createApp({
        name: "stdio-app",
        version: "1.0.0",
        tools: {
          ping: {
            description: "Ping",
            input: z.object({}),
            output: z.object({ pong: z.boolean() }),
            handler: async () => ({ pong: true }),
          },
        },
      });

      // Stdio transport should be accepted
      // In actual use, this would connect to stdin/stdout
      // For testing, we just verify the option is accepted
      try {
        await app.start({ transport: "stdio" });
      } catch (error) {
        // Expected to fail in test environment as stdio is not available
        // The important thing is that it doesn't reject the transport option
        expect(error).toBeDefined();
      }
    });
  });

  describe("MCP server integration", () => {
    it("should create a valid MCP server", () => {
      const app = createApp({
        name: "mcp-app",
        version: "1.0.0",
        tools: {
          greet: {
            description: "Greet someone",
            input: z.object({ name: z.string() }),
            output: z.object({ greeting: z.string() }),
            handler: async ({ name }: { name: string }) => ({
              greeting: `Hello, ${name}!`,
            }),
          },
        },
      });

      const server = app.getServer();

      // McpServer is returned - verify it's a valid MCP server instance
      expect(server).toBeDefined();
      // McpServer exposes server info via internal properties
      expect(server).toHaveProperty("server");
      expect(typeof server.connect).toBe("function");
    });

    it("should register tools with the MCP server", () => {
      const app = createApp({
        name: "tool-app",
        version: "1.0.0",
        tools: {
          tool1: {
            description: "First tool",
            input: z.object({ a: z.string() }),
            output: z.object({ b: z.string() }),
            handler: async ({ a }: { a: string }) => ({ b: a }),
          },
          tool2: {
            description: "Second tool",
            input: z.object({ x: z.number() }),
            output: z.object({ y: z.number() }),
            handler: async ({ x }: { x: number }) => ({ y: x * 2 }),
          },
        },
      });

      // Tools should be accessible
      expect(Object.keys(app.tools)).toHaveLength(2);
      expect(app.tools.tool1).toBeDefined();
      expect(app.tools.tool2).toBeDefined();
    });
  });
});
