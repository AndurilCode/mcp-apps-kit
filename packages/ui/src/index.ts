/**
 * @mcp-apps-kit/ui
 *
 * Client-side SDK for MCP applications (vanilla JavaScript).
 *
 * @example
 * ```typescript
 * import { createClient } from "@mcp-apps-kit/ui";
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
  ToolMethods,
  ToolResult,
  AppsClient,
  CreateClientOptions,
  DetectedProtocol,
  // Modal types
  ModalButton,
  ModalInput,
  ModalOptions,
  ModalResult,
  // New MCP Apps API types
  HostCapabilities,
  HostVersion,
  AppCapabilities,
  SizeChangedParams,
  AppToolDefinition,
  CallToolHandler,
  ListToolsHandler,
} from "./types";

// Constants
export { LATEST_PROTOCOL_VERSION, RESOURCE_MIME_TYPE, RESOURCE_URI_META_KEY } from "./constants";

// Utility functions
export {
  applyDocumentTheme,
  getDocumentTheme,
  applyHostStyleVariables,
  applyHostFonts,
  removeHostFonts,
  clearHostStyleVariables,
} from "./utils";
export type { Theme } from "./utils";

// Error types
export { UIError, UIErrorCode } from "./errors";
export type { UIErrorCodeType } from "./errors";

// Adapter types
export type { ProtocolAdapter, AdapterFactory, AdapterType } from "./adapters/types";

// Debug logging types and utilities
export type { DebugLogLevel, LogEntry, ClientDebugConfig } from "./debug/logger";
export {
  ClientDebugLogger,
  clientDebugLogger,
  shouldLog,
  safeSerialize,
  safeStringify,
} from "./debug/logger";

// =============================================================================
// ADAPTER EXPORTS
// =============================================================================

export { MockAdapter } from "./adapters/mock";
export { McpAdapter } from "./adapters/mcp";
export { OpenAIAdapter } from "./adapters/openai";

// =============================================================================
// DETECTION
// =============================================================================

export { detectProtocol } from "./detection";

// =============================================================================
// CLIENT FACTORY (INTERNAL)
// =============================================================================

export { createAppsClient } from "./client";

// =============================================================================
// CLIENT FACTORY
// =============================================================================

import type { AppsClient, CreateClientOptions, ToolDefs } from "./types";
import type { ProtocolAdapter } from "./adapters/types";
import { detectProtocol } from "./detection";
import { MockAdapter } from "./adapters/mock";
import { McpAdapter } from "./adapters/mcp";
import { OpenAIAdapter } from "./adapters/openai";
import { createAppsClient } from "./client";
import { clientDebugLogger } from "./debug/logger";

/**
 * Create an adapter based on detected or forced protocol
 */
function createAdapter(protocol: "mcp" | "openai" | "mock"): ProtocolAdapter {
  switch (protocol) {
    case "mcp":
      return new McpAdapter();
    case "openai":
      return new OpenAIAdapter();
    case "mock":
      return new MockAdapter();
    default:
      throw new Error(`Unknown adapter type: ${protocol as string}`);
  }
}

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
  options?: CreateClientOptions
): Promise<AppsClient<T>> {
  // Determine which adapter to use
  const protocol = options?.forceAdapter ?? detectProtocol();

  // Validate the adapter type
  if (!["mcp", "openai", "mock"].includes(protocol)) {
    throw new Error(`Unknown adapter type: ${protocol}`);
  }

  // Create and connect the adapter
  const adapter = createAdapter(protocol);
  await adapter.connect();

  // Configure the global debug logger with the connected adapter
  // This enables MCP transport for debug logging
  clientDebugLogger.setAdapter(adapter);

  // Create and return the client
  return createAppsClient<T>(adapter);
}
