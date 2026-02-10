/**
 * Session Renderer
 *
 * Handles Playwright page setup and listener configuration for widget sessions.
 * Extracts the page initialization logic from WidgetSessionManager.
 */

import type { Page } from "playwright";
import type { DetectedProtocol } from "../ui-host";
import type { TrackedDialog, EnvironmentState } from "../types";
import type { ConsoleLogEntry } from "../tools/get-console-logs";
import { mapConsoleTypeToLogLevel, getLogSourceFromUrl } from "../tools/helpers";
import { createLogger } from "../debug/logger";

const logger = createLogger("session-renderer");

import {
  getDisplayModeSizing,
  getPlatformFromDeviceType,
  type DisplayMode,
} from "../types/environment-types";

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
      logger.info(
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
    await page.setViewportSize(viewport);

    if (debug) {
      logger.info(
        `[SessionRenderer] Resized page viewport to ${viewport.width}x${viewport.height}`
      );
    }

    // Build the host context update based on protocol
    if (protocol === "mcp") {
      await updateMcpGlobals(page, environmentState, viewport);
    } else if (protocol === "openai") {
      const maxHeight: number = modeSizing.maxHeight ?? 600;
      await updateOpenAIGlobals(page, environmentState, viewport, maxHeight);
    } else {
      // Log warning for unexpected protocol values
      if (debug) {
        logger.warn(`[SessionRenderer] Unknown protocol "${protocol}", skipping globals update`);
      }
    }

    return true;
  } catch (error) {
    if (debug) {
      logger.warn(`[SessionRenderer] Error updating globals:`, error);
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
  await page.evaluate((ctx: typeof hostContext) => {
    const iframe = document.getElementById("widget-frame") as HTMLIFrameElement | null;
    if (iframe?.contentWindow) {
      const message = {
        jsonrpc: "2.0",
        method: "ui/notifications/host-context-changed",
        params: { hostContext: ctx },
      };
      iframe.contentWindow.postMessage(message, "*");
      logger.info("[MCP Host] Sent ui/notifications/host-context-changed", ctx);
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
  await page.evaluate((message: typeof syncMessage) => {
    const iframe = document.getElementById("widget-frame") as HTMLIFrameElement | null;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(message, "*");
      logger.info("[OpenAI Host] Sent globals sync:", message.data);
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
  await page.evaluate((responseData: unknown) => {
    // Validate responseData is a non-null object before accessing properties
    if (typeof responseData !== "object" || responseData === null) {
      logger.info("[MCP Host] Tool response is not a valid object:", responseData);
      return;
    }

    const d = responseData as Record<string, unknown>;
    const nameValue = d.name;
    const toolNameValue = d.toolName;

    // Validate that name or toolName exists and is a string
    const toolName =
      typeof nameValue === "string" && nameValue
        ? nameValue
        : typeof toolNameValue === "string" && toolNameValue
          ? toolNameValue
          : null;

    if (!toolName) {
      logger.info("[MCP Host] Tool response missing valid name/toolName string:", responseData);
      return;
    }

    type PendingCall = { messageId: number | string; args: unknown; timestamp: number };
    const w = window as Window & { __pendingToolCalls?: Record<string, PendingCall[]> };
    const pending = w.__pendingToolCalls?.[toolName];

    if (!pending || pending.length === 0) {
      logger.info("[MCP Host] No pending calls for tool:", toolName);
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
      logger.info("[MCP Host] Delivered synced tool response:", toolName, call.messageId);
    }
  }, data);
  /* eslint-enable no-undef */
}
