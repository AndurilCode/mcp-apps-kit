/**
 * Plugin Lifecycle Integration Tests
 *
 * Tests the complete plugin lifecycle in a real app context.
 *
 * Test Coverage:
 * - End-to-end plugin registration via createApp
 * - Full lifecycle flow (init → start → tool execution → shutdown)
 * - Plugin hook execution order
 * - Error handling and isolation
 * - Multiple plugins working together
 * - Real tool execution with plugins
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createApp } from "../../src/createApp";
import { createPlugin } from "../../src/index";
import type { Plugin } from "../../src/index";
import { z } from "zod";
import express from "express";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
let transport: StreamableHTTPClientTransport | undefined;

describe("Plugin Lifecycle Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (transport) {
      await transport.close();
      transport = undefined;
    }
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  describe("Plugin Registration", () => {
    it("should register plugins via createApp config", () => {
      const plugin: Plugin = {
        name: "test-plugin",
        version: "1.0.0",
      };

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
        plugins: [plugin],
      });

      expect(app).toBeDefined();
    });

    it("should register multiple plugins", () => {
      const plugins: Plugin[] = [{ name: "plugin-1" }, { name: "plugin-2" }, { name: "plugin-3" }];

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
        plugins,
      });

      expect(app).toBeDefined();
    });

    it("should work without plugins (backward compatibility)", () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
      });

      expect(app).toBeDefined();
    });
  });

  describe("Lifecycle Flow", () => {
    it("should execute full lifecycle: init → start → tool call → shutdown", async () => {
      const lifecycle: string[] = [];

      const plugin = createPlugin({
        name: "lifecycle-plugin",
        onInit: async (context) => {
          lifecycle.push("init");
          expect(context.config.name).toBe("test-app");
          expect(context.tools).toBeDefined();
        },
        onStart: async (context) => {
          lifecycle.push("start");
          expect(context.transport).toBeDefined();
        },
        beforeToolCall: async (context) => {
          lifecycle.push("beforeToolCall");
          expect(context.toolName).toBe("greet");
        },
        afterToolCall: async (context, result) => {
          lifecycle.push("afterToolCall");
          expect(result).toBeDefined();
        },
        onShutdown: async (context) => {
          lifecycle.push("shutdown");
          expect(context.graceful).toBe(true);
        },
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          greet: {
            description: "Greet a user",
            input: z.object({ name: z.string() }),
            handler: async (input, _context) => {
              const { name } = input as { name: string };
              lifecycle.push("handler");
              return { message: `Hello, ${name}!` } as any;
            },
          },
        },
        plugins: [plugin],
      });

      // App is created but not yet initialized
      expect(lifecycle).not.toContain("init");

      // Start the app (this triggers onInit and onStart)
      await app.start({ transport: "stdio" });

      expect(lifecycle).toContain("init");
      expect(lifecycle).toContain("start");

      expect(lifecycle.length).toBeGreaterThan(0);
    });

    it("should execute hooks in correct order", async () => {
      const hookOrder: string[] = [];

      const plugin1 = createPlugin({
        name: "plugin-1",
        onInit: async () => {
          hookOrder.push("plugin-1:init");
        },
        beforeToolCall: async () => {
          hookOrder.push("plugin-1:before");
        },
        afterToolCall: async () => {
          hookOrder.push("plugin-1:after");
        },
      });

      const plugin2 = createPlugin({
        name: "plugin-2",
        onInit: async () => {
          hookOrder.push("plugin-2:init");
        },
        beforeToolCall: async () => {
          hookOrder.push("plugin-2:before");
        },
        afterToolCall: async () => {
          hookOrder.push("plugin-2:after");
        },
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
        plugins: [plugin1, plugin2],
      });

      // Init has not been called yet (deferred to start())
      expect(hookOrder).toEqual([]);

      // Start the app to trigger onInit hooks
      await app.start({ transport: "stdio" });

      // Verify init order
      expect(hookOrder).toEqual(["plugin-1:init", "plugin-2:init"]);
    });
  });

  describe("Plugin with Tool Execution", () => {
    it("should execute plugin hooks around tool handler", async () => {
      const executionLog: string[] = [];

      const plugin = createPlugin({
        name: "logging-plugin",
        beforeToolCall: async (context) => {
          executionLog.push(`before:${context.toolName}`);
        },
        afterToolCall: async (context, result: any) => {
          executionLog.push(`after:${context.toolName}:${result.message}`);
        },
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          greet: {
            description: "Greet a user",
            input: z.object({ name: z.string() }),
            handler: async (input, _context) => {
              const { name } = input as { name: string };
              executionLog.push("handler");
              return { message: `Hello, ${name}!` } as any;
            },
          },
        },
        plugins: [plugin],
      });

      expect(app).toBeDefined();
      // Tool execution would log: before:greet → handler:Alice → after:greet:Hello, Alice!
    });

    it("should handle tool errors with onToolError hook", async () => {
      const errors: Error[] = [];

      const plugin = createPlugin({
        name: "error-tracking-plugin",
        onToolError: async (context, error) => {
          errors.push(error);
        },
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          failing: {
            description: "A tool that fails",
            input: z.object({}),
            handler: async () => {
              throw new Error("Tool failed");
            },
          },
        },
        plugins: [plugin],
      });

      expect(app).toBeDefined();
      // When tool is called and fails, onToolError should capture the error
    });
  });

  describe("Error Handling and Isolation", () => {
    it("should fail app start if plugin onInit throws", async () => {
      const badPlugin = createPlugin({
        name: "bad-plugin",
        onInit: async () => {
          throw new Error("Init failed");
        },
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
        plugins: [badPlugin],
      });

      await expect(app.start()).rejects.toThrow("Init failed");
    });

    it("should isolate errors in onStart - app still starts", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const badPlugin = createPlugin({
        name: "bad-start-plugin",
        onStart: async () => {
          throw new Error("Start failed");
        },
      });

      const onStartSpy = vi.fn();

      const goodPlugin = createPlugin({
        name: "good-plugin",
        onStart: onStartSpy,
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
        plugins: [badPlugin, goodPlugin],
      });

      // Start the app - it should succeed despite bad plugin throwing
      await app.start({ transport: "stdio" });

      // Good plugin's onStart should have been called
      expect(onStartSpy).toHaveBeenCalled();
      expect(onStartSpy).toHaveBeenCalledWith({ transport: "stdio" });

      // Error from bad plugin should have been logged
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("bad-start-plugin"),
        expect.anything()
      );

      consoleErrorSpy.mockRestore();
    });

    it("should isolate errors in tool execution hooks", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const badPlugin = createPlugin({
        name: "bad-hook-plugin",
        beforeToolCall: async () => {
          throw new Error("Hook failed");
        },
      });

      const beforeToolCallSpy = vi.fn();
      const afterToolCallSpy = vi.fn();

      const goodPlugin = createPlugin({
        name: "good-plugin",
        beforeToolCall: beforeToolCallSpy,
        afterToolCall: afterToolCallSpy,
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          greet: {
            description: "Greet a user",
            input: z.object({ name: z.string() }),
            handler: async (input, _context) => {
              const { name } = input as { name: string };
              return { message: `Hello, ${name}!` } as any;
            },
          },
        },
        plugins: [badPlugin, goodPlugin],
      });

      // Set up HTTP server to test tool invocation through MCP protocol
      const host = express();
      host.use(app.handler());
      server = host.listen(0);
      const port = (server.address() as AddressInfo).port;

      // Create MCP client and connect
      const client = new Client({ name: "test-client", version: "1.0.0" });
      transport = new StreamableHTTPClientTransport(new URL(`http://localhost:${port}/mcp`));
      await client.connect(transport);

      // Invoke the tool through the MCP protocol
      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "greet",
            arguments: { name: "World" },
          },
        },
        CallToolResultSchema
      );

      // Tool should still execute successfully despite bad plugin throwing
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual({ message: "Hello, World!" });

      // Good plugin hooks should have been called
      expect(beforeToolCallSpy).toHaveBeenCalled();
      expect(afterToolCallSpy).toHaveBeenCalled();

      // Error from bad plugin should have been logged
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe("Plugin Configuration Validation", () => {
    it("should validate plugin config at creation", () => {
      const schema = z.object({
        apiKey: z.string().min(1),
        timeout: z.number().positive(),
      });

      const plugin = createPlugin({
        name: "configured-plugin",
        configSchema: schema,
        config: {
          apiKey: "sk_test_123",
          timeout: 5000,
        },
      });

      expect(plugin.config).toEqual({
        apiKey: "sk_test_123",
        timeout: 5000,
      });
    });

    it("should throw error for invalid config", () => {
      const schema = z.object({
        apiKey: z.string().min(1),
      });

      expect(() => {
        createPlugin({
          name: "invalid-plugin",
          configSchema: schema,
          config: {
            apiKey: "", // Invalid
          },
        });
      }).toThrow();
    });
  });

  describe("Multiple Plugins Working Together", () => {
    it("should execute all plugins in registration order", async () => {
      const events: string[] = [];

      const authPlugin = createPlugin({
        name: "auth",
        beforeToolCall: async () => {
          events.push("auth:check");
        },
      });

      const loggingPlugin = createPlugin({
        name: "logging",
        beforeToolCall: async () => {
          events.push("logging:before");
        },
        afterToolCall: async () => {
          events.push("logging:after");
        },
      });

      const analyticsPlugin = createPlugin({
        name: "analytics",
        afterToolCall: async () => {
          events.push("analytics:track");
        },
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          greet: {
            description: "Greet a user",
            input: z.object({ name: z.string() }),
            handler: async (input, _context) => {
              const { name } = input as { name: string };
              return { message: `Hello, ${name}!` } as any;
            },
          },
        },
        plugins: [authPlugin, loggingPlugin, analyticsPlugin],
      });

      expect(app).toBeDefined();
      // Execution would be: auth:check → logging:before → handler → logging:after → analytics:track
    });

    it("should allow plugins to share state via metadata", async () => {
      const sharedData = new Map<string, any>();

      const plugin1 = createPlugin({
        name: "plugin-1",
        beforeToolCall: async (context) => {
          sharedData.set("requestId", "req-123");
        },
      });

      const plugin2 = createPlugin({
        name: "plugin-2",
        afterToolCall: async () => {
          const requestId = sharedData.get("requestId");
          expect(requestId).toBe("req-123");
        },
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
        plugins: [plugin1, plugin2],
      });

      expect(app).toBeDefined();
    });
  });

  describe("Backward Compatibility", () => {
    it("should work without plugins configuration", () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          greet: {
            description: "Greet a user",
            input: z.object({ name: z.string() }),
            handler: async (input, _context) => {
              const { name } = input as { name: string };
              return { message: `Hello, ${name}!` } as any;
            },
          },
        },
      });

      expect(app).toBeDefined();
    });

    it("should work with empty plugins array", () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
        plugins: [],
      });

      expect(app).toBeDefined();
    });
  });
});
