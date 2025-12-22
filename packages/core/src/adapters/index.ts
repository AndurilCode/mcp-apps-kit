/**
 * Protocol adapters module
 *
 * Provides adapter factory and exports for protocol-specific metadata generation.
 */

import type { Protocol } from "../types/config";
import type { ProtocolAdapter } from "./types";
import { McpAdapter } from "./mcp";
import { OpenAIAdapter } from "./openai";

// =============================================================================
// ADAPTER FACTORY
// =============================================================================

/**
 * Create a protocol adapter for the specified protocol
 *
 * @param protocol - Target protocol ("mcp" | "openai")
 * @returns Protocol-specific adapter instance
 *
 * @example
 * ```typescript
 * const adapter = createAdapter("openai");
 * const toolMeta = adapter.buildToolMeta(toolDef, "my-server");
 * ```
 */
export function createAdapter(protocol: Protocol): ProtocolAdapter {
  return protocol === "openai" ? new OpenAIAdapter() : new McpAdapter();
}

// =============================================================================
// EXPORTS
// =============================================================================

export type { ProtocolAdapter, ToolMetaResult, UIResourceMetaResult } from "./types";
export { McpAdapter } from "./mcp";
export { OpenAIAdapter } from "./openai";
