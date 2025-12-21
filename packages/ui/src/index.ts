/**
 * @apps-builder/ui
 *
 * Client-side SDK for MCP applications (vanilla JavaScript).
 */

// Types
export type {
  Viewport,
  SafeAreaInsets,
  DeviceCapabilities,
  HostStyles,
  HostContext,
  ResourceContent,
  ToolResult,
  AppsClient,
  CreateClientOptions,
  DetectedProtocol,
} from "./types";

// Main entry point (placeholder - will be implemented in Phase 5)
export async function createClient<T>(_options?: unknown): Promise<unknown> {
  throw new Error("Not implemented yet - Phase 5");
}

// Protocol detection (placeholder - will be implemented in Phase 5)
export function detectProtocol(): "mcp" | "openai" | "mock" {
  throw new Error("Not implemented yet - Phase 5");
}
