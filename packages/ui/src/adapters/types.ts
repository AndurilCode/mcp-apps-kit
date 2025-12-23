/**
 * Protocol adapter type definitions for @mcp-apps-kit/ui
 *
 * Defines the internal interface for protocol adapters that map
 * the unified AppsClient API to platform-specific implementations.
 */

import type { HostContext, ResourceContent } from "../types";

// =============================================================================
// PROTOCOL ADAPTER INTERFACE
// =============================================================================

/**
 * Internal interface for protocol adapters
 *
 * Implemented by:
 * - McpAppsAdapter: For Claude Desktop (MCP Apps)
 * - ChatGptAppsAdapter: For ChatGPT (OpenAI Apps SDK)
 * - MockAdapter: For development/testing
 *
 * Each adapter translates the unified API to the platform-specific SDK.
 */
export interface ProtocolAdapter {
  // === Lifecycle ===

  /**
   * Connect to the host platform
   * Called during client initialization
   */
  connect(): Promise<void>;

  /**
   * Check if the adapter is connected
   */
  isConnected(): boolean;

  // === Tool Operations ===

  /**
   * Call a server tool
   *
   * @param name - Tool name
   * @param args - Tool arguments
   * @returns Tool result
   */
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;

  // === Messaging ===

  /**
   * Send a message to the conversation
   *
   * @param content - Message content
   */
  sendMessage(content: { type: string; text: string }): Promise<void>;

  // === Navigation ===

  /**
   * Open an external link
   *
   * @param url - URL to open
   */
  openLink(url: string): Promise<void>;

  /**
   * Request a different display mode
   *
   * @param mode - Target display mode
   * @returns Actual mode applied
   */
  requestDisplayMode(mode: string): Promise<{ mode: string }>;

  /**
   * Request widget close
   * May be a no-op on some platforms
   */
  requestClose(): void;

  // === State ===

  /**
   * Get persisted widget state
   * On MCP Apps: Returns null (silent no-op for graceful degradation)
   * On ChatGPT: Returns session-scoped state
   *
   * @returns State or null if not set
   */
  getState<S>(): S | null;

  /**
   * Set persisted widget state
   * On MCP Apps: Silent no-op (graceful degradation)
   * On ChatGPT: Persists session-scoped state
   *
   * @param state - State to persist
   */
  setState<S>(state: S): void;

  // === Files (Platform-Dependent) ===

  /**
   * Upload a file
   * May throw on unsupported platforms
   *
   * @param file - File to upload
   * @returns File ID
   */
  uploadFile?(file: File): Promise<{ fileId: string }>;

  /**
   * Get file download URL
   * May throw on unsupported platforms
   *
   * @param fileId - File ID
   * @returns Download URL
   */
  getFileDownloadUrl?(fileId: string): Promise<{ downloadUrl: string }>;

  // === Resources ===

  /**
   * Read an MCP resource
   *
   * @param uri - Resource URI
   * @returns Resource contents
   */
  readResource(uri: string): Promise<{ contents: ResourceContent[] }>;

  // === Logging ===

  /**
   * Log to host console
   *
   * @param level - Log level
   * @param data - Data to log
   */
  log(level: string, data: unknown): void;

  // === Events ===

  /**
   * Subscribe to tool results
   *
   * @param handler - Callback for tool results
   * @returns Unsubscribe function
   */
  onToolResult(handler: (result: unknown) => void): () => void;

  /**
   * Subscribe to tool input changes
   *
   * @param handler - Callback for tool input
   * @returns Unsubscribe function
   */
  onToolInput(handler: (input: unknown) => void): () => void;

  /**
   * Subscribe to tool cancellation
   *
   * @param handler - Callback for cancellation
   * @returns Unsubscribe function
   */
  onToolCancelled(handler: (reason?: string) => void): () => void;

  /**
   * Subscribe to host context changes
   *
   * @param handler - Callback for context changes
   * @returns Unsubscribe function
   */
  onHostContextChange(handler: (context: HostContext) => void): () => void;

  /**
   * Subscribe to teardown events
   *
   * @param handler - Callback for teardown
   * @returns Unsubscribe function
   */
  onTeardown(handler: (reason?: string) => void): () => void;

  // === Accessors ===

  /**
   * Get current host context
   */
  getHostContext(): HostContext;

  /**
   * Get current tool input
   */
  getToolInput(): Record<string, unknown> | undefined;

  /**
   * Get current tool output
   */
  getToolOutput(): Record<string, unknown> | undefined;

  /**
   * Get current tool metadata
   */
  getToolMeta(): Record<string, unknown> | undefined;
}

// =============================================================================
// ADAPTER FACTORY TYPE
// =============================================================================

/**
 * Factory function type for creating protocol adapters
 */
export type AdapterFactory = () => ProtocolAdapter;

/**
 * Adapter type identifiers
 */
export type AdapterType = "mcp" | "openai" | "mock";
