/**
 * CDP Screencast Streamer
 *
 * Manages Chrome DevTools Protocol screencast sessions for real-time
 * browser content streaming. Uses CDP's native screencast feature which:
 * - Only sends frames when content actually changes (event-driven)
 * - Has low latency (native browser streaming, not polling)
 * - Uses efficient browser-optimized JPEG compression
 * - Provides true real-time updates (no artificial FPS cap)
 */

import type { Page, CDPSession } from "playwright";

import { createLogger } from "../debug/logger";

const logger = createLogger("CDPStreamer");

/**
 * Screencast frame data
 */
export interface ScreencastFrame {
  /** Base64-encoded JPEG image data */
  data: string;
  /** Timestamp when the frame was captured */
  timestamp: number;
}

/**
 * Active streaming session
 */
interface StreamingSession {
  /** CDP session for screencast control */
  cdpSession: CDPSession;
  /** Playwright page being streamed */
  page: Page;
  /** Interval for touching widget session TTL */
  touchInterval: ReturnType<typeof setInterval>;
  /** Frame callback for restarting screencast */
  onFrame: (frame: ScreencastFrame) => void;
  /** Error callback for restarting screencast */
  onError: (error: Error) => void;
  /** Touch callback for restarting screencast */
  onTouch?: () => void;
  /** Current screencast dimensions */
  currentDimensions: { width: number; height: number };
}

/**
 * Screencast quality/resolution options
 */
export interface ScreencastOptions {
  /** Maximum width of the screencast (default: 800) */
  maxWidth?: number;
  /** Maximum height of the screencast (default: 600) */
  maxHeight?: number;
  /** JPEG quality 0-100 (default: 100) */
  quality?: number;
}

/**
 * Default screencast options for high-quality streaming
 *
 * Note: maxWidth/maxHeight are the MAXIMUM capture dimensions.
 * The actual capture size matches the page viewport (up to these limits).
 * We set these high enough to accommodate all display mode presets:
 * - inline: 800x600 (desktop), 375x400 (mobile)
 * - fullscreen: 1280x800 (desktop), 375x667 (mobile)
 * - pip: 320x240 (desktop), 280x210 (mobile)
 */
const DEFAULT_SCREENCAST_OPTIONS: Required<ScreencastOptions> = {
  maxWidth: 2048,
  maxHeight: 2048,
  quality: 100,
};

/**
 * Manages CDP screencast sessions for streaming browser content
 */
export class CDPStreamer {
  private sessions: Map<string, StreamingSession> = new Map();
  private debug: boolean;
  private options: Required<ScreencastOptions>;

  constructor(options: { debug?: boolean } & ScreencastOptions = {}) {
    this.debug = options.debug ?? false;
    this.options = {
      maxWidth: options.maxWidth ?? DEFAULT_SCREENCAST_OPTIONS.maxWidth,
      maxHeight: options.maxHeight ?? DEFAULT_SCREENCAST_OPTIONS.maxHeight,
      quality: options.quality ?? DEFAULT_SCREENCAST_OPTIONS.quality,
    };
  }

  /**
   * Start screencast for a session
   *
   * @param sessionId - Widget session ID
   * @param page - Playwright page to stream
   * @param onFrame - Callback when a new frame is available
   * @param onError - Callback when an error occurs
   * @param onTouch - Optional callback to touch session TTL (keep it alive)
   */
  async startScreencast(
    sessionId: string,
    page: Page,
    onFrame: (frame: ScreencastFrame) => void,
    onError: (error: Error) => void,
    onTouch?: () => void
  ): Promise<void> {
    // Check if already streaming
    if (this.sessions.has(sessionId)) {
      throw new Error(`Already streaming session ${sessionId}`);
    }

    // Check if page is closed
    if (page.isClosed()) {
      throw new Error(`Page for session ${sessionId} is closed`);
    }

    try {
      // Create CDP session
      const cdpSession = await page.context().newCDPSession(page);

      // Set up frame handler
      // The event type is Playwright's internal screencastFramePayload
      cdpSession.on("Page.screencastFrame", (event) => {
        // Deliver frame to callback
        onFrame({
          data: event.data,
          timestamp: event.metadata.timestamp ?? Date.now(),
        });

        // Acknowledge frame to receive next one
        cdpSession
          .send("Page.screencastFrameAck", { sessionId: event.sessionId })
          .catch((err: unknown) => {
            if (this.debug) {
              logger.warn(`[CDPStreamer] Frame ack failed for ${sessionId}:`, err);
            }
          });
      });

      // Start screencast with high resolution settings
      await cdpSession.send("Page.startScreencast", {
        format: "jpeg",
        quality: this.options.quality,
        maxWidth: this.options.maxWidth,
        maxHeight: this.options.maxHeight,
        everyNthFrame: 1,
      });

      // Set up interval to touch session TTL (every 30 seconds)
      const touchInterval = setInterval(() => {
        onTouch?.();
      }, 30_000);

      // Store session with callbacks for potential restart
      this.sessions.set(sessionId, {
        cdpSession,
        page,
        touchInterval,
        onFrame,
        onError,
        onTouch,
        currentDimensions: { width: this.options.maxWidth, height: this.options.maxHeight },
      });

      if (this.debug) {
        logger.info(`[CDPStreamer] Started screencast for session ${sessionId}`);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      onError(err);
      throw err;
    }
  }

  /**
   * Update screencast dimensions for an active session
   *
   * Restarts the screencast with new dimensions if they differ from current.
   * This is called when viewport/displayMode changes via set_globals.
   *
   * @param sessionId - Widget session ID
   * @param width - New width
   * @param height - New height
   */
  async updateDimensions(sessionId: string, width: number, height: number): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Skip if dimensions haven't changed
    if (session.currentDimensions.width === width && session.currentDimensions.height === height) {
      return true;
    }

    if (this.debug) {
      logger.info(
        `[CDPStreamer] Updating dimensions for ${sessionId}: ${width}x${height} (was ${session.currentDimensions.width}x${session.currentDimensions.height})`
      );
    }

    try {
      // Stop current screencast
      await session.cdpSession.send("Page.stopScreencast");

      // Restart screencast with new dimensions
      await session.cdpSession.send("Page.startScreencast", {
        format: "jpeg",
        quality: this.options.quality,
        maxWidth: width,
        maxHeight: height,
        everyNthFrame: 1,
      });

      // Only update stored dimensions after Page.startScreencast succeeds
      session.currentDimensions = { width, height };

      if (this.debug) {
        logger.info(`[CDPStreamer] Restarted screencast for ${sessionId} with new dimensions`);
      }

      return true;
    } catch (error) {
      if (this.debug) {
        logger.warn(`[CDPStreamer] Failed to update dimensions for ${sessionId}:`, error);
      }
      return false;
    }
  }

  /**
   * Stop screencast for a session
   *
   * @param sessionId - Widget session ID
   */
  async stopScreencast(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Clear touch interval
    clearInterval(session.touchInterval);

    try {
      // Stop screencast
      await session.cdpSession.send("Page.stopScreencast");

      // Detach CDP session
      await session.cdpSession.detach();
    } catch (error) {
      if (this.debug) {
        logger.warn(`[CDPStreamer] Error stopping screencast for ${sessionId}:`, error);
      }
    }

    // Remove from map
    this.sessions.delete(sessionId);

    if (this.debug) {
      logger.info(`[CDPStreamer] Stopped screencast for session ${sessionId}`);
    }
  }

  /**
   * Check if a session is currently streaming
   *
   * @param sessionId - Widget session ID
   */
  isStreaming(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Stop all active screencasts
   */
  async stopAll(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      await this.stopScreencast(sessionId);
    }
  }
}
