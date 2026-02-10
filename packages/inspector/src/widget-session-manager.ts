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
 *
 * ## Refactored Architecture
 *
 * Uses SessionStore for session lifecycle management, while this class
 * handles higher-level concerns like event recording and protocol delivery.
 */

import { EventEmitter } from "node:events";
import type { Frame, Page } from "playwright";
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
} from "./types";
import { isDomSyncEventType, getEventCategory } from "./types";
import {
  getDisplayModeSizing,
  getPlatformFromDeviceType,
  type DisplayMode,
} from "./types/environment-types";

// Import from session module
import { SessionStore, setupPageListeners, deliverToolCallResponse } from "./session";
import type { ActiveWidgetSession, SessionInfo, SessionSource, ProxyMetadata } from "./session";
import { createLogger } from "./debug/logger";

const logger = createLogger("WidgetSessionManager");

// Re-export types for backwards compatibility
export type { ActiveWidgetSession, SessionInfo, SessionSource, ProxyMetadata };

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
  private store: SessionStore;
  private readonly debug: boolean;
  private eventIdCounter: number = 0;

  constructor(options: WidgetSessionManagerOptions = {}) {
    super();
    this.debug = options.debug ?? false;

    // Initialize session store with same options
    this.store = new SessionStore({
      ttl: options.ttl,
      debug: options.debug,
    });
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
    const session = this.store.peek(sessionId);
    if (!session) {
      if (this.debug) {
        logger.info(
          `[WidgetSessionManager] Dropping event ${type} - session ${sessionId} not found`
        );
      }
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

    this.store.recordEvent(sessionId, event);
    this.emit("event", event);

    if (this.debug) {
      logger.info(`[WidgetSessionManager] Recorded event ${type} for session ${sessionId}`);
    }

    return event;
  }

  /**
   * Get all events for a session
   */
  getEvents(sessionId: string): InspectorEvent[] {
    const session = this.store.peek(sessionId);
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
    // Create session in store
    const session = this.store.create({
      sessionId,
      toolName,
      toolArgs,
      toolResult,
      page,
      protocol,
      source,
      proxyMetadata,
      onTouch,
    });

    // Set up page listeners using the session-renderer module
    setupPageListeners({
      page,
      sessionId,
      protocol,
      debug: this.debug,
      callbacks: {
        onConsoleLog: (log) => {
          this.store.recordConsoleLog(sessionId, log);
        },
        onPageError: (error) => {
          this.store.recordPageError(sessionId, error);
          // Record as inspector event
          this.recordEvent(sessionId, "page-error", { message: error }, "widget", protocol);
        },
        onDialog: (dialog) => {
          this.store.recordDialog(sessionId, dialog);
          // Record as inspector event
          this.recordEvent(sessionId, "dialog", dialog, "widget", protocol);
        },
      },
    });

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
      logger.info(`[WidgetSessionManager] Created session ${sessionId} for tool ${toolName}`);
    }

    return session;
  }

  /**
   * Touch a session to reset its TTL (called on any interaction)
   */
  touchSession(sessionId: string): boolean {
    return this.store.touch(sessionId);
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): ActiveWidgetSession | null {
    return this.store.get(sessionId);
  }

  /**
   * List all active sessions
   */
  listSessions(): SessionInfo[] {
    return this.store.list();
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
    const session = this.store.peek(sessionId);
    if (!session) {
      if (this.debug) {
        logger.info(`[WidgetSessionManager] Session not found: ${sessionId}`);
      }
      return false;
    }

    const timestamp = Date.now();

    this.store.recordToolCall(sessionId, {
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

    if (this.debug) {
      logger.info(`[WidgetSessionManager] Recorded tool call ${toolName} for session ${sessionId}`);
    }

    return true;
  }

  /**
   * Update the session's tool result (for refresh scenarios)
   */
  updateToolResult(sessionId: string, toolResult: unknown): boolean {
    return this.store.updateToolResult(sessionId, toolResult);
  }

  /**
   * Update globals on a specific session (push hostContext/changed to widget)
   * Also resizes the iframe when displayMode or viewport changes
   */
  async updateSessionGlobals(
    sessionId: string,
    environmentState: EnvironmentState
  ): Promise<boolean> {
    const session = this.store.peek(sessionId);
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

      // Get sizing based on display mode
      const displayMode: DisplayMode = environmentState.displayMode ?? "inline";
      const modeSizing = getDisplayModeSizing(displayMode, platform);

      let viewport: { width: number; height: number };
      if (displayMode === "fullscreen") {
        // Fullscreen: both dimensions fixed from presets
        viewport = { width: modeSizing.width, height: modeSizing.height };
      } else {
        // Inline/PiP: fixed width, dynamic height clamped to maxHeight
        const envHeight = environmentState.viewport?.height ?? modeSizing.height;
        const maxH = environmentState.maxHeight ?? modeSizing.maxHeight;
        const clampedHeight =
          maxH !== null && maxH !== undefined ? Math.min(envHeight, maxH) : envHeight;
        viewport = { width: modeSizing.width, height: clampedHeight };
      }

      // Resize the Playwright page viewport to match the computed sizing
      // This is the key step - the CDP screencast captures the page at this size
      // The host page CSS (100% width/height) will automatically fill the new viewport
      await page.setViewportSize(viewport);

      if (this.debug) {
        logger.info(
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
        await page.evaluate((ctx: typeof hostContext) => {
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
            console.log("[MCP Host] Sent ui/notifications/host-context-changed", ctx); // eslint-disable-line no-console
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
        await page.evaluate((message: typeof syncMessage) => {
          const iframe = document.getElementById("widget-frame") as HTMLIFrameElement | null;
          if (iframe?.contentWindow) {
            iframe.contentWindow.postMessage(message, "*");
            console.log("[OpenAI Host] Sent globals sync:", message.data); // eslint-disable-line no-console
          }
        }, syncMessage);
        /* eslint-enable no-undef */
      }

      // Record globals event for the dashboard events panel
      this.recordEvent(sessionId, "globals", environmentState, "host", session.protocol);

      // Touch session to reset TTL
      this.store.touch(sessionId);

      if (this.debug) {
        logger.info(`[WidgetSessionManager] Updated globals for session ${sessionId}`);
      }

      return true;
    } catch (error) {
      if (this.debug) {
        logger.warn(
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
    for (const sessionId of this.store.keys()) {
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
      for (const session of this.store.values()) {
        if (session.protocol === protocol) {
          this.recordEvent(session.id, eventType, data, eventSource, protocol);
        }
      }
    }

    // Route DOM interaction events directly to Playwright (not protocol-based delivery)
    // These are replayed to achieve 1:1 state sync with external widget
    if (isDomSyncEventType(type)) {
      await this.applyDomEvent(type, data, sessionId);
      return;
    }

    // For globals/host-context-changed events with displayMode, resize the Playwright viewport
    // This is critical for 1:1 sync when the external widget requests a display mode change
    if (type === "globals" || type === "host-context-changed") {
      await this.handleGlobalsSync(data, sessionId, protocol);
    }

    // If sessionId specified, sync to that session only
    if (sessionId) {
      const session = this.store.peek(sessionId);
      if (session && !session.page.isClosed()) {
        await this.deliverEvent(session, type, data, protocol);
        // Touch session to reset TTL
        this.store.touch(sessionId);
      }
      return;
    }

    // Broadcast to all sessions matching protocol
    const promises: Promise<void>[] = [];
    for (const session of this.store.values()) {
      if (session.protocol === protocol && !session.page.isClosed()) {
        promises.push(
          this.deliverEvent(session, type, data, protocol).then(() => {
            // Touch session to reset TTL
            this.store.touch(session.id);
          })
        );
      }
    }
    await Promise.all(promises);
  }

  /**
   * Handle globals/host-context-changed sync events
   *
   * When the external widget requests a displayMode change, we need to:
   * 1. Resize the Playwright viewport to match the new display mode sizing
   * 2. The postMessage delivery happens separately in deliverEvent
   *
   * This ensures the Playwright page viewport matches what the external widget sees.
   */
  private async handleGlobalsSync(
    data: unknown,
    sessionId: string | undefined,
    protocol: "openai" | "mcp"
  ): Promise<void> {
    const globals = data as Record<string, unknown> | undefined;
    if (!globals) return;

    // Check if displayMode is in the globals
    const displayMode = globals.displayMode as DisplayMode | undefined;
    const viewport = globals.viewport as { width: number; height: number } | undefined;

    // If no displayMode or viewport change, nothing to resize
    if (!displayMode && !viewport) return;

    // Determine which sessions to update
    const sessionsToUpdate: ActiveWidgetSession[] = [];
    if (sessionId) {
      const session = this.store.peek(sessionId);
      if (session && !session.page.isClosed()) {
        sessionsToUpdate.push(session);
      }
    } else {
      // All sessions matching protocol
      for (const session of this.store.values()) {
        if (session.protocol === protocol && !session.page.isClosed()) {
          sessionsToUpdate.push(session);
        }
      }
    }

    // Resize viewports for all matching sessions
    for (const session of sessionsToUpdate) {
      try {
        // Calculate new viewport size based on displayMode
        let newViewport = viewport;
        if (!newViewport && displayMode) {
          // Infer viewport from displayMode using platform
          const userAgent = globals.userAgent as { device?: { type?: string } } | undefined;
          const platform = getPlatformFromDeviceType(userAgent?.device?.type);
          const sizing = getDisplayModeSizing(displayMode, platform);
          newViewport = { width: sizing.width, height: sizing.height };
        }

        if (newViewport) {
          await session.page.setViewportSize(newViewport);
          if (this.debug) {
            logger.info(
              `[WidgetSessionManager] Resized viewport for session ${session.id} to ${newViewport.width}x${newViewport.height} (displayMode: ${displayMode ?? "unchanged"})`
            );
          }
        }
      } catch (error) {
        if (this.debug) {
          logger.warn(
            `[WidgetSessionManager] Failed to resize viewport for session ${session.id}:`,
            error
          );
        }
      }
    }
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
        logger.info(
          `[WidgetSessionManager] Delivered ${type} event to session ${session.id} (${protocol})`
        );
      }
    } catch (error) {
      if (this.debug) {
        logger.warn(
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
      await deliverToolCallResponse({ page: session.page, data, debug: this.debug });
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
      ({
        method: m,
        params: p,
        storeOnHost,
      }: {
        method: string;
        params: unknown;
        storeOnHost: boolean;
      }) => {
        // Store host context updates for ui/initialize response
        if (storeOnHost) {
          const w = window as Window & { __mcpHostContextUpdates?: Record<string, unknown> };
          w.__mcpHostContextUpdates = { ...(w.__mcpHostContextUpdates ?? {}), ...(p as object) };
          console.log("[MCP Host] Stored hostContext update for ui/initialize:", p); // eslint-disable-line no-console
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
          console.log("[MCP Host] Sent synced event:", m, p); // eslint-disable-line no-console
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
    await session.page.evaluate((message: typeof syncMessage) => {
      const iframe = document.getElementById("widget-frame") as HTMLIFrameElement | null;
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(message, "*");
        console.log("[OpenAI Host] Sent synced event:", message.syncType, message.data); // eslint-disable-line no-console
      }
    }, syncMessage);
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
      ? [this.store.peek(sessionId)].filter((s): s is ActiveWidgetSession => !!s)
      : Array.from(this.store.values());

    for (const session of sessions) {
      if (session.page.isClosed()) continue;

      // Find widget iframe
      const frame = session.page.frame({ name: "widget-frame" });
      if (!frame) {
        if (this.debug) {
          logger.info(`[WidgetSessionManager] No widget-frame found for session ${session.id}`);
        }
        continue;
      }

      try {
        await this.applyDomEventToFrame(frame, type, data);
        this.store.touch(session.id);
        if (this.debug) {
          logger.info(`[WidgetSessionManager] Applied ${type} to session ${session.id}`);
        }
      } catch (error) {
        if (this.debug) {
          logger.warn(`[WidgetSessionManager] Failed to apply ${type}:`, error);
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
        // Use values only if it's a non-empty array, otherwise fall back to single value
        const selectValue = Array.isArray(values) && values.length > 0 ? values : value;
        await frame.selectOption(selector, selectValue, { timeout });
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
    const session = this.store.peek(sessionId);
    if (!session) return null;
    if (session.page.isClosed()) return null;
    return session.page;
  }

  /**
   * Close a specific session
   */
  async closeSession(sessionId: string): Promise<boolean> {
    const session = this.store.peek(sessionId);
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

    const result = await this.store.close(sessionId);

    if (this.debug && result) {
      logger.info(`[WidgetSessionManager] Closed session ${sessionId}`);
    }

    return result;
  }

  /**
   * Close all active sessions
   */
  async closeAllSessions(): Promise<number> {
    // Record events before closing
    for (const session of this.store.values()) {
      this.recordEvent(
        session.id,
        "session-closed",
        { toolName: session.toolName },
        "server",
        session.protocol
      );
    }

    const count = await this.store.closeAll();

    if (this.debug) {
      logger.info(`[WidgetSessionManager] Closed ${count} session(s)`);
    }

    return count;
  }

  /**
   * Stop the cleanup interval and close all sessions
   */
  async dispose(): Promise<void> {
    await this.store.dispose();

    if (this.debug) {
      logger.info(`[WidgetSessionManager] Disposed`);
    }
  }

  /**
   * Inject a session directly (for testing only)
   * @internal
   */
  _injectSession(sessionId: string, session: ActiveWidgetSession): void {
    this.store.set(sessionId, session);
  }
}
