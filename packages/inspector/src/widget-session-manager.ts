/**
 * Widget Session Manager
 *
 * Manages active widget rendering sessions with Playwright pages.
 * Sessions persist across multiple inspector operations (screenshot, console logs, interactions).
 *
 * ## Architecture Note
 *
 * This class manages **Playwright page instances** for interactive widget testing.
 * Sessions track console logs, page errors, dialogs, and tool calls made by widgets.
 *
 * **Distinct from WidgetServer** which manages **HTTP session storage** for serving
 * widget HTML content. The two classes have different TTL behaviors:
 *
 * - **WidgetSessionManager**: TTL based on `lastAccessedAt` (sliding expiration)
 *   - Each operation (screenshot, get logs, interactions) resets the TTL
 *   - Keeps sessions alive as long as they're being actively used
 *
 * - **WidgetServer**: TTL based on `createdAt` (static expiration)
 *   - Sessions expire at a fixed time after creation
 *   - Optimized for garbage-collecting served HTML content
 *
 * This separation allows interactive sessions to remain available while the
 * underlying HTTP content can be efficiently cleaned up.
 */

import { EventEmitter } from "node:events";
import type { Frame, Page } from "playwright";
import type { ConsoleLogEntry } from "./tools/get-console-logs";
import type { DetectedProtocol } from "./ui-host";
import type {
  DomClickPayload,
  DomDragPayload,
  DomFocusPayload,
  DomInputPayload,
  DomKeyPayload,
  DomScrollPayload,
  DomSelectPayload,
  EnvironmentState,
  InspectorEvent,
  InspectorEventType,
  SyncEventPayload,
  SyncEventType,
  TrackedDialog,
  WidgetToolCall,
} from "./types";
import { isDomSyncEventType, getEventCategory } from "./types";
import {
  getDisplayModeSizing,
  getPlatformFromDeviceType,
  type DisplayMode,
} from "./types/environment-types";
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
  /** Unique session ID (same as WidgetServer session ID for unified lookup) */
  id: string;
  /** Tool name that was called */
  toolName: string;
  /** Arguments passed to the tool */
  toolArgs: Record<string, unknown>;
  /** Result returned by the tool */
  toolResult: unknown;
  /** Playwright page instance */
  page: Page;
  /** Accumulated console logs */
  consoleLogs: ConsoleLogEntry[];
  /** Accumulated page errors */
  pageErrors: string[];
  /** Tracked dialogs (alert, confirm, prompt) that were auto-handled */
  dialogs: TrackedDialog[];
  /** Tool calls made by the widget (with results from /execute-tool) */
  toolCalls: WidgetToolCall[];
  /** When the session was created */
  createdAt: number;
  /** When the session was last accessed (for TTL reset) */
  lastAccessedAt: number;
  /** Protocol used (mcp or openai) */
  protocol: DetectedProtocol;
  /** Which endpoint created this session (apps = ChatGPT proxy, agent = inspector tools) */
  source: SessionSource;
  /** Metadata for proxy sessions (when source is 'apps') */
  proxyMetadata?: ProxyMetadata;
  /** Last captured accessibility tree snapshot (for widget_snapshot_diff auto-comparison) */
  lastSnapshot?: unknown;
  /** Timestamp when lastSnapshot was captured */
  lastSnapshotTimestamp?: number;
  /** Optional callback to keep external session (WidgetServer) alive when this session is touched */
  onTouch?: () => void;
  /** Accumulated inspector events (for dashboard events panel) */
  events: InspectorEvent[];
}

/**
 * Session info for listing
 */
export interface SessionInfo {
  id: string;
  toolName: string;
  protocol: DetectedProtocol;
  createdAt: number;
  /** When the session was last accessed (for TTL tracking) */
  lastAccessedAt: number;
  logCount: number;
  errorCount: number;
  /** Count of auto-handled dialogs */
  dialogCount: number;
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
 *
 * Extends EventEmitter to allow real-time event streaming to the dashboard.
 * Emits:
 * - 'event' (InspectorEvent) - when a new event is recorded
 */
export class WidgetSessionManager extends EventEmitter {
  private sessions: Map<string, ActiveWidgetSession> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private readonly ttl: number;
  private readonly debug: boolean;
  private eventIdCounter: number = 0;

  constructor(options: WidgetSessionManagerOptions = {}) {
    super();
    this.ttl = options.ttl ?? 5 * 60 * 1000; // 5 minutes default
    this.debug = options.debug ?? false;

    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Generate a unique event ID
   */
  private generateEventId(): string {
    return `evt-${Date.now()}-${++this.eventIdCounter}`;
  }

  /**
   * Record an event for a session
   *
   * @param sessionId - Session ID
   * @param type - Event type
   * @param payload - Event payload
   * @param source - Event source
   * @param protocol - Protocol used
   */
  recordEvent(
    sessionId: string,
    type: InspectorEventType,
    payload: unknown,
    source: "widget" | "host" | "server" = "server",
    protocol?: "mcp" | "openai"
  ): InspectorEvent | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const event: InspectorEvent = {
      id: this.generateEventId(),
      category: getEventCategory(type),
      type,
      timestamp: Date.now(),
      sessionId,
      payload,
      source,
      protocol: protocol ?? session.protocol,
    };

    session.events.push(event);
    this.emit("event", event);

    if (this.debug) {
      console.log(`[WidgetSessionManager] Recorded event ${type} for session ${sessionId}`);
    }

    return event;
  }

  /**
   * Get all events for a session
   */
  getEvents(sessionId: string): InspectorEvent[] {
    const session = this.sessions.get(sessionId);
    return session?.events ?? [];
  }

  /**
   * Create a new widget session
   *
   * @param toolName - Name of the tool that was called
   * @param toolArgs - Arguments passed to the tool
   * @param toolResult - Result returned by the tool
   * @param page - Playwright page instance
   * @param sessionId - Session ID (from WidgetServer, used for unified lookup)
   * @param protocol - Protocol used (mcp or openai)
   * @param source - Which endpoint created this session (default: 'agent')
   * @param proxyMetadata - Optional metadata for proxy sessions
   * @param onTouch - Optional callback to keep external session alive when this session is touched
   */
  async createSession(
    toolName: string,
    toolArgs: Record<string, unknown>,
    toolResult: unknown,
    page: Page,
    sessionId: string,
    protocol: DetectedProtocol,
    source: SessionSource = "agent",
    proxyMetadata?: ProxyMetadata,
    onTouch?: () => void
  ): Promise<ActiveWidgetSession> {
    // Use the WidgetServer's session ID directly for unified lookup
    // This ensures the host page and session manager use the same ID
    const now = Date.now();
    const session: ActiveWidgetSession = {
      id: sessionId,
      toolName,
      toolArgs,
      toolResult,
      page,
      consoleLogs: [],
      pageErrors: [],
      dialogs: [],
      toolCalls: [],
      events: [],
      createdAt: now,
      lastAccessedAt: now,
      protocol,
      source,
      proxyMetadata,
      onTouch,
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
      // Record as inspector event
      this.recordEvent(sessionId, "page-error", { message: err.message }, "widget", protocol);
    });

    // Set up dialog handler to auto-accept dialogs (confirm, alert, prompt)
    // This prevents blocking and allows widget interactions to proceed
    page.on("dialog", async (dialog) => {
      const dialogType = dialog.type() as "alert" | "confirm" | "prompt" | "beforeunload";
      const trackedDialog: TrackedDialog = {
        type: dialogType,
        message: dialog.message(),
        defaultValue: dialog.defaultValue() || undefined,
        handled: "accepted",
        timestamp: Date.now(),
      };

      session.dialogs.push(trackedDialog);

      // Record as inspector event
      this.recordEvent(sessionId, "dialog", trackedDialog, "widget", protocol);

      if (this.debug) {
        console.log(
          `[WidgetSessionManager] Auto-accepted ${dialogType} dialog: "${dialog.message()}"`
        );
      }

      // Accept the dialog (for confirm: returns true, for prompt: returns default value)
      await dialog.accept(dialog.defaultValue());
    });

    this.sessions.set(sessionId, session);

    // Record session-created event
    this.recordEvent(
      sessionId,
      "session-created",
      { toolName, toolArgs, protocol, source },
      "server",
      protocol
    );

    // Record initialize event (widget lifecycle)
    this.recordEvent(sessionId, "initialize", { toolName }, "widget", protocol);

    // Record initial tool-result event (the result passed when creating the session)
    this.recordEvent(sessionId, "tool-result", { toolName, result: toolResult }, "host", protocol);

    if (this.debug) {
      console.log(`[WidgetSessionManager] Created session ${sessionId} for tool ${toolName}`);
    }

    return session;
  }

  /**
   * Touch a session to reset its TTL (called on any interaction)
   */
  touchSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.lastAccessedAt = Date.now();
    // Also touch any linked external session (e.g., WidgetServer)
    session.onTouch?.();
    return true;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): ActiveWidgetSession | null {
    const session = this.sessions.get(sessionId) ?? null;
    if (session) {
      session.lastAccessedAt = Date.now();
      // Also touch any linked external session (e.g., WidgetServer)
      session.onTouch?.();
    }
    return session;
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
      lastAccessedAt: session.lastAccessedAt,
      logCount: session.consoleLogs.length,
      errorCount: session.pageErrors.length,
      dialogCount: session.dialogs.length,
      source: session.source,
    }));
  }

  /**
   * Record a tool call with its result (called from /execute-tool)
   *
   * @param sessionId - Session ID (unified with WidgetServer)
   * @param toolName - Name of the tool that was called
   * @param args - Arguments passed to the tool
   * @param result - Result returned by the tool
   * @param isError - Whether the tool call resulted in an error
   */
  recordToolCall(
    sessionId: string,
    toolName: string,
    args: unknown,
    result: unknown,
    isError: boolean = false
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      if (this.debug) {
        console.log(`[WidgetSessionManager] Session not found: ${sessionId}`);
      }
      return false;
    }

    const timestamp = Date.now();

    session.toolCalls.push({
      name: toolName,
      args,
      result,
      isError,
      timestamp,
    });

    // Record inspector events for the dashboard events panel
    // Record call-tool event (input)
    this.recordEvent(
      sessionId,
      "call-tool",
      { name: toolName, arguments: args },
      "widget",
      session.protocol
    );

    // Record call-tool-response event (output)
    this.recordEvent(
      sessionId,
      "call-tool-response",
      { name: toolName, result, isError },
      "server",
      session.protocol
    );

    // Touch session to reset TTL
    session.lastAccessedAt = Date.now();

    if (this.debug) {
      console.log(`[WidgetSessionManager] Recorded tool call ${toolName} for session ${sessionId}`);
    }

    return true;
  }

  /**
   * Update the session's tool result (for refresh scenarios)
   */
  updateToolResult(sessionId: string, toolResult: unknown): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.toolResult = toolResult;
    // Touch session to reset TTL
    session.lastAccessedAt = Date.now();
    return true;
  }

  /**
   * Update globals on a specific session (push hostContext/changed to widget)
   * Also resizes the iframe when displayMode or viewport changes
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

      // Determine platform for sizing calculations
      const platform = getPlatformFromDeviceType(environmentState.userAgent?.device?.type);

      // Get sizing based on display mode (use viewport from state, or derive from display mode)
      const displayMode: DisplayMode = environmentState.displayMode ?? "inline";
      const modeSizing = getDisplayModeSizing(displayMode, platform);
      const viewport = environmentState.viewport ?? {
        width: modeSizing.width,
        height: modeSizing.height,
      };

      // Resize the Playwright page viewport to match the new display mode sizing
      // This is the key step - the CDP screencast captures the page at this size
      // The host page CSS (100% width/height) will automatically fill the new viewport
      await page.setViewportSize(viewport);

      if (this.debug) {
        console.log(
          `[WidgetSessionManager] Resized page viewport to ${viewport.width}x${viewport.height}`
        );
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
          viewport: viewport,
          containerDimensions: viewport,
          platform:
            environmentState.userAgent?.device?.type === "mobile"
              ? "mobile"
              : environmentState.userAgent?.device?.type === "tablet"
                ? "web"
                : "desktop",
        };

        /* eslint-disable no-undef */
        await page.evaluate((ctx) => {
          const iframe = document.getElementById("widget-frame") as HTMLIFrameElement | null;
          if (iframe?.contentWindow) {
            // Use the correct MCP Apps protocol method name
            // Wrap context in hostContext to match ext-apps SDK format
            const message = {
              jsonrpc: "2.0",
              method: "ui/notifications/host-context-changed",
              params: { hostContext: ctx },
            };
            iframe.contentWindow.postMessage(message, "*");
            // eslint-disable-next-line no-console
            console.log("[MCP Host] Sent ui/notifications/host-context-changed", ctx);
          }
        }, hostContext);
        /* eslint-enable no-undef */
      } else {
        // OpenAI protocol: send via inspector_sync message from host to iframe
        // This ensures event.source === window.parent (required by SDK security)
        const maxHeight = environmentState.maxHeight ?? modeSizing.maxHeight;
        const globals = {
          theme: environmentState.theme,
          displayMode: environmentState.displayMode,
          locale: environmentState.locale,
          maxHeight: maxHeight,
          viewport: viewport,
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

      // Record globals event for the dashboard events panel
      this.recordEvent(sessionId, "globals", environmentState, "host", session.protocol);

      // Touch session to reset TTL
      session.lastAccessedAt = Date.now();

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

    // Record the event for the dashboard events panel
    // Cast SyncEventType to InspectorEventType (they overlap significantly)
    const eventType = type as InspectorEventType;
    const eventSource = isDomSyncEventType(type) ? "widget" : "host";

    if (sessionId) {
      this.recordEvent(sessionId, eventType, data, eventSource, protocol);
    } else {
      // Broadcast event to all matching sessions
      for (const [id, session] of this.sessions) {
        if (session.protocol === protocol) {
          this.recordEvent(id, eventType, data, eventSource, protocol);
        }
      }
    }

    // Route DOM interaction events directly to Playwright (not protocol-based delivery)
    // These are replayed to achieve 1:1 state sync with external widget
    if (isDomSyncEventType(type)) {
      await this.applyDomEvent(type, data, sessionId);
      return;
    }

    // If sessionId specified, sync to that session only
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session && !session.page.isClosed()) {
        await this.deliverEvent(session, type, data, protocol);
        // Touch session to reset TTL
        session.lastAccessedAt = Date.now();
      }
      return;
    }

    // Broadcast to all sessions matching protocol
    const promises: Promise<void>[] = [];
    for (const [, session] of this.sessions) {
      if (session.protocol === protocol && !session.page.isClosed()) {
        promises.push(
          this.deliverEvent(session, type, data, protocol).then(() => {
            // Touch session to reset TTL
            session.lastAccessedAt = Date.now();
          })
        );
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
      // DOM events are handled separately via applyDomEvent, not via postMessage
      "dom-click": null,
      "dom-dblclick": null,
      "dom-input": null,
      "dom-change": null,
      "dom-focus": null,
      "dom-blur": null,
      "dom-scroll": null,
      "dom-keydown": null,
      "dom-keyup": null,
      "dom-select": null,
      "dom-hover": null,
      "dom-drag": null,
    };

    // Handle call-tool-response specially - deliver to host page to resolve pending calls
    if (type === "call-tool-response") {
      await this.deliverToolCallResponse(session, data);
      return;
    }

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
          w.__mcpHostContextUpdates = { ...(w.__mcpHostContextUpdates ?? {}), ...(p as object) };
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
   * Deliver tool call response to host page (for dual mode)
   *
   * In dual mode, the Playwright mirror widget queues tool calls and waits
   * for synced responses from the external widget. This method delivers
   * those responses to resolve the pending calls.
   */
  private async deliverToolCallResponse(
    session: ActiveWidgetSession,
    data: unknown
  ): Promise<void> {
    /* eslint-disable no-undef */
    await session.page.evaluate((responseData) => {
      const d = responseData as { name?: string; result?: unknown; toolName?: string };
      const toolName = d.name ?? d.toolName;

      if (!toolName) {
        // eslint-disable-next-line no-console
        console.log("[MCP Host] Tool response missing name, cannot match:", responseData);
        return;
      }

      type PendingCall = { messageId: number | string; args: unknown; timestamp: number };
      const w = window as Window & { __pendingToolCalls?: Record<string, PendingCall[]> };
      const pending = w.__pendingToolCalls?.[toolName];

      if (!pending || pending.length === 0) {
        // eslint-disable-next-line no-console
        console.log("[MCP Host] No pending calls for tool:", toolName);
        return;
      }

      // Get the oldest pending call (FIFO)
      const call = pending.shift();
      if (!call) return;

      // Send response to widget iframe
      const iframe = document.getElementById("widget-frame") as HTMLIFrameElement | null;
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(
          {
            jsonrpc: "2.0",
            id: call.messageId,
            result: d.result ?? { content: [{ type: "text", text: JSON.stringify(d) }] },
          },
          "*"
        );
        // eslint-disable-next-line no-console
        console.log("[MCP Host] Delivered synced tool response:", toolName, call.messageId);
      }
    }, data);
    /* eslint-enable no-undef */
  }

  // ===========================================================================
  // DOM INTERACTION SYNC
  // ===========================================================================

  /**
   * Apply DOM events directly to Playwright widget frames
   *
   * These events are replayed to achieve 1:1 state sync with external widget.
   * Unlike protocol-based events, these interact directly with the widget DOM.
   */
  private async applyDomEvent(
    type: SyncEventType,
    data: unknown,
    sessionId?: string
  ): Promise<void> {
    const sessions = sessionId
      ? [this.sessions.get(sessionId)].filter((s): s is ActiveWidgetSession => !!s)
      : Array.from(this.sessions.values());

    for (const session of sessions) {
      if (session.page.isClosed()) continue;

      // Find widget iframe
      const frame = session.page.frame({ name: "widget-frame" });
      if (!frame) {
        if (this.debug) {
          console.log(`[WidgetSessionManager] No widget-frame found for session ${session.id}`);
        }
        continue;
      }

      try {
        await this.applyDomEventToFrame(frame, type, data);
        session.lastAccessedAt = Date.now();
        if (this.debug) {
          console.log(`[WidgetSessionManager] Applied ${type} to session ${session.id}`);
        }
      } catch (error) {
        if (this.debug) {
          console.warn(`[WidgetSessionManager] Failed to apply ${type}:`, error);
        }
      }
    }
  }

  /**
   * Apply a single DOM event to a Playwright frame
   */
  private async applyDomEventToFrame(
    frame: Frame,
    type: SyncEventType,
    data: unknown
  ): Promise<void> {
    const timeout = 5000;

    switch (type) {
      case "dom-click": {
        const { selector, x, y } = data as DomClickPayload;
        await frame.click(selector, {
          position: x !== undefined && y !== undefined ? { x, y } : undefined,
          timeout,
        });
        break;
      }

      case "dom-dblclick": {
        const { selector, x, y } = data as DomClickPayload;
        await frame.dblclick(selector, {
          position: x !== undefined && y !== undefined ? { x, y } : undefined,
          timeout,
        });
        break;
      }

      case "dom-input": {
        const { selector, value } = data as DomInputPayload;
        await frame.fill(selector, value, { timeout });
        break;
      }

      case "dom-change": {
        const { selector, value, checked, inputType } = data as DomInputPayload;
        // Only use setChecked for checkbox/radio inputs
        if (checked !== undefined && (inputType === "checkbox" || inputType === "radio")) {
          await frame.setChecked(selector, checked, { timeout });
        } else {
          await frame.fill(selector, value, { timeout });
        }
        break;
      }

      case "dom-select": {
        const { selector, value, values } = data as DomSelectPayload;
        await frame.selectOption(selector, values ?? value, { timeout });
        break;
      }

      case "dom-scroll": {
        const { selector, scrollTop, scrollLeft } = data as DomScrollPayload;
        /* eslint-disable no-undef */
        await frame.evaluate(
          ({ sel, top, left }) => {
            if (sel) {
              const el = document.querySelector(sel);
              if (el) {
                el.scrollTop = top;
                el.scrollLeft = left;
              }
            } else {
              window.scrollTo(left, top);
            }
          },
          { sel: selector ?? null, top: scrollTop, left: scrollLeft }
        );
        /* eslint-enable no-undef */
        break;
      }

      case "dom-focus": {
        const { selector } = data as DomFocusPayload;
        await frame.focus(selector, { timeout });
        break;
      }

      case "dom-blur": {
        /* eslint-disable no-undef */
        await frame.evaluate(() => {
          (document.activeElement as HTMLElement)?.blur();
        });
        /* eslint-enable no-undef */
        break;
      }

      case "dom-keydown": {
        const { selector, key, modifiers } = data as DomKeyPayload;
        const mods: string[] = [];
        if (modifiers?.ctrl) mods.push("Control");
        if (modifiers?.alt) mods.push("Alt");
        if (modifiers?.shift) mods.push("Shift");
        if (modifiers?.meta) mods.push("Meta");
        const keyCombo = [...mods, key].join("+");
        await frame.press(selector, keyCombo, { timeout });
        break;
      }

      case "dom-drag": {
        const { sourceSelector, targetSelector } = data as DomDragPayload;
        // Strip transient drag-related classes from selectors (e.g., .drag-over, .dragging)
        // These classes only exist during active drag operations in the source widget
        const cleanSelector = (sel: string): string =>
          sel
            .replace(/\.drag-over/g, "")
            .replace(/\.dragging/g, "")
            .replace(/\.drag-source/g, "")
            .replace(/\.drag-target/g, "")
            .replace(/\.is-dragging/g, "")
            .replace(/\.is-drag-over/g, "");
        const cleanTarget = cleanSelector(targetSelector);
        const cleanSource = cleanSelector(sourceSelector);
        await frame.dragAndDrop(cleanSource, cleanTarget, { timeout });
        break;
      }

      // dom-keyup, dom-hover: no direct Playwright equivalent, skip
      default:
        break;
    }
  }

  /**
   * Get a page for streaming (for dashboard screencast)
   *
   * Returns the page only if it exists and is not closed.
   * Does NOT touch the session TTL - the streaming layer handles that separately.
   *
   * @param sessionId - Session ID
   * @returns The Playwright page or null if not available
   */
  getPageForStreaming(sessionId: string): Page | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (session.page.isClosed()) return null;
    return session.page;
  }

  /**
   * Close a specific session
   */
  async closeSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Record session-closed event before deleting the session
    this.recordEvent(
      sessionId,
      "session-closed",
      { toolName: session.toolName },
      "server",
      session.protocol
    );

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
   * Clean up stale sessions (TTL expired based on last access time)
   */
  private async cleanupStaleSessions(): Promise<void> {
    const now = Date.now();
    const staleSessionIds: string[] = [];

    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastAccessedAt > this.ttl) {
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
