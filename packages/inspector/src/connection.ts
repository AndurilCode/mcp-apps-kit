/**
 * Connection management for MCP Inspector Server
 *
 * Manages the connection lifecycle to target MCP servers using @mcp-apps-kit/testing.
 */

import { EventEmitter } from "node:events";
import { createTestClient, type TestClient, type ToolCall } from "@mcp-apps-kit/testing";
import type {
  ConnectionState,
  ConnectOptions,
  ServerInfo,
  InspectorServerOptions,
  HistoryEntry,
  EnvironmentState,
  TargetServerSchema,
} from "./types";
import { WidgetSessionManager } from "./widget-session-manager";
import { WidgetServer } from "./widget-server";

/**
 * Events emitted by ConnectionManager
 */
export interface ConnectionManagerEvents {
  /** Emitted when target server schema is updated (on connect) */
  schemaUpdated: [schema: TargetServerSchema];
  /** Emitted when disconnected from target server */
  disconnected: [previousUrl: string | null];
}

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
 *
 * Extends EventEmitter to support schema update notifications for dual-mode proxy.
 *
 * @emits schemaUpdated - When target server schema is cached (after connect)
 * @emits disconnected - When disconnected from target server
 */
export class ConnectionManager extends EventEmitter {
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
  private widgetSessionManager: WidgetSessionManager;
  private widgetServer: WidgetServer | null = null;

  /** Cached target server schema for proxy tool generation */
  private targetSchema: TargetServerSchema | null = null;

  /** Auth token for proxied requests (from OAuth flow) */
  private authToken: string | null = null;

  /** Inspector URL for injected sync scripts (set when server starts) */
  private inspectorUrl: string | null = null;

  /** Raw MCP hostContext from external widget (for session creation) */
  private externalMcpHostContext: Record<string, unknown> | null = null;

  constructor(options: InspectorServerOptions = {}) {
    super();
    this.maxHistorySize = options.maxHistorySize ?? 1000;
    this.defaultTimeout = options.defaultTimeout ?? 30000;
    this.debug = options.debug ?? false;
    this.environmentState = getDefaultEnvironmentState();
    this.widgetSessionManager = new WidgetSessionManager({
      ttl: options.sessionTtl ?? 5 * 60 * 1000, // Use option or default 5 min
      debug: this.debug,
    });
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

    // Cache target schema with full metadata for proxy generation
    // Use type assertions to access optional properties that may exist at runtime
    type ExtendedTool = (typeof tools)[number] & {
      title?: string;
      outputSchema?: Record<string, unknown>;
      _meta?: Record<string, unknown>;
      annotations?: Record<string, unknown>;
    };
    type ExtendedResource = (typeof resources)[number] & {
      mimeType?: string;
      _meta?: Record<string, unknown>;
      annotations?: Record<string, unknown>;
    };
    type ExtendedPrompt = (typeof prompts)[number] & {
      arguments?: Array<{ name: string; description?: string; required?: boolean }>;
      _meta?: Record<string, unknown>;
    };

    this.targetSchema = {
      tools: tools.map((t) => {
        const extended = t as ExtendedTool;
        return {
          name: extended.name,
          title: extended.title,
          description: extended.description,
          inputSchema: extended.inputSchema,
          outputSchema: extended.outputSchema,
          // Preserve all MCP metadata (ui bindings, etc.)
          _meta: extended._meta,
          annotations: extended.annotations,
        };
      }),
      resources: resources.map((r) => {
        const extended = r as ExtendedResource;
        return {
          uri: extended.uri,
          name: extended.name,
          description: extended.description,
          mimeType: extended.mimeType,
          // Preserve resource metadata
          _meta: extended._meta,
          annotations: extended.annotations,
        };
      }),
      prompts: prompts.map((p) => {
        const extended = p as ExtendedPrompt;
        return {
          name: extended.name,
          description: extended.description,
          arguments: extended.arguments,
          _meta: extended._meta,
        };
      }),
      serverInfo,
      capturedAt: Date.now(),
    };

    // Emit schemaUpdated event for proxy regeneration
    this.emit("schemaUpdated", this.targetSchema);

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

    // Close all widget sessions
    await this.widgetSessionManager.closeAllSessions();

    // Stop the widget server
    await this.stopWidgetServer();

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

    // Clear cached schema
    this.targetSchema = null;

    // Clear auth token
    this.authToken = null;

    if (this.debug) {
      console.log(`[inspector] Disconnected from ${previousUrl}`);
    }

    // Emit disconnected event for proxy cleanup
    this.emit("disconnected", previousUrl);

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
   * Get the raw external MCP hostContext (from ui/initialize response)
   * This contains all fields including styles, containerDimensions, etc.
   */
  getExternalMcpHostContext(): Record<string, unknown> | null {
    return this.externalMcpHostContext ? { ...this.externalMcpHostContext } : null;
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

  /**
   * Get the widget session manager
   */
  getWidgetSessionManager(): WidgetSessionManager {
    return this.widgetSessionManager;
  }

  /**
   * Get the shared widget server (creates if needed)
   *
   * The WidgetServer is shared across all tool calls to ensure consistent
   * hostUrls and session management. This lazy initialization ensures the
   * server is only started when actually needed.
   */
  async getWidgetServer(): Promise<WidgetServer> {
    if (!this.widgetServer) {
      this.widgetServer = new WidgetServer({ debug: this.debug });
      await this.widgetServer.start();
      if (this.debug) {
        // eslint-disable-next-line no-console
        console.log(
          `[inspector] Shared WidgetServer started on port ${this.widgetServer.getPort()}`
        );
      }
    }
    return this.widgetServer;
  }

  /**
   * Check if widget server is running
   */
  hasWidgetServer(): boolean {
    return this.widgetServer !== null;
  }

  /**
   * Stop the widget server (called during cleanup)
   */
  async stopWidgetServer(): Promise<void> {
    if (this.widgetServer) {
      await this.widgetServer.stop();
      this.widgetServer = null;
      if (this.debug) {
        // eslint-disable-next-line no-console
        console.log(`[inspector] Shared WidgetServer stopped`);
      }
    }
  }

  /**
   * Get the cached target server schema
   *
   * @returns The cached schema or null if not connected
   */
  getTargetSchema(): TargetServerSchema | null {
    return this.targetSchema;
  }

  /**
   * Set the auth token for proxied requests (from OAuth flow)
   *
   * @param token - The OAuth token to use for proxied requests
   */
  setAuthToken(token: string): void {
    this.authToken = token;
    if (this.debug) {
      console.log(`[inspector] Auth token set`);
    }
  }

  /**
   * Get the current auth token
   *
   * @returns The current auth token or null
   */
  getAuthToken(): string | null {
    return this.authToken;
  }

  /**
   * Set the inspector URL (for injected sync scripts)
   *
   * @param url - The inspector URL (e.g., "http://localhost:6274")
   */
  setInspectorUrl(url: string): void {
    this.inspectorUrl = url;
    if (this.debug) {
      console.log(`[inspector] Inspector URL set to: ${url}`);
    }
  }

  /**
   * Get the inspector URL
   *
   * @returns The current inspector URL or null if not set
   */
  getInspectorUrl(): string | null {
    return this.inspectorUrl;
  }

  /**
   * Update environment from external globals (e.g., from /sync-events endpoint)
   *
   * Maps both OpenAI globals format and MCP hostContext format to EnvironmentState.
   * Also stores the raw hostContext for MCP protocol to use when creating new sessions.
   * Note: Event delivery to Playwright widgets is handled separately by
   * WidgetSessionManager.syncEvent() in dual-server.ts.
   *
   * @param globals - Globals/hostContext object from external source
   */
  updateEnvironmentFromGlobals(globals: Record<string, unknown>): void {
    // Store the raw hostContext for MCP sessions created later
    // This preserves all fields (styles, containerDimensions, etc.)
    this.externalMcpHostContext = { ...(this.externalMcpHostContext ?? {}), ...globals };

    if (this.debug) {
      console.log(`[inspector] Stored external MCP hostContext:`, this.externalMcpHostContext);
    }

    // Map OpenAI globals format OR MCP hostContext format to EnvironmentState
    const update: Partial<EnvironmentState> = {};

    // Theme (both protocols use 'theme')
    if (globals.theme !== undefined) update.theme = globals.theme as "light" | "dark";

    // Locale (both protocols use 'locale')
    if (globals.locale !== undefined) update.locale = globals.locale as string;

    // TimeZone (MCP uses 'timeZone')
    if (globals.timeZone !== undefined) update.timeZone = globals.timeZone as string;

    // Display mode (both protocols use 'displayMode')
    if (globals.displayMode !== undefined)
      update.displayMode = globals.displayMode as "inline" | "fullscreen" | "pip";

    // Max height (OpenAI uses 'maxHeight')
    if (globals.maxHeight !== undefined) update.maxHeight = globals.maxHeight as number;

    // Safe area insets
    // OpenAI format: { safeArea: { insets: {...} } }
    // MCP format: { safeAreaInsets: {...} }
    if (globals.safeArea !== undefined) {
      const safeArea = globals.safeArea as { insets?: Record<string, number> };
      if (safeArea.insets) {
        update.safeAreaInsets = safeArea.insets as {
          top: number;
          right: number;
          bottom: number;
          left: number;
        };
      }
    } else if (globals.safeAreaInsets !== undefined) {
      update.safeAreaInsets = globals.safeAreaInsets as {
        top: number;
        right: number;
        bottom: number;
        left: number;
      };
    }

    // Viewport (MCP uses 'viewport' or 'containerDimensions')
    if (globals.viewport !== undefined) {
      update.viewport = globals.viewport as { width: number; height: number };
    } else if (globals.containerDimensions !== undefined) {
      const dims = globals.containerDimensions as { width?: number; height?: number };
      if (dims.width !== undefined && dims.height !== undefined) {
        update.viewport = { width: dims.width, height: dims.height };
      }
    }

    // User agent (both protocols may use 'userAgent' but with different structures)
    if (globals.userAgent !== undefined) {
      // If it's an object with device/capabilities, use it directly
      if (typeof globals.userAgent === "object") {
        update.userAgent = globals.userAgent as {
          device?: { type?: string };
          capabilities?: { hover?: boolean; touch?: boolean };
        };
      }
    }
    // MCP may also have 'deviceCapabilities' separately
    if (globals.deviceCapabilities !== undefined) {
      update.userAgent = {
        ...update.userAgent,
        capabilities: globals.deviceCapabilities as { hover?: boolean; touch?: boolean },
      };
    }

    // User location (OpenAI uses 'userLocation')
    if (globals.userLocation !== undefined) {
      update.userLocation = globals.userLocation as {
        city?: string;
        region?: string;
        country?: string;
        timezone?: string;
      };
    }

    // Only update if we have changes
    if (Object.keys(update).length === 0) {
      if (this.debug) {
        console.log(`[inspector] No relevant environment fields in globals, skipping update`);
      }
      return;
    }

    // Update state using existing method (handles deep merging)
    this.setEnvironmentState(update);

    if (this.debug) {
      console.log(`[inspector] Environment updated from external globals:`, update);
    }
  }

  /**
   * Read a resource from the target server
   *
   * @param uri - Resource URI to read
   * @returns Resource content as string or null if not found
   */
  async readTargetResource(uri: string): Promise<string | null> {
    if (!this.state.connected || !this.state.client) {
      throw new Error("No active connection. Call connect_to_server first.");
    }

    try {
      const result = await this.state.client.readResource(uri);
      // Extract text content from resource response
      const contents = result.contents;
      if (contents && Array.isArray(contents) && contents.length > 0) {
        const firstContent = contents[0];
        if (firstContent && "text" in firstContent) {
          return firstContent.text as string;
        }
      }
      return null;
    } catch (error) {
      if (this.debug) {
        console.warn(`[inspector] Error reading resource ${uri}:`, error);
      }
      return null;
    }
  }
}
