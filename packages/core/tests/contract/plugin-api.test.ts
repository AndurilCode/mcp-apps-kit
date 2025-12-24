/**
 * Plugin API Contract Test
 *
 * Verifies that the Plugin API implements the contract defined in
 * specs/001-plugin-middleware-events/contracts/plugin-api.ts
 *
 * This test ensures the public API surface matches the specification.
 */

import { describe, it, expect, vi } from "vitest";
import type { z } from "zod";
import {
  createPlugin,
  type Plugin,
  type PluginInitContext,
  type PluginStartContext,
  type PluginShutdownContext,
  type ToolCallContext,
  type RequestContext,
  type ResponseContext,
  type UILoadContext,
  type InferPluginConfig,
} from "../../src/index";

describe("Plugin API Contract", () => {
  describe("Plugin Interface", () => {
    it("should support minimal plugin with only name", () => {
      const plugin: Plugin = {
        name: "minimal-plugin",
      };

      expect(plugin.name).toBe("minimal-plugin");
      expect(plugin.version).toBeUndefined();
      expect(plugin.config).toBeUndefined();
      expect(plugin.configSchema).toBeUndefined();
    });

    it("should support plugin with all lifecycle hooks", () => {
      const plugin: Plugin = {
        name: "full-lifecycle-plugin",
        version: "1.0.0",
        onInit: vi.fn(),
        onStart: vi.fn(),
        onShutdown: vi.fn(),
      };

      expect(plugin.onInit).toBeDefined();
      expect(plugin.onStart).toBeDefined();
      expect(plugin.onShutdown).toBeDefined();
    });

    it("should support plugin with all tool execution hooks", () => {
      const plugin: Plugin = {
        name: "tool-hooks-plugin",
        beforeToolCall: vi.fn(),
        afterToolCall: vi.fn(),
        onToolError: vi.fn(),
      };

      expect(plugin.beforeToolCall).toBeDefined();
      expect(plugin.afterToolCall).toBeDefined();
      expect(plugin.onToolError).toBeDefined();
    });

    it("should support plugin with HTTP hooks", () => {
      const plugin: Plugin = {
        name: "http-plugin",
        onRequest: vi.fn(),
        onResponse: vi.fn(),
      };

      expect(plugin.onRequest).toBeDefined();
      expect(plugin.onResponse).toBeDefined();
    });

    it("should support plugin with UI hooks", () => {
      const plugin: Plugin = {
        name: "ui-plugin",
        onUILoad: vi.fn(),
      };

      expect(plugin.onUILoad).toBeDefined();
    });
  });

  describe("Plugin Context Types", () => {
    it("should have correct PluginInitContext type", () => {
      const context: PluginInitContext = {
        config: {
          name: "test-app",
          version: "1.0.0",
          tools: {},
        },
        tools: {},
      };

      expect(context.config).toBeDefined();
      expect(context.tools).toBeDefined();
    });

    it("should have correct PluginStartContext type", () => {
      const httpContext: PluginStartContext = {
        port: 3000,
        transport: "http",
      };

      expect(httpContext.port).toBe(3000);
      expect(httpContext.transport).toBe("http");

      const stdioContext: PluginStartContext = {
        transport: "stdio",
      };

      expect(stdioContext.port).toBeUndefined();
      expect(stdioContext.transport).toBe("stdio");
    });

    it("should have correct PluginShutdownContext type", () => {
      const context: PluginShutdownContext = {
        graceful: true,
        timeoutMs: 5000,
      };

      expect(context.graceful).toBe(true);
      expect(context.timeoutMs).toBe(5000);
    });

    it("should have correct ToolCallContext type", () => {
      const context: ToolCallContext = {
        toolName: "greet",
        input: { name: "Alice" },
        metadata: {},
      };

      expect(context.toolName).toBe("greet");
      expect(context.input).toEqual({ name: "Alice" });
      expect(context.metadata).toBeDefined();
    });

    it("should have correct RequestContext type", () => {
      const context: RequestContext = {
        method: "POST",
        path: "/api/tools/greet",
        headers: { "content-type": "application/json" },
        metadata: {},
      };

      expect(context.method).toBe("POST");
      expect(context.path).toBe("/api/tools/greet");
      expect(context.headers).toBeDefined();
    });

    it("should have correct ResponseContext type", () => {
      const context: ResponseContext = {
        method: "POST",
        path: "/api/tools/greet",
        headers: { "content-type": "application/json" },
        statusCode: 200,
        body: { message: "Hello, Alice!" },
      };

      expect(context.statusCode).toBe(200);
      expect(context.body).toBeDefined();
    });

    it("should have correct UILoadContext type", () => {
      const context: UILoadContext = {
        uiKey: "greeting-widget",
        uri: "greeting-widget://index.html",
      };

      expect(context.uiKey).toBe("greeting-widget");
      expect(context.uri).toBe("greeting-widget://index.html");
    });
  });

  describe("createPlugin Helper", () => {
    it("should create plugin without config", () => {
      const plugin = createPlugin({
        name: "simple-plugin",
        version: "1.0.0",
      });

      expect(plugin.name).toBe("simple-plugin");
      expect(plugin.version).toBe("1.0.0");
    });

    it("should create plugin with config but no schema", () => {
      const plugin = createPlugin({
        name: "config-plugin",
        config: { enabled: true },
      });

      expect(plugin.name).toBe("config-plugin");
      expect(plugin.config).toEqual({ enabled: true });
    });

    it("should validate config against schema at creation", async () => {
      const { z } = await import("zod");

      const schema = z.object({
        apiKey: z.string().min(1),
        timeout: z.number().optional(),
      });

      const plugin = createPlugin({
        name: "validated-plugin",
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

    it("should throw error for invalid config", async () => {
      const { z } = await import("zod");

      const schema = z.object({
        apiKey: z.string().min(1),
      });

      expect(() => {
        createPlugin({
          name: "invalid-plugin",
          configSchema: schema,
          config: {
            apiKey: "", // Invalid - empty string
          },
        });
      }).toThrow();
    });

    it("should infer config type from schema", async () => {
      const { z } = await import("zod");

      const schema = z.object({
        apiKey: z.string(),
        retries: z.number().default(3),
      });

      type Config = InferPluginConfig<typeof schema>;

      const plugin = createPlugin({
        name: "typed-plugin",
        configSchema: schema,
        config: {
          apiKey: "test",
          retries: 5,
        },
        onInit: async (context) => {
          // This should compile - config is typed
          const config: Config | undefined = plugin.config;
          expect(config?.apiKey).toBe("test");
        },
      });

      expect(plugin.config?.apiKey).toBe("test");
    });
  });

  describe("Plugin Hook Signatures", () => {
    it("should accept async onInit hook", async () => {
      const plugin = createPlugin({
        name: "async-init",
        onInit: async (context: PluginInitContext) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          expect(context.config).toBeDefined();
        },
      });

      expect(plugin.onInit).toBeDefined();
    });

    it("should accept sync onStart hook", () => {
      const plugin = createPlugin({
        name: "sync-start",
        onStart: (context: PluginStartContext) => {
          expect(context.transport).toBeDefined();
        },
      });

      expect(plugin.onStart).toBeDefined();
    });

    it("should accept beforeToolCall hook with context", () => {
      const plugin = createPlugin({
        name: "before-tool",
        beforeToolCall: async (context: ToolCallContext) => {
          expect(context.toolName).toBeDefined();
          expect(context.input).toBeDefined();
        },
      });

      expect(plugin.beforeToolCall).toBeDefined();
    });

    it("should accept afterToolCall hook with result", () => {
      const plugin = createPlugin({
        name: "after-tool",
        afterToolCall: async (context: ToolCallContext, result: unknown) => {
          expect(context.toolName).toBeDefined();
          expect(result).toBeDefined();
        },
      });

      expect(plugin.afterToolCall).toBeDefined();
    });

    it("should accept onToolError hook with error", () => {
      const plugin = createPlugin({
        name: "tool-error",
        onToolError: async (context: ToolCallContext, error: Error) => {
          expect(context.toolName).toBeDefined();
          expect(error).toBeInstanceOf(Error);
        },
      });

      expect(plugin.onToolError).toBeDefined();
    });
  });
});
