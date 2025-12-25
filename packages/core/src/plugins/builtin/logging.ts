/**
 * Built-in Logging Plugin
 *
 * Provides structured logging for tool execution and app lifecycle events.
 *
 * Features:
 * - Configurable log levels (debug, info, warn, error)
 * - Tool call logging (before/after/error)
 * - Lifecycle event logging (init, start, shutdown)
 * - ISO 8601 timestamps
 * - Metadata logging
 *
 * @module plugins/builtin/logging
 */

import { z } from "zod";
import { createPlugin } from "../types";
import type { ToolCallContext, PluginInitContext, PluginStartContext } from "../types";

/**
 * Log level enumeration
 */
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const;

/**
 * Log level configuration schema
 */
const loggingConfigSchema = z.object({
  level: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

/**
 * Get numeric log level
 */
function getLogLevel(level: string): number {
  switch (level) {
    case "debug":
      return LogLevel.DEBUG;
    case "info":
      return LogLevel.INFO;
    case "warn":
      return LogLevel.WARN;
    case "error":
      return LogLevel.ERROR;
    default:
      return LogLevel.INFO;
  }
}

/**
 * Format timestamp as ISO 8601
 */
function timestamp(): string {
  return new Date().toISOString();
}

/**
 * Safely stringify objects, handling circular references
 */
function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    try {
      return JSON.stringify(obj, getCircularReplacer(), 2);
    } catch {
      return String(obj);
    }
  }
}

/**
 * JSON replacer function that handles circular references
 */
function getCircularReplacer() {
  const seen = new WeakSet();
  return (_key: string, value: unknown): unknown => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);
    }
    return value;
  };
}

/**
 * Built-in logging plugin
 *
 * Logs all tool executions and app lifecycle events.
 *
 * @example
 * ```typescript
 * import { createApp, loggingPlugin } from '@mcp-apps-kit/core';
 *
 * const app = createApp({
 *   name: 'my-app',
 *   version: '1.0.0',
 *   tools: { ... },
 *   plugins: [loggingPlugin],
 * });
 * ```
 */
export const loggingPlugin = createPlugin({
  name: "logging",
  version: "1.0.0",
  configSchema: loggingConfigSchema,
  config: {
    level: "info",
  },

  onInit: async (context: PluginInitContext) => {
    const level = getLogLevel(loggingPlugin.config?.level ?? "info");
    if (level <= LogLevel.INFO) {
      const toolCount = Object.keys(context.tools).length;
      // eslint-disable-next-line no-console
      console.log(
        `[${timestamp()}] [INFO] App initialized: ${context.config.name} v${context.config.version} (${toolCount} tools)`
      );
    }
  },

  onStart: async (context: PluginStartContext) => {
    const level = getLogLevel(loggingPlugin.config?.level ?? "info");
    if (level <= LogLevel.INFO) {
      if (context.transport === "http" && context.port) {
        // eslint-disable-next-line no-console
        console.log(`[${timestamp()}] [INFO] Server started on port ${context.port} (HTTP)`);
      } else {
        // eslint-disable-next-line no-console
        console.log(`[${timestamp()}] [INFO] Server started (stdio)`);
      }
    }
  },

  beforeToolCall: async (context: ToolCallContext) => {
    const level = getLogLevel(loggingPlugin.config?.level ?? "info");
    if (level <= LogLevel.INFO) {
      const inputStr = safeStringify(context.input);
      const metadataStr = context.metadata.locale ? ` [locale: ${context.metadata.locale}]` : "";
      // eslint-disable-next-line no-console
      console.log(`[${timestamp()}] [INFO] Tool called: ${context.toolName}${metadataStr}`);
      // eslint-disable-next-line no-console
      console.log(`  Input: ${inputStr}`);
    }
  },

  afterToolCall: async (context: ToolCallContext, result: unknown) => {
    const level = getLogLevel(loggingPlugin.config?.level ?? "info");
    if (level <= LogLevel.INFO) {
      const resultStr = safeStringify(result);
      // eslint-disable-next-line no-console
      console.log(`[${timestamp()}] [INFO] Tool completed: ${context.toolName}`);
      // eslint-disable-next-line no-console
      console.log(`  Result: ${resultStr}`);
    }
  },

  onToolError: async (context: ToolCallContext, error: Error) => {
    const level = getLogLevel(loggingPlugin.config?.level ?? "info");
    if (level <= LogLevel.ERROR) {
      // eslint-disable-next-line no-console
      console.error(`[${timestamp()}] [ERROR] Tool failed: ${context.toolName}`);
      // eslint-disable-next-line no-console
      console.error(`  Error: ${error.message}`);
      if (error.stack) {
        // eslint-disable-next-line no-console
        console.error(`  Stack: ${error.stack}`);
      }
    }
  },
});
