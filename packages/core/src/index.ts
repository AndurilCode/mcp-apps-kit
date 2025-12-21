/**
 * @apps-builder/core
 *
 * Server-side framework for building MCP applications.
 */

// Types
export type {
  Visibility,
  ToolDef,
  ToolDefs,
  CSPConfig,
  UIDef,
  UIDefs,
  AuthConfig,
  CORSConfig,
  AppConfig,
  StartOptions,
  App,
  InferToolInputs,
  InferToolOutputs,
} from "./types/tools";

// Main entry point (placeholder - will be implemented in Phase 3)
export function createApp<T extends Record<string, unknown>>(
  _config: unknown
): { tools: T; start: () => Promise<void>; getServer: () => unknown; handler: () => unknown; handleRequest: () => Promise<Response> } {
  throw new Error("Not implemented yet - Phase 3");
}

// Helper functions (placeholder - will be implemented in Phase 3)
export function defineTool<TInput, TOutput>(_def: unknown): unknown {
  throw new Error("Not implemented yet - Phase 3");
}

export function defineUI(_def: unknown): unknown {
  throw new Error("Not implemented yet - Phase 3");
}
