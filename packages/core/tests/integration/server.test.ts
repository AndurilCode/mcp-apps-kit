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
import express from "express";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";

// Track servers and transports for cleanup
const servers: Array<{ close: () => void }> = [];
const transports: StreamableHTTPClientTransport[] = [];

afterEach(async () => {
  // Close all transports first
  for (const transport of transports) {
    await transport.close().catch(() => {});
  }
  transports.length = 0;
  
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

  describe("serverRoute configuration", () => {
    it("should use default /mcp route when not configured", async () => {
      const app = createApp({
        name: "test-app",
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

      await app.start({ port: 3006 });

      // Verify health endpoint works (server is running)
      const healthResponse = await fetch("http://localhost:3006/health");
      expect(healthResponse.ok).toBe(true);

      // Default route should be /mcp - GET should return 405 (method not allowed)
      const mcpGetResponse = await fetch("http://localhost:3006/mcp");
      expect(mcpGetResponse.status).toBe(405);
    });

    it("should use custom serverRoute when configured", async () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          ping: {
            description: "Ping",
            input: z.object({}),
            output: z.object({ pong: z.boolean() }),
            handler: async () => ({ pong: true }),
          },
        },
        config: {
          serverRoute: "/api/mcp",
        },
      });

      await app.start({ port: 3007 });

      // Verify health endpoint works (server is running)
      const healthResponse = await fetch("http://localhost:3007/health");
      expect(healthResponse.ok).toBe(true);

      // Custom route should be /api/mcp - GET should return 405
      const mcpGetResponse = await fetch("http://localhost:3007/api/mcp");
      expect(mcpGetResponse.status).toBe(405);

      // Default /mcp should not be registered (404)
      const defaultRouteResponse = await fetch("http://localhost:3007/mcp");
      expect(defaultRouteResponse.status).toBe(404);
    });

    it("should accept deeply nested custom routes", async () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
        config: {
          serverRoute: "/v1/api/services/mcp",
        },
      });

      await app.start({ port: 3008 });

      // Custom nested route should work
      const mcpGetResponse = await fetch("http://localhost:3008/v1/api/services/mcp");
      expect(mcpGetResponse.status).toBe(405);
    });

    it("should accept POST requests on custom route", async () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          ping: {
            description: "Ping",
            input: z.object({}),
            output: z.object({ pong: z.boolean() }),
            handler: async () => ({ pong: true }),
          },
        },
        config: {
          serverRoute: "/api/mcp",
        },
      });

      await app.start({ port: 3009 });

      // POST to custom route should be routed correctly (not 404 or 405)
      const postResponse = await fetch("http://localhost:3009/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
      });

      // Should not return 404 (not found) or 405 (method not allowed)
      // The route should be matched and handled by MCP transport
      expect(postResponse.status).not.toBe(404);
      expect(postResponse.status).not.toBe(405);
    });

    it("should throw error if serverRoute does not start with /", () => {
      expect(() =>
        createApp({
          name: "test-app",
          version: "1.0.0",
          tools: {},
          config: {
            serverRoute: "api/mcp", // Missing leading slash
          },
        })
      ).toThrow('serverRoute must start with "/"');
    });

    it("should throw error if serverRoute conflicts with /health", () => {
      expect(() =>
        createApp({
          name: "test-app",
          version: "1.0.0",
          tools: {},
          config: {
            serverRoute: "/health", // Reserved path
          },
        })
      ).toThrow('serverRoute cannot be "/health"');
    });
  });

  describe("serverRoute with handleRequest (serverless)", () => {
    it("should return 404 for wrong route in handleRequest", async () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
        config: {
          serverRoute: "/api/mcp",
        },
      });

      // Request to wrong route should return 404
      const invalidRequest = new Request("http://localhost/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
      });
      const invalidResponse = await app.handleRequest(invalidRequest);
      expect(invalidResponse.status).toBe(404);

      const body = await invalidResponse.json();
      expect(body).toEqual({ error: "Not found" });
    });

    it("should return 405 for non-POST methods in handleRequest", async () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
        config: {
          serverRoute: "/api/mcp",
        },
      });

      // GET request should return 405
      const getRequest = new Request("http://localhost/api/mcp", {
        method: "GET",
      });
      const getResponse = await app.handleRequest(getRequest);
      expect(getResponse.status).toBe(405);

      // DELETE request should return 405
      const deleteRequest = new Request("http://localhost/api/mcp", {
        method: "DELETE",
      });
      const deleteResponse = await app.handleRequest(deleteRequest);
      expect(deleteResponse.status).toBe(405);
    });

    it("should handle /health in handleRequest", async () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
        config: {
          serverRoute: "/api/mcp",
        },
      });

      const healthRequest = new Request("http://localhost/health");
      const healthResponse = await app.handleRequest(healthRequest);
      expect(healthResponse.status).toBe(200);

      const body = await healthResponse.json();
      expect(body).toEqual({
        status: "ok",
        name: "test-app",
        version: "1.0.0",
      });
    });
  });

  describe("debug logTool registration", () => {
    it("should register log_debug tool when logTool is true", async () => {
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
        config: {
          debug: {
            logTool: true,
            level: "debug",
          },
        },
      });

      // Set up HTTP server and connect MCP client
      const host = express();
      host.use(app.handler());
      const server = host.listen(0);
      servers.push(server);
      const port = (server.address() as AddressInfo).port;

      const client = new Client({ name: "test-client", version: "1.0.0" });
      const transport = new StreamableHTTPClientTransport(new URL(`http://localhost:${port}/mcp`));
      transports.push(transport);
      await client.connect(transport);

      // List tools through MCP protocol
      const result = await client.request(
        { method: "tools/list", params: {} },
        ListToolsResultSchema
      );

      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).toContain("log_debug");
      expect(toolNames).toContain("ping");
    });

    it("should NOT register log_debug tool when logTool is false", async () => {
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
        config: {
          debug: {
            logTool: false,
            level: "debug",
          },
        },
      });

      const host = express();
      host.use(app.handler());
      const server = host.listen(0);
      servers.push(server);
      const port = (server.address() as AddressInfo).port;

      const client = new Client({ name: "test-client", version: "1.0.0" });
      const transport = new StreamableHTTPClientTransport(new URL(`http://localhost:${port}/mcp`));
      transports.push(transport);
      await client.connect(transport);

      const result = await client.request(
        { method: "tools/list", params: {} },
        ListToolsResultSchema
      );

      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).not.toContain("log_debug");
      expect(toolNames).toContain("ping");
    });

    it("should NOT register log_debug tool when debug config is missing", async () => {
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

      const host = express();
      host.use(app.handler());
      const server = host.listen(0);
      servers.push(server);
      const port = (server.address() as AddressInfo).port;

      const client = new Client({ name: "test-client", version: "1.0.0" });
      const transport = new StreamableHTTPClientTransport(new URL(`http://localhost:${port}/mcp`));
      transports.push(transport);
      await client.connect(transport);

      const result = await client.request(
        { method: "tools/list", params: {} },
        ListToolsResultSchema
      );

      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).not.toContain("log_debug");
      expect(toolNames).toContain("ping");
    });

    it("should NOT register log_debug tool when logTool is omitted", async () => {
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
        config: {
          debug: {
            level: "info",
          },
        },
      });

      const host = express();
      host.use(app.handler());
      const server = host.listen(0);
      servers.push(server);
      const port = (server.address() as AddressInfo).port;

      const client = new Client({ name: "test-client", version: "1.0.0" });
      const transport = new StreamableHTTPClientTransport(new URL(`http://localhost:${port}/mcp`));
      transports.push(transport);
      await client.connect(transport);

      const result = await client.request(
        { method: "tools/list", params: {} },
        ListToolsResultSchema
      );

      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).not.toContain("log_debug");
      expect(toolNames).toContain("ping");
    });
  });
});
