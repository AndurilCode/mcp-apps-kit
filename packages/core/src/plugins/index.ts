/**
 * Plugin System
 *
 * @module plugins
 */

// Re-export all types and helpers
export type {
  Plugin,
  PluginInitContext,
  PluginStartContext,
  PluginShutdownContext,
  ToolCallContext,
  RequestContext,
  ResponseContext,
  UILoadContext,
  InferPluginConfig,
} from "./types";

export { createPlugin } from "./types";

// Export PluginManager (internal use)
export { PluginManager } from "./PluginManager";

// Export built-in plugins
export { loggingPlugin } from "./builtin/logging";
