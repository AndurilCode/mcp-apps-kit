/**
 * PluginManager Unit Tests
 *
 * Tests the PluginManager class that orchestrates plugin lifecycle and hook execution.
 *
 * Test Coverage:
 * - Plugin registration
 * - Lifecycle hook execution (init, start, shutdown)
 * - Tool execution hooks (before, after, error)
 * - HTTP hooks (request, response)
 * - UI hooks (load)
 * - Error isolation
 * - Hook execution order
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PluginManager } from "../../../src/plugins/PluginManager";
import type {
  Plugin,
  PluginInitContext,
  PluginStartContext,
  PluginShutdownContext,
  ToolCallContext,
  RequestContext,
  ResponseContext,
  UILoadContext,
} from "../../../src/index";

describe("PluginManager", () => {
  let manager: PluginManager;

  beforeEach(() => {
    manager = new PluginManager([]);
  });

  describe("Constructor", () => {
    it("should create manager with empty plugins array", () => {
      const emptyManager = new PluginManager([]);
      expect(emptyManager).toBeDefined();
    });

    it("should create manager with plugins", () => {
      const plugin: Plugin = {
        name: "test-plugin",
        version: "1.0.0",
      };

      const pluginManager = new PluginManager([plugin]);
      expect(pluginManager).toBeDefined();
    });

    it("should accept multiple plugins", () => {
      const plugins: Plugin[] = [
        { name: "plugin-1" },
        { name: "plugin-2" },
        { name: "plugin-3" },
      ];

      const pluginManager = new PluginManager(plugins);
      expect(pluginManager).toBeDefined();
    });
  });

  describe("Lifecycle Hooks", () => {
    describe("init()", () => {
      it("should call onInit on all plugins in order", async () => {
        const callOrder: string[] = [];

        const plugins: Plugin[] = [
          {
            name: "plugin-1",
            onInit: async (context) => {
              callOrder.push("plugin-1");
            },
          },
          {
            name: "plugin-2",
            onInit: async (context) => {
              callOrder.push("plugin-2");
            },
          },
        ];

        manager = new PluginManager(plugins);

        const context: PluginInitContext = {
          config: { name: "test", version: "1.0.0", tools: {} },
          tools: {},
        };

        await manager.init(context);

        expect(callOrder).toEqual(["plugin-1", "plugin-2"]);
      });

      it("should pass correct context to onInit hooks", async () => {
        const receivedContext = vi.fn();

        const plugin: Plugin = {
          name: "test-plugin",
          onInit: async (context) => {
            receivedContext(context);
          },
        };

        manager = new PluginManager([plugin]);

        const context: PluginInitContext = {
          config: { name: "test-app", version: "1.0.0", tools: {} },
          tools: {},
        };

        await manager.init(context);

        expect(receivedContext).toHaveBeenCalledWith(context);
      });

      it("should fail fast if plugin throws during init", async () => {
        const plugins: Plugin[] = [
          {
            name: "good-plugin",
            onInit: vi.fn(),
          },
          {
            name: "bad-plugin",
            onInit: async () => {
              throw new Error("Init failed");
            },
          },
          {
            name: "never-called",
            onInit: vi.fn(),
          },
        ];

        manager = new PluginManager(plugins);

        const context: PluginInitContext = {
          config: { name: "test", version: "1.0.0", tools: {} },
          tools: {},
        };

        await expect(manager.init(context)).rejects.toThrow("Init failed");
        expect(plugins[0].onInit).toHaveBeenCalled();
        expect(plugins[2].onInit).not.toHaveBeenCalled();
      });

      it("should skip plugins without onInit hook", async () => {
        const plugin: Plugin = {
          name: "no-init-plugin",
        };

        manager = new PluginManager([plugin]);

        const context: PluginInitContext = {
          config: { name: "test", version: "1.0.0", tools: {} },
          tools: {},
        };

        await expect(manager.init(context)).resolves.not.toThrow();
      });
    });

    describe("start()", () => {
      it("should call onStart on all plugins", async () => {
        const callOrder: string[] = [];

        const plugins: Plugin[] = [
          {
            name: "plugin-1",
            onStart: async () => {
              callOrder.push("plugin-1");
            },
          },
          {
            name: "plugin-2",
            onStart: async () => {
              callOrder.push("plugin-2");
            },
          },
        ];

        manager = new PluginManager(plugins);

        const context: PluginStartContext = {
          port: 3000,
          transport: "http",
        };

        await manager.start(context);

        expect(callOrder).toEqual(["plugin-1", "plugin-2"]);
      });

      it("should isolate errors - continue if plugin throws", async () => {
        const plugins: Plugin[] = [
          {
            name: "good-plugin",
            onStart: vi.fn(),
          },
          {
            name: "bad-plugin",
            onStart: async () => {
              throw new Error("Start failed");
            },
          },
          {
            name: "another-good-plugin",
            onStart: vi.fn(),
          },
        ];

        manager = new PluginManager(plugins);

        const context: PluginStartContext = {
          port: 3000,
          transport: "http",
        };

        await expect(manager.start(context)).resolves.not.toThrow();
        expect(plugins[0].onStart).toHaveBeenCalled();
        expect(plugins[2].onStart).toHaveBeenCalled();
      });
    });

    describe("shutdown()", () => {
      it("should call onShutdown on all plugins", async () => {
        const callOrder: string[] = [];

        const plugins: Plugin[] = [
          {
            name: "plugin-1",
            onShutdown: async () => {
              callOrder.push("plugin-1");
            },
          },
          {
            name: "plugin-2",
            onShutdown: async () => {
              callOrder.push("plugin-2");
            },
          },
        ];

        manager = new PluginManager(plugins);

        const context: PluginShutdownContext = {
          graceful: true,
          timeoutMs: 5000,
        };

        await manager.shutdown(context);

        expect(callOrder).toEqual(["plugin-1", "plugin-2"]);
      });

      it("should enforce shutdown timeout", async () => {
        const plugin: Plugin = {
          name: "slow-plugin",
          onShutdown: async () => {
            await new Promise((resolve) => setTimeout(resolve, 10000));
          },
        };

        manager = new PluginManager([plugin]);

        const context: PluginShutdownContext = {
          graceful: true,
          timeoutMs: 100,
        };

        await expect(manager.shutdown(context)).resolves.not.toThrow();
      });
    });
  });

  describe("Tool Execution Hooks", () => {
    describe("executeHook('beforeToolCall')", () => {
      it("should call beforeToolCall on all plugins", async () => {
        const callOrder: string[] = [];

        const plugins: Plugin[] = [
          {
            name: "plugin-1",
            beforeToolCall: async () => {
              callOrder.push("plugin-1");
            },
          },
          {
            name: "plugin-2",
            beforeToolCall: async () => {
              callOrder.push("plugin-2");
            },
          },
        ];

        manager = new PluginManager(plugins);

        const context: ToolCallContext = {
          toolName: "greet",
          input: { name: "Alice" },
          metadata: {},
        };

        await manager.executeHook("beforeToolCall", context);

        expect(callOrder).toEqual(["plugin-1", "plugin-2"]);
      });

      it("should isolate errors - one plugin error doesn't stop others", async () => {
        const plugins: Plugin[] = [
          {
            name: "good-plugin",
            beforeToolCall: vi.fn(),
          },
          {
            name: "bad-plugin",
            beforeToolCall: async () => {
              throw new Error("Hook failed");
            },
          },
          {
            name: "another-good-plugin",
            beforeToolCall: vi.fn(),
          },
        ];

        manager = new PluginManager(plugins);

        const context: ToolCallContext = {
          toolName: "greet",
          input: {},
          metadata: {},
        };

        await expect(manager.executeHook("beforeToolCall", context)).resolves.not.toThrow();
        expect(plugins[0].beforeToolCall).toHaveBeenCalled();
        expect(plugins[2].beforeToolCall).toHaveBeenCalled();
      });
    });

    describe("executeHook('afterToolCall')", () => {
      it("should call afterToolCall with result", async () => {
        const receivedResults = vi.fn();

        const plugin: Plugin = {
          name: "test-plugin",
          afterToolCall: async (context, result) => {
            receivedResults(result);
          },
        };

        manager = new PluginManager([plugin]);

        const context: ToolCallContext = {
          toolName: "greet",
          input: {},
          metadata: {},
        };

        const result = { message: "Hello!" };

        await manager.executeHook("afterToolCall", context, result);

        expect(receivedResults).toHaveBeenCalledWith(result);
      });
    });

    describe("executeHook('onToolError')", () => {
      it("should call onToolError with error", async () => {
        const receivedErrors = vi.fn();

        const plugin: Plugin = {
          name: "test-plugin",
          onToolError: async (context, error) => {
            receivedErrors(error);
          },
        };

        manager = new PluginManager([plugin]);

        const context: ToolCallContext = {
          toolName: "greet",
          input: {},
          metadata: {},
        };

        const error = new Error("Tool failed");

        await manager.executeHook("onToolError", context, error);

        expect(receivedErrors).toHaveBeenCalledWith(error);
      });

      it("should isolate errors in onToolError hook itself", async () => {
        const plugins: Plugin[] = [
          {
            name: "good-plugin",
            onToolError: vi.fn(),
          },
          {
            name: "bad-plugin",
            onToolError: async () => {
              throw new Error("Error handler failed");
            },
          },
        ];

        manager = new PluginManager(plugins);

        const context: ToolCallContext = {
          toolName: "greet",
          input: {},
          metadata: {},
        };

        const error = new Error("Original error");

        await expect(manager.executeHook("onToolError", context, error)).resolves.not.toThrow();
        expect(plugins[0].onToolError).toHaveBeenCalled();
      });
    });
  });

  describe("HTTP Hooks", () => {
    it("should execute onRequest hooks", async () => {
      const plugin: Plugin = {
        name: "http-plugin",
        onRequest: vi.fn(),
      };

      manager = new PluginManager([plugin]);

      const context: RequestContext = {
        method: "POST",
        path: "/api/tools/greet",
        headers: {},
      };

      await manager.executeHook("onRequest", context);

      expect(plugin.onRequest).toHaveBeenCalledWith(context);
    });

    it("should execute onResponse hooks", async () => {
      const plugin: Plugin = {
        name: "http-plugin",
        onResponse: vi.fn(),
      };

      manager = new PluginManager([plugin]);

      const context: ResponseContext = {
        method: "POST",
        path: "/api/tools/greet",
        headers: {},
        statusCode: 200,
        body: { message: "Hello!" },
      };

      await manager.executeHook("onResponse", context);

      expect(plugin.onResponse).toHaveBeenCalledWith(context);
    });
  });

  describe("UI Hooks", () => {
    it("should execute onUILoad hooks", async () => {
      const plugin: Plugin = {
        name: "ui-plugin",
        onUILoad: vi.fn(),
      };

      manager = new PluginManager([plugin]);

      const context: UILoadContext = {
        uiKey: "greeting-widget",
        uri: "greeting-widget://index.html",
      };

      await manager.executeHook("onUILoad", context);

      expect(plugin.onUILoad).toHaveBeenCalledWith(context);
    });
  });

  describe("Error Isolation", () => {
    it("should log errors from failed hooks", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const plugin: Plugin = {
        name: "failing-plugin",
        beforeToolCall: async () => {
          throw new Error("Hook execution failed");
        },
      };

      manager = new PluginManager([plugin]);

      const context: ToolCallContext = {
        toolName: "greet",
        input: {},
        metadata: {},
      };

      await manager.executeHook("beforeToolCall", context);

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});
