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
import type { EnvironmentState } from "./types";
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
        // MCP protocol: send hostContext/changed notification via postMessage
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
            const message = {
              jsonrpc: "2.0",
              method: "hostContext/changed",
              params: {
                hostContext: ctx,
              },
            };
            iframe.contentWindow.postMessage(message, "*");
            // eslint-disable-next-line no-console
            console.log("[MCP Host] Sent hostContext/changed", ctx);
          }
        }, hostContext);
      } else {
        // OpenAI protocol: dispatch openai:set_globals CustomEvent that the SDK listens for
        const frames = page.frames();
        // Find the frame that's not the main frame (should be the widget iframe)
        const widgetFrame = frames.find((f) => f !== page.mainFrame());

        if (!widgetFrame) {
          if (this.debug) {
            console.warn(
              `[WidgetSessionManager] Could not find widget frame for session ${sessionId}`
            );
          }
          return false;
        }

        // Build globals object from environment state
        const globals = {
          theme: environmentState.theme,
          displayMode: environmentState.displayMode,
          locale: environmentState.locale,
          maxHeight: environmentState.maxHeight,
          safeArea: environmentState.safeAreaInsets,
          userAgent: environmentState.userAgent,
          userLocation: environmentState.userLocation,
        };

        // Update window.openai properties and dispatch the CustomEvent
        /* eslint-disable no-undef */
        await widgetFrame.evaluate((globalsData) => {
          // Update window.openai properties if available
          const openai = (window as { openai?: Record<string, unknown> }).openai;
          if (openai) {
            if (globalsData.theme !== undefined) openai.theme = globalsData.theme;
            if (globalsData.displayMode !== undefined) openai.displayMode = globalsData.displayMode;
            if (globalsData.locale !== undefined) openai.locale = globalsData.locale;
            if (globalsData.maxHeight !== undefined) openai.maxHeight = globalsData.maxHeight;
            if (globalsData.safeArea !== undefined) openai.safeArea = globalsData.safeArea;
            if (globalsData.userAgent !== undefined) openai.userAgent = globalsData.userAgent;
            if (globalsData.userLocation !== undefined)
              openai.userLocation = globalsData.userLocation;
          }

          // Dispatch the CustomEvent that the OpenAI adapter listens for
          window.dispatchEvent(
            new CustomEvent("openai:set_globals", {
              detail: { globals: globalsData },
            })
          );
          // eslint-disable-next-line no-console
          console.log("[OpenAI Host] Dispatched openai:set_globals", globalsData);
        }, globals);
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
