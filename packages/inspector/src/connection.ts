/**
 * Connection management for MCP Inspector Server
 *
 * Manages the connection lifecycle to target MCP servers using @mcp-apps-kit/testing.
 */

import { createTestClient, type TestClient, type ToolCall } from "@mcp-apps-kit/testing";
import type {
  ConnectionState,
  ConnectOptions,
  ServerInfo,
  InspectorServerOptions,
  HistoryEntry,
  EnvironmentState,
} from "./types";

/**
 * Get default environment state
 */
function getDefaultEnvironmentState(): EnvironmentState {
  return {
    theme: "light",
    locale: "en-US",
    timeZone: "UTC",
    displayMode: "inline",
    viewport: { width: 800, height: 600 },
    maxHeight: undefined,
    safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    userAgent: {
      device: { type: "desktop" },
      capabilities: { hover: true, touch: false },
    },
    userLocation: undefined,
  };
}

/**
 * Connection manager for the inspector server
 */
export class ConnectionManager {
  private state: ConnectionState = {
    connected: false,
    serverUrl: null,
    serverInfo: null,
    historyEnabled: true,
    callCount: 0,
    client: null,
  };

  private environmentState: EnvironmentState;
  private readonly maxHistorySize: number;
  private readonly defaultTimeout: number;
  private readonly debug: boolean;

  constructor(options: InspectorServerOptions = {}) {
    this.maxHistorySize = options.maxHistorySize ?? 1000;
    this.defaultTimeout = options.defaultTimeout ?? 30000;
    this.debug = options.debug ?? false;
    this.environmentState = getDefaultEnvironmentState();
  }

  /**
   * Connect to a target MCP server
   */
  async connect(
    url: string,
    options: ConnectOptions = {}
  ): Promise<{
    serverInfo: ServerInfo | null;
    toolCount: number;
    resourceCount: number;
    promptCount: number;
  }> {
    const { trackHistory = true, timeout = this.defaultTimeout } = options;

    // Validate URL
    try {
      new URL(url);
    } catch {
      throw new Error(`Invalid URL format: '${url}'. Expected format: http(s)://host:port/path`);
    }

    // Disconnect existing connection if any
    if (this.state.connected && this.state.client) {
      if (this.debug) {
        console.log(`[inspector] Disconnecting from previous server: ${this.state.serverUrl}`);
      }
      await this.disconnect();
    }

    if (this.debug) {
      console.log(`[inspector] Connecting to server: ${url}`);
    }

    // Create test client using @mcp-apps-kit/testing
    const client = await createTestClient(url, {
      trackHistory,
      timeout,
    });

    // Get server capabilities by listing tools, resources, prompts
    // Use try-catch for each to handle servers that don't support all capabilities
    let tools: Awaited<ReturnType<typeof client.listTools>> = [];
    let resources: Awaited<ReturnType<typeof client.listResources>> = [];
    let prompts: Awaited<ReturnType<typeof client.listPrompts>> = [];

    try {
      tools = await client.listTools();
    } catch {
      // Server doesn't support tools capability
      if (this.debug) {
        console.log(`[inspector] Server doesn't support tools capability`);
      }
    }

    try {
      resources = await client.listResources();
    } catch {
      // Server doesn't support resources capability
      if (this.debug) {
        console.log(`[inspector] Server doesn't support resources capability`);
      }
    }

    try {
      prompts = await client.listPrompts();
    } catch {
      // Server doesn't support prompts capability
      if (this.debug) {
        console.log(`[inspector] Server doesn't support prompts capability`);
      }
    }

    // Note: The MCP SDK client doesn't directly expose server info
    // We'll extract it from the raw client if available
    let serverInfo: ServerInfo | null = null;
    try {
      // Access server info from raw client if available
      const rawClient = client.raw;
      if (rawClient && "getServerVersion" in rawClient) {
        const version = (
          rawClient as unknown as {
            getServerVersion: () => { name: string; version: string } | undefined;
          }
        ).getServerVersion();
        if (version) {
          serverInfo = { name: version.name, version: version.version };
        }
      }
    } catch {
      // Server info not available, continue without it
      serverInfo = null;
    }

    // Update state
    this.state = {
      connected: true,
      serverUrl: url,
      serverInfo,
      historyEnabled: trackHistory,
      callCount: 0,
      client,
    };

    if (this.debug) {
      console.log(`[inspector] Connected to ${url}`);
      console.log(
        `[inspector] Tools: ${tools.length}, Resources: ${resources.length}, Prompts: ${prompts.length}`
      );
    }

    return {
      serverInfo,
      toolCount: tools.length,
      resourceCount: resources.length,
      promptCount: prompts.length,
    };
  }

  /**
   * Disconnect from the current target server
   */
  async disconnect(): Promise<string | null> {
    const previousUrl = this.state.serverUrl;

    if (this.state.client) {
      try {
        await this.state.client.disconnect();
      } catch (error) {
        if (this.debug) {
          console.warn(`[inspector] Error during disconnect:`, error);
        }
      }
    }

    // Reset state
    this.state = {
      connected: false,
      serverUrl: null,
      serverInfo: null,
      historyEnabled: false,
      callCount: 0,
      client: null,
    };

    if (this.debug) {
      console.log(`[inspector] Disconnected from ${previousUrl}`);
    }

    return previousUrl;
  }

  /**
   * Get the current connection state
   */
  getState(): ConnectionState {
    return { ...this.state };
  }

  /**
   * Get the test client (throws if not connected)
   */
  getClient(): TestClient {
    if (!this.state.connected || !this.state.client) {
      throw new Error("No active connection. Call connect_to_server first.");
    }
    return this.state.client;
  }

  /**
   * Increment call count
   */
  incrementCallCount(): void {
    this.state.callCount++;
  }

  /**
   * Get call history from the test client
   */
  getCallHistory(): HistoryEntry[] {
    if (!this.state.client) {
      return [];
    }

    const history = this.state.client.getCallHistory();

    // Limit to max history size
    const limitedHistory = history.slice(-this.maxHistorySize);

    // Convert to HistoryEntry format
    return limitedHistory.map((call: ToolCall) => ({
      name: call.name,
      args: call.args as Record<string, unknown>,
      result: {
        content: call.result?.content ?? [],
        isError: call.result?.isError ?? false,
      },
      duration: call.duration,
      timestamp: call.timestamp.toISOString(),
    }));
  }

  /**
   * Clear call history
   */
  clearHistory(): number {
    if (!this.state.client) {
      return 0;
    }

    const count = this.state.client.getCallHistory().length;
    this.state.client.clearHistory();
    this.state.callCount = 0;
    return count;
  }

  /**
   * Check if history tracking is enabled
   */
  isHistoryEnabled(): boolean {
    return this.state.historyEnabled;
  }

  /**
   * Get the current environment state
   */
  getEnvironmentState(): EnvironmentState {
    return { ...this.environmentState };
  }

  /**
   * Update environment state (partial update, merges with current state)
   */
  setEnvironmentState(partial: Partial<EnvironmentState>): EnvironmentState {
    // Merge partial update with current state
    this.environmentState = {
      ...this.environmentState,
      ...partial,
      // Handle nested objects properly
      viewport: partial.viewport
        ? { ...this.environmentState.viewport, ...partial.viewport }
        : this.environmentState.viewport,
      safeAreaInsets: partial.safeAreaInsets
        ? { ...this.environmentState.safeAreaInsets, ...partial.safeAreaInsets }
        : this.environmentState.safeAreaInsets,
      userAgent: partial.userAgent
        ? {
            device: partial.userAgent.device
              ? { ...this.environmentState.userAgent.device, ...partial.userAgent.device }
              : this.environmentState.userAgent.device,
            capabilities: partial.userAgent.capabilities
              ? {
                  ...this.environmentState.userAgent.capabilities,
                  ...partial.userAgent.capabilities,
                }
              : this.environmentState.userAgent.capabilities,
          }
        : this.environmentState.userAgent,
    };

    if (this.debug) {
      console.log(`[inspector] Environment state updated:`, partial);
    }

    return { ...this.environmentState };
  }

  /**
   * Reset environment state to defaults
   */
  resetEnvironmentState(): EnvironmentState {
    this.environmentState = getDefaultEnvironmentState();

    if (this.debug) {
      console.log(`[inspector] Environment state reset to defaults`);
    }

    return { ...this.environmentState };
  }
}
