/**
 * @mcp-apps-kit/ui
 *
 * Client-side SDK for MCP applications (vanilla JavaScript).
 *
 * @example
 * ```typescript
 * import { createClient } from "@mcp-apps-kit/ui";
 *
 * // Auto-detects platform (MCP Apps vs ChatGPT)
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
  ContainerDimensions,
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
  // Model context types (ext-apps v0.4.0+)
  ContentBlock,
  UpdateModelContextParams,
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
export type { DebugLogLevel, DebugTransport, LogEntry, ClientDebugConfig } from "./debug/logger";
export {
  ClientDebugLogger,
  clientDebugLogger,
  shouldLog,
  safeSerialize,
  safeStringify,
} from "./debug/logger";

// Server configuration utilities (for build-time injected config)
export type { McpServerConfig } from "./config";
export { getMcpServerConfig, getMcpServerBaseUrl } from "./config";

// =============================================================================
// ADAPTER EXPORTS
// =============================================================================

export { MockAdapter } from "./adapters/mock";
export { McpAdapter, type McpAdapterOptions } from "./adapters/mcp";
export { OpenAIAdapter } from "./adapters/openai";

// =============================================================================
// DETECTION
// =============================================================================

export { detectProtocol } from "./detection";

// =============================================================================
// CLIENT FACTORY (INTERNAL)
// =============================================================================

import type { AppsClient, CreateClientOptions, ToolDefs } from "./types";
import type { ProtocolAdapter } from "./adapters/types";
import { detectProtocol } from "./detection";
import { MockAdapter } from "./adapters/mock";
import { McpAdapter, type McpAdapterOptions } from "./adapters/mcp";
import { OpenAIAdapter } from "./adapters/openai";
import { createAppsClient } from "./client";
import { clientDebugLogger } from "./debug/logger";

export { createAppsClient } from "./client";

/**
 * Options passed to adapter creation
 */
interface AdapterOptions {
  /** Options specific to MCP adapter */
  mcp?: McpAdapterOptions;
}

/**
 * Create an adapter based on detected or forced protocol
 */
function createAdapter(
  protocol: "mcp" | "openai" | "mock",
  options?: AdapterOptions
): ProtocolAdapter {
  switch (protocol) {
    case "mcp":
      return new McpAdapter(options?.mcp);
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
 * Automatically detects the host platform (MCP Apps vs ChatGPT)
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
 * // Disable auto-resize for MCP adapter
 * const client = await createClient({ autoResize: false });
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

  // Build adapter-specific options (only include when explicitly provided)
  const adapterOptions: AdapterOptions | undefined =
    options?.autoResize !== undefined ? { mcp: { autoResize: options.autoResize } } : undefined;

  // Create and connect the adapter
  const adapter = createAdapter(protocol, adapterOptions);
  await adapter.connect();

  // Configure the global debug logger with the connected adapter
  // This enables MCP transport for debug logging
  clientDebugLogger.setAdapter(adapter);

  // Create and return the client
  return createAppsClient<T>(adapter);
}

/**
 * Create a typed client from an App instance.
 *
 * Convenience function that automatically extracts client types from
 * your App instance, eliminating manual type exports.
 *
 * @param app - App instance from @mcp-apps-kit/core with clientTypes
 * @param options - Optional client configuration (forceAdapter, autoResize)
 * @returns Fully typed AppsClient
 *
 * @example Single-version app
 * ```typescript
 * // server.ts
 * import { createApp, defineTool } from "@mcp-apps-kit/core";
 * const app = createApp({
 *   tools: { greet: defineTool({ ... }) }
 * });
 * export { app };
 *
 * // ui.tsx
 * import { createTypedClient } from "@mcp-apps-kit/ui";
 * import { app } from "./server";
 * const client = await createTypedClient(app);
 * client.tools.callGreet({ name: "Alice" }); // Fully typed!
 * ```
 *
 * @example Multi-version app
 * ```typescript
 * // server.ts
 * const app = createApp({
 *   versions: {
 *     v1: { version: "1.0.0", tools: { ... } },
 *     v2: { version: "2.0.0", tools: { ... } }
 *   }
 * });
 * export const v1 = app.getVersion("v1")!;
 * export const v2 = app.getVersion("v2")!;
 *
 * // ui.tsx
 * const client = await createTypedClient(v1);
 * ```
 */
export async function createTypedClient<T extends ToolDefs>(
  _app: { readonly clientTypes: T },
  options?: CreateClientOptions
): Promise<AppsClient<T>> {
  return createClient<T>(options);
}
