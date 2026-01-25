/**
 * Widget Session Manager
 *
 * Manages active widget rendering sessions with Playwright pages.
 * Sessions persist across multiple inspector operations (screenshot, console logs, interactions).
 */

import type { Page } from "playwright";
import { randomUUID } from "node:crypto";
import type { ConsoleLogEntry } from "./tools/get-console-logs";
import type { DetectedProtocol } from "./ui-host";
import type { EnvironmentState, SyncEventPayload, SyncEventType } from "./types";
import { mapConsoleTypeToLogLevel, getLogSourceFromUrl } from "./tools/helpers";

/**
 * Source endpoint that created the session
 */
export type SessionSource = "apps" | "agent";

/**
 * Proxy metadata for sessions created via /apps/mcp proxy
 */
export interface ProxyMetadata {
  /** URL of the target server being proxied */
  targetServerUrl: string;
  /** Original tool name on target server */
  targetToolName: string;
}

/**
 * Active widget session with persistent Playwright page
 */
export interface ActiveWidgetSession {
  /** Unique session ID */
  id: string;
  /** Tool name that was called */
  toolName: string;
  /** Arguments passed to the tool */
  toolArgs: Record<string, unknown>;
  /** Result returned by the tool */
  toolResult: unknown;
  /** Playwright page instance */
  page: Page;
  /** WidgetServer session ID */
  widgetSessionId: string;
  /** Accumulated console logs */
  consoleLogs: ConsoleLogEntry[];
  /** Accumulated page errors */
  pageErrors: string[];
  /** When the session was created */
  createdAt: number;
  /** Protocol used (mcp or openai) */
  protocol: DetectedProtocol;
  /** Which endpoint created this session (apps = ChatGPT proxy, agent = inspector tools) */
  source: SessionSource;
  /** Metadata for proxy sessions (when source is 'apps') */
  proxyMetadata?: ProxyMetadata;
}

/**
 * Session info for listing
 */
export interface SessionInfo {
  id: string;
  toolName: string;
  protocol: DetectedProtocol;
  createdAt: number;
  logCount: number;
  errorCount: number;
  /** Which endpoint created this session */
  source: SessionSource;
}

/**
 * Options for session manager
 */
export interface WidgetSessionManagerOptions {
  /** Session TTL in milliseconds (default: 5 minutes) */
  ttl?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Manages active widget rendering sessions
 */
export class WidgetSessionManager {
  private sessions: Map<string, ActiveWidgetSession> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private readonly ttl: number;
  private readonly debug: boolean;

  constructor(options: WidgetSessionManagerOptions = {}) {
    this.ttl = options.ttl ?? 5 * 60 * 1000; // 5 minutes default
    this.debug = options.debug ?? false;

    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Create a new widget session
   *
   * @param toolName - Name of the tool that was called
   * @param toolArgs - Arguments passed to the tool
   * @param toolResult - Result returned by the tool
   * @param page - Playwright page instance
   * @param widgetSessionId - WidgetServer session ID
   * @param protocol - Protocol used (mcp or openai)
   * @param source - Which endpoint created this session (default: 'agent')
   * @param proxyMetadata - Optional metadata for proxy sessions
   */
  async createSession(
    toolName: string,
    toolArgs: Record<string, unknown>,
    toolResult: unknown,
    page: Page,
    widgetSessionId: string,
    protocol: DetectedProtocol,
    source: SessionSource = "agent",
    proxyMetadata?: ProxyMetadata
  ): Promise<ActiveWidgetSession> {
    const id = randomUUID();
    const session: ActiveWidgetSession = {
      id,
      toolName,
      toolArgs,
      toolResult,
      page,
      widgetSessionId,
      consoleLogs: [],
      pageErrors: [],
      createdAt: Date.now(),
      protocol,
      source,
      proxyMetadata,
    };

    // Set up console log listener
    page.on("console", (msg) => {
      const location = msg.location();
      session.consoleLogs.push({
        level: mapConsoleTypeToLogLevel(msg.type()),
        text: msg.text(),
        source: getLogSourceFromUrl(location.url),
        timestamp: Date.now(),
        url: location.url || undefined,
        lineNumber: location.lineNumber || undefined,
      });
    });

    // Set up page error listener
    page.on("pageerror", (err) => {
      session.pageErrors.push(err.message);
    });

    this.sessions.set(id, session);

    if (this.debug) {
      console.log(`[WidgetSessionManager] Created session ${id} for tool ${toolName}`);
    }

    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): ActiveWidgetSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * List all active sessions
   */
  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((session) => ({
      id: session.id,
      toolName: session.toolName,
      protocol: session.protocol,
      createdAt: session.createdAt,
      logCount: session.consoleLogs.length,
      errorCount: session.pageErrors.length,
      source: session.source,
    }));
  }

  /**
   * Update globals on a specific session (push hostContext/changed to widget)
   */
  async updateSessionGlobals(
    sessionId: string,
    environmentState: EnvironmentState
  ): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    try {
      const page = session.page;
      if (page.isClosed()) {
        return false;
      }

      // Build the host context update based on protocol
      if (session.protocol === "mcp") {
        // MCP protocol: send ui/notifications/host-context-changed notification via postMessage
        // This matches the actual MCP Apps protocol method name
        const hostContext = {
          theme: environmentState.theme,
          displayMode: environmentState.displayMode,
          locale: environmentState.locale,
          timeZone: environmentState.timeZone,
          viewport: environmentState.viewport,
          platform:
            environmentState.userAgent?.device?.type === "mobile"
              ? "mobile"
              : environmentState.userAgent?.device?.type === "tablet"
                ? "web"
                : "desktop",
        };

        await page.evaluate((ctx) => {
          // eslint-disable-next-line no-undef
          const iframe = document.getElementById("widget-frame") as HTMLIFrameElement | null;
          if (iframe?.contentWindow) {
            // Use the correct MCP Apps protocol method name
            // Params are flat (not wrapped in hostContext)
            const message = {
              jsonrpc: "2.0",
              method: "ui/notifications/host-context-changed",
              params: ctx,
            };
            iframe.contentWindow.postMessage(message, "*");
            // eslint-disable-next-line no-console
            console.log("[MCP Host] Sent ui/notifications/host-context-changed", ctx);
          }
        }, hostContext);
      } else {
        // OpenAI protocol: send via inspector_sync message from host to iframe
        // This ensures event.source === window.parent (required by SDK security)
        const globals = {
          theme: environmentState.theme,
          displayMode: environmentState.displayMode,
          locale: environmentState.locale,
          maxHeight: environmentState.maxHeight,
          safeArea: environmentState.safeAreaInsets,
          userAgent: environmentState.userAgent,
          userLocation: environmentState.userLocation,
        };

        const syncMessage = {
          type: "openai:inspector_sync",
          syncType: "globals",
          data: globals,
        };

        /* eslint-disable no-undef */
        await page.evaluate((message) => {
          const iframe = document.getElementById("widget-frame") as HTMLIFrameElement | null;
          if (iframe?.contentWindow) {
            iframe.contentWindow.postMessage(message, "*");
            // eslint-disable-next-line no-console
            console.log("[OpenAI Host] Sent globals sync:", message.data);
          }
        }, syncMessage);
        /* eslint-enable no-undef */
      }

      if (this.debug) {
        console.log(`[WidgetSessionManager] Updated globals for session ${sessionId}`);
      }

      return true;
    } catch (error) {
      if (this.debug) {
        console.warn(
          `[WidgetSessionManager] Error updating globals for session ${sessionId}:`,
          error
        );
      }
      return false;
    }
  }

  /**
   * Update globals on all active sessions
   */
  async updateAllSessionGlobals(environmentState: EnvironmentState): Promise<number> {
    let updated = 0;
    for (const sessionId of this.sessions.keys()) {
      const success = await this.updateSessionGlobals(sessionId, environmentState);
      if (success) {
        updated++;
      }
    }
    return updated;
  }

  /**
   * Sync any event to Playwright widget sessions
   *
   * This is the unified entry point for all event synchronization in dual mode.
   * Events from external widgets (ChatGPT/MCP Apps) are mirrored to Playwright widgets
   * to achieve 1:1 state synchronization.
   *
   * @param payload - The sync event payload containing type, data, and routing info
   */
  async syncEvent(payload: SyncEventPayload): Promise<void> {
    const { type, data, sessionId, protocol } = payload;

    // If sessionId specified, sync to that session only
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session && !session.page.isClosed()) {
        await this.deliverEvent(session, type, data, protocol);
      }
      return;
    }

    // Broadcast to all sessions matching protocol
    const promises: Promise<void>[] = [];
    for (const [, session] of this.sessions) {
      if (session.protocol === protocol && !session.page.isClosed()) {
        promises.push(this.deliverEvent(session, type, data, protocol));
      }
    }
    await Promise.all(promises);
  }

  /**
   * Deliver an event to a specific session based on protocol
   *
   * IMPORTANT: Messages must be sent FROM the host page TO the widget iframe
   * so that event.source === window.parent in the widget. The widget SDK
   * validates that messages come from the parent frame for security.
   */
  private async deliverEvent(
    session: ActiveWidgetSession,
    type: SyncEventType,
    data: unknown,
    protocol: "openai" | "mcp"
  ): Promise<void> {
    try {
      if (protocol === "mcp") {
        await this.deliverMcpEvent(session, type, data);
      } else {
        await this.deliverOpenAIEvent(session, type, data);
      }

      if (this.debug) {
        console.log(
          `[WidgetSessionManager] Delivered ${type} event to session ${session.id} (${protocol})`
        );
      }
    } catch (error) {
      if (this.debug) {
        console.warn(
          `[WidgetSessionManager] Error delivering ${type} event to session ${session.id}:`,
          error
        );
      }
    }
  }

  /**
   * Deliver an event using MCP protocol (JSON-RPC postMessage from host to iframe)
   *
   * Messages are sent FROM the host page TO the widget iframe so that
   * event.source === window.parent in the widget (required by SDK security).
   */
  private async deliverMcpEvent(
    session: ActiveWidgetSession,
    type: SyncEventType,
    data: unknown
  ): Promise<void> {
    // Map sync event types to MCP method names
    const methodMap: Record<SyncEventType, string | null> = {
      globals: "ui/notifications/host-context-changed",
      "host-context-changed": "ui/notifications/host-context-changed",
      "tool-result": "ui/notifications/tool-result",
      "tool-output": "ui/notifications/tool-result",
      "tool-input": "ui/notifications/tool-input",
      "tool-input-partial": "ui/notifications/tool-input-partial",
      "tool-cancelled": "ui/notifications/tool-cancelled",
      "call-tool": "tools/call",
      "call-tool-response": null, // Response, not notification
      "tool-response-metadata": null, // Handled via tool-result
      initialize: null,
      teardown: null,
    };

    const method = methodMap[type];
    if (!method) return;

    // For host-context-changed, pass through the full hostContext data
    // The external widget may send rich data (styles, containerDimensions, etc.)
    // that we want to preserve for 1:1 state sync
    let params: unknown = data;
    if (type === "globals" || type === "host-context-changed") {
      const d = (data ?? {}) as Record<string, unknown>;

      // Start with all the original fields from the external hostContext
      params = { ...d };

      // Add platform mapping if not present (derived from userAgent)
      if (!d.platform && d.userAgent) {
        const userAgent = d.userAgent as Record<string, unknown>;
        const deviceType = (userAgent.device as Record<string, unknown>)?.type;
        (params as Record<string, unknown>).platform =
          deviceType === "mobile" ? "mobile" : deviceType === "tablet" ? "web" : "desktop";
      }
    }

    // For host-context-changed, also store on host page for ui/initialize response
    // This handles the case where sync arrives before widget initialization
    const isHostContextUpdate = method === "ui/notifications/host-context-changed";

    // Execute on the HOST page, sending message TO the iframe
    // This ensures event.source === window.parent in the widget
    /* eslint-disable no-undef */
    await session.page.evaluate(
      ({ method: m, params: p, storeOnHost }) => {
        // Store host context updates for ui/initialize response
        if (storeOnHost) {
          const w = window as Window & { __mcpHostContextUpdates?: Record<string, unknown> };
          w.__mcpHostContextUpdates = { ...(w.__mcpHostContextUpdates || {}), ...(p as object) };
          // eslint-disable-next-line no-console
          console.log("[MCP Host] Stored hostContext update for ui/initialize:", p);
        }

        const iframe = document.getElementById("widget-frame") as HTMLIFrameElement | null;
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage(
            {
              jsonrpc: "2.0",
              method: m,
              params: p,
            },
            "*"
          );
          // eslint-disable-next-line no-console
          console.log("[MCP Host] Sent synced event:", m, p);
        }
      },
      { method, params, storeOnHost: isHostContextUpdate }
    );
    /* eslint-enable no-undef */
  }

  /**
   * Deliver an event using OpenAI protocol (postMessage from host to iframe)
   *
   * Messages are sent FROM the host page TO the widget iframe so that
   * event.source === window.parent in the widget (required by SDK security).
   *
   * We use a custom message type `openai:inspector_sync` which the injected
   * runtime in widget-server.ts listens for and processes.
   */
  private async deliverOpenAIEvent(
    session: ActiveWidgetSession,
    type: SyncEventType,
    data: unknown
  ): Promise<void> {
    // Build the sync message payload
    const syncMessage = {
      type: "openai:inspector_sync",
      syncType: type,
      data: data,
    };

    // Execute on the HOST page, sending message TO the iframe
    // This ensures event.source === window.parent in the widget
    /* eslint-disable no-undef */
    await session.page.evaluate((message) => {
      const iframe = document.getElementById("widget-frame") as HTMLIFrameElement | null;
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(message, "*");
        // eslint-disable-next-line no-console
        console.log("[OpenAI Host] Sent synced event:", message.syncType, message.data);
      }
    }, syncMessage);
    /* eslint-enable no-undef */
  }

  /**
   * Close a specific session
   */
  async closeSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    try {
      // Close the Playwright page
      if (!session.page.isClosed()) {
        await session.page.close();
      }
    } catch (error) {
      if (this.debug) {
        console.warn(`[WidgetSessionManager] Error closing page for session ${sessionId}:`, error);
      }
    }

    this.sessions.delete(sessionId);

    if (this.debug) {
      console.log(`[WidgetSessionManager] Closed session ${sessionId}`);
    }

    return true;
  }

  /**
   * Close all active sessions
   */
  async closeAllSessions(): Promise<number> {
    const count = this.sessions.size;
    const sessionIds = Array.from(this.sessions.keys());

    for (const sessionId of sessionIds) {
      await this.closeSession(sessionId);
    }

    if (this.debug) {
      console.log(`[WidgetSessionManager] Closed ${count} session(s)`);
    }

    return count;
  }

  /**
   * Clean up stale sessions (TTL expired)
   */
  private async cleanupStaleSessions(): Promise<void> {
    const now = Date.now();
    const staleSessionIds: string[] = [];

    for (const [id, session] of this.sessions.entries()) {
      if (now - session.createdAt > this.ttl) {
        staleSessionIds.push(id);
      }
    }

    for (const id of staleSessionIds) {
      if (this.debug) {
        console.log(`[WidgetSessionManager] Cleaning up stale session ${id}`);
      }
      await this.closeSession(id);
    }
  }

  /**
   * Start the cleanup interval
   */
  private startCleanupInterval(): void {
    // Run cleanup every minute
    this.cleanupInterval = setInterval(() => {
      void this.cleanupStaleSessions();
    }, 60 * 1000);
  }

  /**
   * Stop the cleanup interval and close all sessions
   */
  async dispose(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    await this.closeAllSessions();

    if (this.debug) {
      console.log(`[WidgetSessionManager] Disposed`);
    }
  }
}
