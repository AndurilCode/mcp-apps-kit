/**
 * Session Renderer
 *
 * Handles Playwright page setup, rendering, and listener configuration for widget sessions.
 * Extracts the page initialization and rendering logic from WidgetSessionManager and UIHost.
 */

import type { BrowserContext, Page, Frame } from "playwright";
import type { DetectedProtocol } from "../ui-host";
import type { TrackedDialog, EnvironmentState } from "../types";
import type { ConsoleLogEntry } from "../tools/get-console-logs";
import type { WidgetProtocol } from "./widget-session";
import { mapConsoleTypeToLogLevel, getLogSourceFromUrl } from "../tools/helpers";
import {
  getDisplayModeSizing,
  getPlatformFromDeviceType,
  type DisplayMode,
} from "../types/environment-types";

// ===========================================================================
// SESSION RENDERER CLASS
// ===========================================================================

/**
 * Options for rendering a widget page
 */
export interface RenderOptions {
  /** Protocol used (mcp or openai) */
  protocol: WidgetProtocol;
  /** URL of the host page to navigate to */
  hostUrl: string;
  /** Viewport dimensions */
  viewport?: { width: number; height: number };
  /** Wait for widget to initialize (ms) */
  initWaitMs?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Result of rendering a widget page
 */
export interface RenderResult {
  /** Playwright page instance */
  page: Page;
  /** Widget frame (iframe containing the widget) */
  frame: Frame | null;
  /** Errors captured during rendering */
  errors: string[];
}

/**
 * Session Renderer
 *
 * Renders widget pages in a Playwright browser context.
 * Handles page creation, navigation, viewport setup, and frame detection.
 */
export class SessionRenderer {
  constructor(private context: BrowserContext) {}

  /**
   * Render a widget page
   *
   * Creates a new page, navigates to the host URL, sets up the viewport,
   * waits for initialization, and locates the widget frame.
   *
   * @param options - Rendering options
   * @returns RenderResult with page, frame, and any errors
   */
  async render(options: RenderOptions): Promise<RenderResult> {
    const { protocol, hostUrl, viewport, initWaitMs = 500, debug } = options;
    const errors: string[] = [];

    // Create a new page in the context
    const page = await this.context.newPage();

    // Set viewport dimensions
    const effectiveViewport = viewport ?? { width: 800, height: 600 };
    await page.setViewportSize(effectiveViewport);

    // Capture console errors
    page.on("pageerror", (err) => {
      errors.push(err.message);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    if (debug) {
      console.log(`[SessionRenderer] Navigating to ${hostUrl}`);
    }

    // Navigate to the host page (which embeds the widget in an iframe)
    await page.goto(hostUrl, { waitUntil: "networkidle" });

    // Wait for widget to initialize and receive tool result via postMessage
    // The widget needs time to: load iframe -> execute JS -> init client -> send init -> receive response + tool/result -> re-render
    await page.waitForTimeout(initWaitMs);

    // Find the widget frame
    const frame = await this.findWidgetFrame(page, protocol);

    if (debug) {
      console.log(`[SessionRenderer] Rendered page, frame found: ${frame !== null}`);
    }

    return { page, frame, errors };
  }

  /**
   * Find the widget frame within a page
   *
   * Tries multiple strategies to locate the widget iframe:
   * 1. By name: "widget-frame"
   * 2. By URL pattern: /\/widget\//
   *
   * @param page - Playwright page instance
   * @param protocol - Protocol being used (mcp or openai)
   * @returns The widget Frame or null if not found
   */
  async findWidgetFrame(page: Page, protocol: WidgetProtocol): Promise<Frame | null> {
    // Strategy 1: Find by frame name (most reliable for our host pages)
    let frame = page.frame({ name: "widget-frame" });
    if (frame) {
      return frame;
    }

    // Strategy 2: Find by URL pattern (fallback)
    frame = page.frame({ url: /\/widget\// });
    if (frame) {
      return frame;
    }

    // Strategy 3: Wait briefly for iframe to appear (dynamic loading)
    try {
      await page.waitForSelector("iframe#widget-frame", { timeout: 2000 });
      frame = page.frame({ name: "widget-frame" });
      if (frame) {
        return frame;
      }
    } catch {
      // Timeout waiting for iframe, continue to return null
    }

    return null;
  }

  /**
   * Get the BrowserContext used by this renderer
   */
  getContext(): BrowserContext {
    return this.context;
  }
}

/**
 * Callbacks for session events
 */
export interface SessionRendererCallbacks {
  /** Called when a console message is logged */
  onConsoleLog?: (log: ConsoleLogEntry) => void;
  /** Called when a page error occurs */
  onPageError?: (error: string) => void;
  /** Called when a dialog is auto-handled */
  onDialog?: (dialog: TrackedDialog) => void;
}

/**
 * Options for setting up a session page
 */
export interface SetupPageOptions {
  /** Playwright page instance */
  page: Page;
  /** Session ID for logging */
  sessionId: string;
  /** Protocol used (mcp or openai) */
  protocol: DetectedProtocol;
  /** Event callbacks */
  callbacks?: SessionRendererCallbacks;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Set up page listeners for a widget session
 *
 * Configures console log capture, page error handling, and dialog auto-acceptance.
 */
export function setupPageListeners(options: SetupPageOptions): void {
  const { page, sessionId, callbacks, debug } = options;

  // Set up console log listener
  page.on("console", (msg) => {
    const location = msg.location();
    const log: ConsoleLogEntry = {
      level: mapConsoleTypeToLogLevel(msg.type()),
      text: msg.text(),
      source: getLogSourceFromUrl(location.url),
      timestamp: Date.now(),
      url: location.url || undefined,
      lineNumber: location.lineNumber || undefined,
    };
    callbacks?.onConsoleLog?.(log);
  });

  // Set up page error listener
  page.on("pageerror", (err) => {
    callbacks?.onPageError?.(err.message);
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

    callbacks?.onDialog?.(trackedDialog);

    if (debug) {
      console.log(
        `[SessionRenderer] Auto-accepted ${dialogType} dialog in session ${sessionId}: "${dialog.message()}"`
      );
    }

    // Accept the dialog (for confirm: returns true, for prompt: returns default value)
    await dialog.accept(dialog.defaultValue());
  });
}

/**
 * Options for updating session globals
 */
export interface UpdateGlobalsOptions {
  /** Playwright page instance */
  page: Page;
  /** Protocol used (mcp or openai) */
  protocol: DetectedProtocol;
  /** Environment state to push to widget */
  environmentState: EnvironmentState;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Update globals on a widget session page
 *
 * Pushes hostContext/environment changes to the widget and resizes the iframe
 * when displayMode or viewport changes.
 */
export async function updateSessionGlobals(options: UpdateGlobalsOptions): Promise<boolean> {
  const { page, protocol, environmentState, debug } = options;

  try {
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
    await page.setViewportSize(viewport);

    if (debug) {
      console.log(
        `[SessionRenderer] Resized page viewport to ${viewport.width}x${viewport.height}`
      );
    }

    // Build the host context update based on protocol
    if (protocol === "mcp") {
      await updateMcpGlobals(page, environmentState, viewport);
    } else {
      await updateOpenAIGlobals(page, environmentState, viewport, modeSizing.maxHeight);
    }

    return true;
  } catch (error) {
    if (debug) {
      console.warn(`[SessionRenderer] Error updating globals:`, error);
    }
    return false;
  }
}

/**
 * Update globals for MCP protocol
 */
async function updateMcpGlobals(
  page: Page,
  environmentState: EnvironmentState,
  viewport: { width: number; height: number }
): Promise<void> {
  // MCP protocol: send ui/notifications/host-context-changed notification via postMessage
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
}

/**
 * Update globals for OpenAI protocol
 */
async function updateOpenAIGlobals(
  page: Page,
  environmentState: EnvironmentState,
  viewport: { width: number; height: number },
  defaultMaxHeight: number
): Promise<void> {
  // OpenAI protocol: send via inspector_sync message from host to iframe
  const maxHeight = environmentState.maxHeight ?? defaultMaxHeight;
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

/**
 * Options for delivering tool call response
 */
export interface DeliverToolResponseOptions {
  /** Playwright page instance */
  page: Page;
  /** Response data containing tool name and result */
  data: unknown;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Deliver tool call response to host page (for dual mode)
 *
 * In dual mode, the Playwright mirror widget queues tool calls and waits
 * for synced responses from the external widget.
 */
export async function deliverToolCallResponse(options: DeliverToolResponseOptions): Promise<void> {
  const { page, data } = options;

  /* eslint-disable no-undef */
  await page.evaluate((responseData) => {
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
