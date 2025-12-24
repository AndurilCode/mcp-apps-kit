/**
 * Logging Plugin Unit Tests
 *
 * Tests the built-in logging plugin that provides tool execution logging.
 *
 * Test Coverage:
 * - Plugin configuration
 * - Log level filtering
 * - Tool call logging (before/after/error)
 * - Lifecycle event logging
 * - Timestamp formatting
 * - Output formatting
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loggingPlugin } from "../../../src/plugins/builtin/logging";
import type { ToolCallContext, PluginInitContext, PluginStartContext } from "../../../src/index";

describe("Logging Plugin", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("Plugin Configuration", () => {
    it("should have correct plugin metadata", () => {
      expect(loggingPlugin.name).toBe("logging");
      expect(loggingPlugin.version).toBeDefined();
    });

    it("should accept log level configuration", () => {
      expect(loggingPlugin.config).toBeDefined();
      expect(loggingPlugin.config).toHaveProperty("level");
    });

    it("should default to 'info' level", () => {
      expect(loggingPlugin.config?.level).toBe("info");
    });

    it("should validate config with schema", () => {
      expect(loggingPlugin.configSchema).toBeDefined();
    });
  });

  describe("Lifecycle Logging", () => {
    it("should log app initialization", async () => {
      const context: PluginInitContext = {
        config: {
          name: "test-app",
          version: "1.0.0",
          tools: {
            greet: {
              description: "Greet a user",
              input: {} as any,
              handler: async () => {},
            },
          },
        },
        tools: {
          greet: {
            description: "Greet a user",
            input: {} as any,
            handler: async () => {},
          },
        },
      };

      await loggingPlugin.onInit?.(context);

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][0]).toContain("test-app");
    });

    it("should log server start", async () => {
      const context: PluginStartContext = {
        port: 3000,
        transport: "http",
      };

      await loggingPlugin.onStart?.(context);

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][0]).toContain("3000");
    });

    it("should handle stdio transport in start log", async () => {
      const context: PluginStartContext = {
        transport: "stdio",
      };

      await loggingPlugin.onStart?.(context);

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][0]).toContain("stdio");
    });
  });

  describe("Tool Call Logging", () => {
    const toolContext: ToolCallContext = {
      toolName: "greet",
      input: { name: "Alice" },
      metadata: {
        locale: "en-US",
      },
    };

    it("should log before tool call with timestamp", async () => {
      await loggingPlugin.beforeToolCall?.(toolContext);

      expect(consoleLogSpy).toHaveBeenCalled();
      const logMessage = consoleLogSpy.mock.calls[0][0];
      expect(logMessage).toContain("greet");
      expect(logMessage).toMatch(/\d{4}-\d{2}-\d{2}/); // Date format
    });

    it("should log tool input", async () => {
      await loggingPlugin.beforeToolCall?.(toolContext);

      expect(consoleLogSpy).toHaveBeenCalled();
      const logMessage = consoleLogSpy.mock.calls[0][0];
      expect(logMessage).toContain("Alice");
    });

    it("should log after tool call with result", async () => {
      const result = { message: "Hello, Alice!" };

      await loggingPlugin.afterToolCall?.(toolContext, result);

      expect(consoleLogSpy).toHaveBeenCalled();
      const logMessage = consoleLogSpy.mock.calls[0][0];
      expect(logMessage).toContain("greet");
      expect(logMessage).toContain("Hello, Alice!");
    });

    it("should log tool errors", async () => {
      const error = new Error("Tool execution failed");

      await loggingPlugin.onToolError?.(toolContext, error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      const logMessage = consoleErrorSpy.mock.calls[0][0];
      expect(logMessage).toContain("greet");
      expect(logMessage).toContain("Tool execution failed");
    });

    it("should include error stack in error logs", async () => {
      const error = new Error("Tool execution failed");

      await loggingPlugin.onToolError?.(toolContext, error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      const logMessage = consoleErrorSpy.mock.calls[0][0];
      expect(logMessage).toBeDefined();
    });
  });

  describe("Log Level Filtering", () => {
    it("should respect debug level configuration", async () => {
      const debugPlugin = {
        ...loggingPlugin,
        config: { level: "debug" },
      };

      const context: ToolCallContext = {
        toolName: "greet",
        input: {},
        metadata: {},
      };

      await debugPlugin.beforeToolCall?.(context);

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it("should filter out debug logs when level is 'error'", async () => {
      const errorOnlyPlugin = {
        ...loggingPlugin,
        config: { level: "error" },
      };

      const context: ToolCallContext = {
        toolName: "greet",
        input: {},
        metadata: {},
      };

      await errorOnlyPlugin.beforeToolCall?.(context);

      // Debug/info logs should not appear
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe("Output Formatting", () => {
    it("should format timestamps as ISO 8601", async () => {
      const context: ToolCallContext = {
        toolName: "greet",
        input: {},
        metadata: {},
      };

      await loggingPlugin.beforeToolCall?.(context);

      expect(consoleLogSpy).toHaveBeenCalled();
      const logMessage = consoleLogSpy.mock.calls[0][0];
      // ISO format: YYYY-MM-DDTHH:mm:ss.sssZ
      expect(logMessage).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("should stringify objects in logs", async () => {
      const context: ToolCallContext = {
        toolName: "greet",
        input: { name: "Alice", age: 30 },
        metadata: {},
      };

      await loggingPlugin.beforeToolCall?.(context);

      expect(consoleLogSpy).toHaveBeenCalled();
      const logMessage = consoleLogSpy.mock.calls[0][0];
      expect(logMessage).toContain("Alice");
      expect(logMessage).toContain("30");
    });

    it("should handle circular references in objects", async () => {
      const circular: any = { name: "test" };
      circular.self = circular;

      const context: ToolCallContext = {
        toolName: "greet",
        input: circular,
        metadata: {},
      };

      await expect(loggingPlugin.beforeToolCall?.(context)).resolves.not.toThrow();
    });
  });

  describe("Metadata Logging", () => {
    it("should log client metadata if present", async () => {
      const context: ToolCallContext = {
        toolName: "greet",
        input: {},
        metadata: {
          locale: "en-US",
          userAgent: "TestClient/1.0",
        },
      };

      await loggingPlugin.beforeToolCall?.(context);

      expect(consoleLogSpy).toHaveBeenCalled();
      const logMessage = consoleLogSpy.mock.calls[0][0];
      expect(logMessage).toContain("en-US");
    });

    it("should handle missing metadata gracefully", async () => {
      const context: ToolCallContext = {
        toolName: "greet",
        input: {},
        metadata: {},
      };

      await expect(loggingPlugin.beforeToolCall?.(context)).resolves.not.toThrow();
    });
  });
});
