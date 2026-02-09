/**
 * Connection management for MCP Inspector Server
 *
 * Manages the connection lifecycle to target MCP servers using @mcp-apps-kit/testing.
 */

import { EventEmitter } from "node:events";
import { z } from "zod";
import {
  createTestClient,
  type TestClient,
  type ToolCall,
  type ConnectionParams,
} from "@mcp-apps-kit/testing";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  ConnectionState,
  ConnectOptions,
  ServerInfo,
  InspectorServerOptions,
  HistoryEntry,
  EnvironmentState,
  TargetServerSchema,
  TargetToolInfo,
  AgnosticInspectorEvent,
  InspectorEventType,
} from "./types";
import { getEventCategory } from "./types";
import { WidgetSessionManager } from "./widget-session-manager";
import { WidgetServer } from "./widget-server";
import { InspectorOAuthProvider } from "./oauth/provider";
import type { OAuthState } from "./oauth/types";
import { discoverAuthRequirements, type AuthRequiredEvent } from "./oauth/discovery";

/**
 * Protocol type inferred from connected server's tools
 */
export type ProtocolType = "chatgpt-apps" | "mcp-apps" | "mcp";

/**
 * Infer the protocol type from connected server's tools
 *
 * Checks tool metadata to determine if the server uses OpenAI Apps UI,
 * MCP Apps UI, or is a plain MCP server.
 *
 * Detection logic based on tool _meta fields:
 * - OpenAI format: _meta["openai/outputTemplate"] exists
 * - MCP Apps format: _meta.ui.resourceUri or _meta["ui/resourceUri"] exists
 *
 * @param tools - Array of tool info from the target server
 * @returns Protocol type: "chatgpt-apps", "mcp-apps", or "mcp"
 */
export function inferProtocolType(tools: TargetToolInfo[]): ProtocolType {
  for (const tool of tools) {
    const meta = tool._meta;
    if (!meta) continue;

    // Check for OpenAI Apps UI metadata
    // OpenAI format uses _meta["openai/outputTemplate"]
    if (meta["openai/outputTemplate"] !== undefined) {
      return "chatgpt-apps";
    }

    // Check for MCP Apps UI metadata
    // MCP Apps format uses _meta.ui.resourceUri or _meta["ui/resourceUri"]
    const uiMeta = meta.ui as Record<string, unknown> | undefined;
    if (uiMeta?.resourceUri !== undefined || meta["ui/resourceUri"] !== undefined) {
      return "mcp-apps";
    }
  }

  // No UI metadata found - plain MCP server
  return "mcp";
}

/**
 * Events emitted by ConnectionManager
 */
export interface ConnectionManagerEvents {
  /** Emitted when target server schema is updated (on connect) */
  schemaUpdated: [schema: TargetServerSchema];
  /** Emitted when disconnected from target server */
  disconnected: [previousUrl: string | null];
  /** Emitted when a session-agnostic agent event is recorded */
  agentEvent: [event: AgnosticInspectorEvent];
  /** Emitted when a 401/auth error is detected and discovery results are available */
  authRequired: [event: AuthRequiredEvent];
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
    maxHeight: 600,
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
  private static idCounter = 0;
  private static readonly MAX_RESTART_ATTEMPTS = 3;

  readonly id: string;

  private state: ConnectionState = {
    connected: false,
    serverUrl: null,
    serverInfo: null,
    historyEnabled: true,
    callCount: 0,
    client: null,
    connectionParams: null,
  };

  private autoRestartAttempts = 0;
  private autoRestartTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionGeneration = 0;

  private environmentState: EnvironmentState;
  private readonly maxHistorySize: number;
  private readonly defaultTimeout: number;
  private readonly debug: boolean;
  private widgetSessionManager: WidgetSessionManager;
  private widgetServer: WidgetServer | null = null;

  /** Dashboard page for interactive mode (shared across all UIHostManagers) */
  private dashboardPage: import("playwright").Page | null = null;
  private interactiveMode = false;

  /** Cached target server schema for proxy tool generation */
  private targetSchema: TargetServerSchema | null = null;

  /** Auth token for proxied requests (from OAuth flow) */
  private authToken: string | null = null;

  /** OAuth client provider for authenticated connections */
  private oauthProvider: InspectorOAuthProvider | null = null;

  /** Inspector URL for injected sync scripts (set when server starts) */
  private inspectorUrl: string | null = null;

  /** Raw MCP hostContext from external widget (for session creation) */
  private externalMcpHostContext: Record<string, unknown> | null = null;

  /** Storage for session-agnostic agent events */
  private agentEvents: AgnosticInspectorEvent[] = [];

  /** Counter for generating unique agent event IDs */
  private agentEventIdCounter = 0;

  /** Cached discovery results from 401 auto-detection */
  private discoveryResults: AuthRequiredEvent | null = null;

  constructor(options: InspectorServerOptions & { id?: string } = {}) {
    super();
    this.id = options.id ?? `conn-${++ConnectionManager.idCounter}`;
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
    params: ConnectionParams,
    options: ConnectOptions = {}
  ): Promise<{
    serverInfo: ServerInfo | null;
    toolCount: number;
    resourceCount: number;
    promptCount: number;
  }> {
    const {
      trackHistory = true,
      timeout = this.defaultTimeout,
      oauthConfig,
      authProvider: prebuiltAuthProvider,
    } = options;

    // Generate display label
    const label =
      params.transport === "http"
        ? params.url
        : `stdio:${params.command}${params.args?.length ? " " + params.args.join(" ") : ""}`;

    // Validate input at API boundary
    if (params.transport === "http") {
      try {
        new URL(params.url);
      } catch {
        throw new Error(
          `Invalid URL format: '${params.url}'. Expected format: http(s)://host:port/path`
        );
      }
    } else {
      if (!params.command?.trim()) {
        throw new Error("stdio transport requires a non-empty command");
      }
    }

    // Disconnect existing connection if any
    // Preserve OAuth provider across reconnects (disconnect() clears it + revokes tokens)
    const existingProvider = this.oauthProvider;
    if (this.state.connected && this.state.client) {
      if (this.debug) {
        console.log(`[inspector] Disconnecting from previous server: ${this.state.serverUrl}`);
      }
      // Temporarily clear provider so disconnect() doesn't revoke tokens we still need
      this.oauthProvider = null;
      await this.disconnect();
    }
    // Restore provider for potential reuse in reconnect
    if (existingProvider && !this.oauthProvider) {
      this.oauthProvider = existingProvider;
    }

    if (this.debug) {
      console.log(`[inspector] Connecting to server: ${label}`);
    }

    // Wire onTransportClose for stdio auto-restart
    const onTransportClose =
      params.transport === "stdio"
        ? () => {
            if (!this.state.connected) return; // intentional disconnect
            this.handleStdioProcessExit(params, options);
          }
        : undefined;

    // Set up OAuth provider for HTTP connections.
    // Prefer pre-built provider (e.g., from CLI preset) over oauthConfig.
    let authProvider: InspectorOAuthProvider | undefined;
    if (params.transport === "http" && prebuiltAuthProvider) {
      authProvider = prebuiltAuthProvider;

      // Track OAuth status changes
      const provider = authProvider;
      provider.onStatusChange = () => {
        if (this.debug) {
          const state = provider.getOAuthState();
          console.log(`[inspector] OAuth status changed: ${state.status}`);
        }
      };

      this.oauthProvider = authProvider;
    } else if (params.transport === "http" && !oauthConfig && this.oauthProvider) {
      // Reconnect: reuse existing provider (e.g., configured via /api/oauth/configure)
      // Status handler and this.oauthProvider already set from the configure step
      authProvider = this.oauthProvider;
    } else if (params.transport === "http" && oauthConfig) {
      // Derive callback host + port from inspectorUrl (set via registry "created" event)
      const inspectorParsed = this.inspectorUrl ? new URL(this.inspectorUrl) : null;
      const port = inspectorParsed?.port ?? "6274";
      const host = inspectorParsed?.hostname ?? "127.0.0.1";

      authProvider = new InspectorOAuthProvider({
        serverUrl: params.url,
        config: oauthConfig,
        callbackPort: parseInt(port, 10),
        callbackHost: host,
        debug: this.debug,
      });

      // Track OAuth status changes
      const provider = authProvider;
      provider.onStatusChange = () => {
        if (this.debug) {
          const state = provider.getOAuthState();
          console.log(`[inspector] OAuth status changed: ${state.status}`);
        }
      };

      this.oauthProvider = authProvider;
    }

    // Create test client and list capabilities.
    // Wrapped in try/catch to detect auth-related errors (401, UnauthorizedError)
    // and auto-trigger OAuth discovery instead of surfacing raw errors.
    let client: TestClient;
    try {
      client = await createTestClient(params, {
        trackHistory,
        timeout,
        onTransportClose,
        authProvider,
      });
    } catch (error) {
      // Check if this is an auth error on an HTTP connection without OAuth configured
      if (params.transport === "http" && !authProvider && !oauthConfig && isAuthError(error)) {
        if (this.debug) {
          console.log(`[inspector] Auth error detected during connect, running discovery`);
        }

        // Run discovery and emit authRequired instead of throwing
        const discovery = await discoverAuthRequirements(params.url);
        this.discoveryResults = discovery;

        // Set state to reflect pending-auth (not connected, not failed)
        this.state = {
          connected: false,
          serverUrl: label,
          serverInfo: null,
          historyEnabled: trackHistory,
          callCount: 0,
          client: null,
          connectionParams: params,
        };

        this.emit("authRequired", discovery);

        return {
          serverInfo: null,
          toolCount: 0,
          resourceCount: 0,
          promptCount: 0,
        };
      }

      // OAuth credentials provided but auth failed — check for pending auth URL
      // (SDK built the authorization URL but we need to return it to the frontend)
      if (params.transport === "http" && authProvider && isAuthError(error)) {
        const pendingUrl = authProvider.getPendingAuthUrl?.();
        if (pendingUrl || this.oauthProvider) {
          if (this.debug) {
            console.log(
              `[inspector] Auth error with OAuth configured, pending auth URL: ${pendingUrl}`
            );
          }

          this.state = {
            connected: false,
            serverUrl: label,
            serverInfo: null,
            historyEnabled: trackHistory,
            callCount: 0,
            client: null,
            connectionParams: params,
          };

          return {
            serverInfo: null,
            toolCount: 0,
            resourceCount: 0,
            promptCount: 0,
          };
        }
      }

      // Non-auth error — rethrow
      throw error;
    }

    // Get server capabilities by listing tools, resources, prompts
    // Use try-catch for each to handle servers that don't support all capabilities
    let tools: Awaited<ReturnType<typeof client.listTools>> = [];
    let resources: Awaited<ReturnType<typeof client.listResources>> = [];
    let prompts: Awaited<ReturnType<typeof client.listPrompts>> = [];

    try {
      tools = await client.listTools();
    } catch (error) {
      if (params.transport === "http" && !authProvider && !oauthConfig && isAuthError(error)) {
        // Auth error during capability listing (server accepted transport but rejected request)
        if (this.debug) {
          console.log(`[inspector] Auth error during capability listing, running discovery`);
        }

        const discovery = await discoverAuthRequirements(params.url);
        this.discoveryResults = discovery;

        this.state = {
          connected: false,
          serverUrl: label,
          serverInfo: null,
          historyEnabled: trackHistory,
          callCount: 0,
          client: null,
          connectionParams: params,
        };

        // Clean up the client we created
        try {
          await client.disconnect();
        } catch {
          // Best-effort cleanup
        }

        this.emit("authRequired", discovery);

        return {
          serverInfo: null,
          toolCount: 0,
          resourceCount: 0,
          promptCount: 0,
        };
      }

      // Server doesn't support tools capability (non-auth error)
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

    // Clear discovery results on successful connection (with or without OAuth)
    this.discoveryResults = null;

    // Update state
    this.state = {
      connected: true,
      serverUrl: label,
      serverInfo,
      historyEnabled: trackHistory,
      callCount: 0,
      client,
      connectionParams: params,
    };

    // Reset auto-restart attempts on successful connect
    this.autoRestartAttempts = 0;

    if (this.debug) {
      console.log(`[inspector] Connected to ${label}`);
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
   * Disconnect from the current target server.
   * Revokes OAuth tokens and deletes persisted credentials.
   */
  async disconnect(): Promise<string | null> {
    const previousUrl = this.state.serverUrl;

    // Bump generation so any in-flight restart aborts
    this.connectionGeneration++;

    // Mark as disconnected BEFORE clearing timer so onclose handler sees it
    this.state.connected = false;

    // Clear auto-restart timer
    if (this.autoRestartTimer) {
      clearTimeout(this.autoRestartTimer);
      this.autoRestartTimer = null;
    }

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
      connectionParams: null,
    };

    // Clear cached schema
    this.targetSchema = null;

    // Clear auth token
    this.authToken = null;

    // Revoke tokens, delete persisted credentials, and clean up provider on disconnect
    if (this.oauthProvider) {
      // Server-side token revocation (fire-and-forget)
      this.oauthProvider.revokeTokens().catch((err: unknown) => {
        if (this.debug) {
          console.warn(`[inspector] Token revocation during disconnect failed:`, err);
        }
      });
      // Delete persisted token file so next connect requires fresh login
      if (previousUrl) {
        import("./oauth/token-store")
          .then(({ TokenStore }) => {
            const store = new TokenStore();
            store.delete(previousUrl).catch(() => {});
          })
          .catch(() => {});
      }
    }

    // Clear OAuth provider
    this.oauthProvider = null;

    if (this.debug) {
      console.log(`[inspector] Disconnected from ${previousUrl}`);
    }

    // Emit disconnected event for proxy cleanup
    this.emit("disconnected", previousUrl);

    return previousUrl;
  }

  /**
   * Handle unexpected stdio process exit with exponential backoff restart
   */
  private handleStdioProcessExit(params: ConnectionParams, options: ConnectOptions): void {
    if (this.autoRestartAttempts >= ConnectionManager.MAX_RESTART_ATTEMPTS) {
      if (this.debug) {
        console.log(
          `[inspector] Max auto-restart attempts (${ConnectionManager.MAX_RESTART_ATTEMPTS}) reached, disconnecting`
        );
      }
      void this.disconnect();
      return;
    }

    const delay = 1000 * Math.pow(2, this.autoRestartAttempts); // 1s, 2s, 4s
    this.autoRestartAttempts++;

    if (this.debug) {
      console.log(
        `[inspector] stdio process exited, restarting in ${delay}ms (attempt ${this.autoRestartAttempts}/${ConnectionManager.MAX_RESTART_ATTEMPTS})`
      );
    }

    const generationAtStart = this.connectionGeneration;

    this.autoRestartTimer = setTimeout(() => {
      this.autoRestartTimer = null;

      // Abort if disconnect() was called while we were waiting
      if (this.connectionGeneration !== generationAtStart) {
        if (this.debug) {
          console.log(`[inspector] Auto-restart aborted: disconnect called during backoff`);
        }
        return;
      }

      this.connect(params, options)
        .then(() => {
          // Abort if disconnect() was called while connect() was in-flight
          if (this.connectionGeneration !== generationAtStart) {
            if (this.debug) {
              console.log(`[inspector] Auto-restart aborted: disconnect called during reconnect`);
            }
            void this.disconnect();
            return;
          }
          // Reset attempt counter on successful reconnect
          this.autoRestartAttempts = 0;
        })
        .catch(() => {
          if (this.debug) {
            console.log(`[inspector] Auto-restart failed, disconnecting`);
          }
          void this.disconnect().catch(() => {
            /* cleanup best-effort */
          });
        });
    }, delay);
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
   * Set the dashboard notifier on the widget session manager for SSE lifecycle events.
   */
  setDashboardNotifier(notifier: import("./dashboard/dashboard-notifier").DashboardNotifier): void {
    this.widgetSessionManager.setNotifier(notifier);
  }

  /**
   * Set the shared dashboard page for interactive mode.
   * UIHostManagers created for tool calls will use this page for iframe rendering.
   */
  setDashboardPage(page: import("playwright").Page): void {
    this.dashboardPage = page;
    this.interactiveMode = true;
  }

  /** Get the shared dashboard page (null in headless mode) */
  getDashboardPage(): import("playwright").Page | null {
    return this.dashboardPage;
  }

  /** Whether interactive mode is active */
  isInteractive(): boolean {
    return this.interactiveMode;
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
   * Get the widget server port, or undefined if not running.
   */
  getWidgetServerPort(): number | undefined {
    return this.widgetServer?.getPort();
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

  /**
   * Get the OAuth provider for this connection (if configured).
   */
  getOAuthProvider(): InspectorOAuthProvider | null {
    return this.oauthProvider;
  }

  /**
   * Get the current OAuth state for this connection.
   *
   * @returns OAuth state or undefined if no OAuth is configured
   */
  getOAuthState(): OAuthState | undefined {
    return this.oauthProvider?.getOAuthState();
  }

  /**
   * Set the OAuth provider externally (e.g., for CLI preset mode).
   */
  setOAuthProvider(provider: InspectorOAuthProvider): void {
    this.oauthProvider = provider;
    if (this.debug) {
      console.log(`[inspector] OAuth provider set externally`);
    }
  }

  /**
   * Get cached discovery results from 401 auto-detection.
   *
   * Non-null when connect() detected an auth error and ran discovery
   * instead of throwing. The connection is in "pending auth" state.
   * Cleared on successful reconnect.
   *
   * @returns Discovery results or null if no auth detection occurred
   */
  getDiscoveryResults(): AuthRequiredEvent | null {
    return this.discoveryResults;
  }

  /**
   * Record a session-agnostic agent event
   *
   * Used for tracking agent tool calls on the connected MCP server
   * that are not tied to a specific widget session.
   *
   * @param type - Event type (agent-tool-call or agent-tool-result)
   * @param payload - Event payload (tool name, args, result, etc.)
   * @param protocol - Protocol used (mcp or openai)
   * @param source - Event source: "agent" (default) for proxy/agent calls, "manual" for user-initiated executions
   */
  recordAgentEvent(
    type: InspectorEventType,
    payload: unknown,
    protocol?: "mcp" | "openai",
    source?: AgnosticInspectorEvent["source"]
  ): AgnosticInspectorEvent {
    const event: AgnosticInspectorEvent = {
      id: `agent-${++this.agentEventIdCounter}`,
      category: getEventCategory(type),
      type,
      timestamp: Date.now(),
      payload,
      source: source ?? "agent",
      protocol,
    };

    this.agentEvents.push(event);

    // Limit stored events to prevent memory issues
    if (this.agentEvents.length > this.maxHistorySize) {
      this.agentEvents = this.agentEvents.slice(-this.maxHistorySize);
    }

    // Emit event for real-time SSE streaming
    this.emit("agentEvent", event);

    if (this.debug) {
      console.log(`[inspector] Agent event recorded: ${type}`, event.id);
    }

    return event;
  }

  /**
   * Get all recorded agent events
   *
   * @returns Array of session-agnostic agent events
   */
  getAgentEvents(): AgnosticInspectorEvent[] {
    return [...this.agentEvents];
  }

  /**
   * Clear all recorded agent events
   *
   * @returns Number of events cleared
   */
  clearAgentEvents(): number {
    const count = this.agentEvents.length;
    this.agentEvents = [];

    if (this.debug) {
      console.log(`[inspector] Cleared ${count} agent events`);
    }

    return count;
  }

  /**
   * Zod schema for validating MCP initialize requests.
   * Used by maybeRecordInitialize to safely extract clientInfo.
   */
  private static readonly InitializeRequestSchema = z.object({
    method: z.literal("initialize"),
    params: z
      .object({
        clientInfo: z
          .object({
            name: z.string().optional(),
            version: z.string().optional(),
          })
          .optional(),
      })
      .optional(),
  });

  /**
   * Check if a JSON-RPC body is an MCP `initialize` request and record an agent-initialize event
   *
   * This intercepts the MCP initialize handshake to detect when an agent connects.
   * The clientInfo.name field identifies the connecting agent (e.g., "claude-code", "cursor").
   *
   * @param jsonRpcBody - Parsed JSON-RPC request body (or unknown value to check)
   * @returns true if an initialize event was recorded, false otherwise
   */
  maybeRecordInitialize(jsonRpcBody: unknown): boolean {
    // Use Zod to safely validate and extract the initialize request structure
    const parseResult = ConnectionManager.InitializeRequestSchema.safeParse(jsonRpcBody);

    if (!parseResult.success) {
      // Not a valid initialize request structure
      return false;
    }

    const { params } = parseResult.data;
    const clientInfo = params?.clientInfo;

    // Build payload from validated data
    const payload: Record<string, unknown> = {};
    if (clientInfo?.name) {
      payload.clientName = clientInfo.name;
    }
    if (clientInfo?.version) {
      payload.clientVersion = clientInfo.version;
    }

    this.recordAgentEvent("agent-initialize", payload);

    if (this.debug) {
      console.log(
        `[inspector] Agent initialize detected: ${clientInfo?.name ?? "unknown"}${clientInfo?.version ? ` v${clientInfo.version}` : ""}`
      );
    }

    return true;
  }
}

// =============================================================================
// AUTH ERROR DETECTION
// =============================================================================

/**
 * Auth-related error patterns in error messages.
 * Matched case-insensitively against error.message.
 */
const AUTH_ERROR_PATTERNS = [/\bunauthorized\b/i, /\b401\b/, /\binvalid_token\b/i];

/**
 * Detect whether an error is authentication-related.
 *
 * Checks for:
 * - UnauthorizedError from the MCP SDK
 * - Error messages containing "unauthorized", "401", or "invalid_token"
 * - Wrapper errors (e.g., ConnectionError) whose cause is an auth error
 *
 * @param error - The caught error to inspect
 * @returns true if the error indicates an authentication problem
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof UnauthorizedError) {
    return true;
  }

  if (error instanceof Error) {
    const msg = error.message;
    for (const pattern of AUTH_ERROR_PATTERNS) {
      if (pattern.test(msg)) {
        return true;
      }
    }

    // Check wrapped cause (e.g., ConnectionError wrapping an auth error)
    if ("cause" in error && error.cause) {
      return isAuthError(error.cause);
    }
  }

  return false;
}
