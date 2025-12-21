/**
 * @apps-builder/ui
 *
 * Client-side SDK for MCP applications (vanilla JavaScript).
 *
 * @example
 * ```typescript
 * import { createClient } from "@apps-builder/ui";
 *
 * // Auto-detects platform (Claude Desktop vs ChatGPT)
 * const client = await createClient();
 *
 * // Type-safe tool calls
 * const result = await client.callTool("greet", { name: "Alice" });
 *
 * // Subscribe to events
 * client.onHostContextChange((ctx) => {
 *   document.body.className = ctx.theme;
 * });
 * ```
 */

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type {
  Viewport,
  SafeAreaInsets,
  DeviceCapabilities,
  HostStyles,
  HostContext,
  ResourceContent,
  ToolDefs,
  InferToolInputs,
  InferToolOutputs,
  ToolResult,
  AppsClient,
  CreateClientOptions,
  DetectedProtocol,
} from "./types";

// Adapter types
export type { ProtocolAdapter, AdapterFactory, AdapterType } from "./adapters/types";

// =============================================================================
// MAIN ENTRY POINTS (Placeholders - Implemented in Phase 5)
// =============================================================================

import type { AppsClient, CreateClientOptions, DetectedProtocol, ToolDefs } from "./types";

/**
 * Create a unified client for UI code
 *
 * Automatically detects the host platform (Claude Desktop vs ChatGPT)
 * and returns a client with the appropriate adapter.
 *
 * @param options - Optional configuration
 * @returns Connected client instance
 *
 * @example
 * ```typescript
 * // Auto-detect platform
 * const client = await createClient();
 *
 * // Force a specific adapter (for testing)
 * const mockClient = await createClient({ forceAdapter: "mock" });
 *
 * // With typed tools
 * import type { app } from "./server";
 * const typedClient = await createClient<typeof app.tools>();
 * ```
 */
export async function createClient<T extends ToolDefs = ToolDefs>(
  _options?: CreateClientOptions
): Promise<AppsClient<T>> {
  // Placeholder - will be implemented in Phase 5
  throw new Error("createClient() not implemented yet - Phase 5");
}

/**
 * Detect the current host protocol
 *
 * Detection order:
 * 1. `window.openai` exists → ChatGPT Apps
 * 2. `window.parent !== window` (iframe) → MCP Apps
 * 3. Neither → Mock (development mode)
 *
 * @returns Detected protocol type
 *
 * @example
 * ```typescript
 * const protocol = detectProtocol();
 * console.log(`Running on: ${protocol}`); // "mcp", "openai", or "mock"
 * ```
 */
export function detectProtocol(): DetectedProtocol {
  // Placeholder - will be implemented in Phase 5
  if (typeof window === "undefined") {
    return "mock";
  }

  // Check for OpenAI/ChatGPT
  if ("openai" in window) {
    return "openai";
  }

  // Check for iframe (MCP Apps)
  if (window.parent !== window) {
    return "mcp";
  }

  // Default to mock for development
  return "mock";
}
