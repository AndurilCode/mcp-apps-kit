/**
 * WidgetFrameHandle — session-scoped Frame wrapper for interactive mode.
 *
 * Wraps a Playwright Frame (inside the dashboard page) instead of a raw Page.
 * The dashboard page is shared and MUST NEVER be closed (MIG-PAGE).
 */

import type { Frame as PlaywrightFrame, Page as PlaywrightPage } from "playwright";

/**
 * A handle to a single widget iframe within the shared dashboard page.
 */
export interface WidgetFrameHandle {
  /** The session-scoped Frame (NOT the page) */
  readonly frame: PlaywrightFrame;
  /** Session ID for disambiguation */
  readonly sessionId: string;
  /** Screenshot of just this widget's iframe body */
  screenshot(opts?: { type?: "png" | "jpeg"; quality?: number }): Promise<Buffer>;
  /** Resize this widget's iframe via CSS (not page viewport) */
  resize(width: number, height: number): Promise<void>;
  /** No-op — dashboard page must never be closed (MIG-PAGE) */
  dispose(): Promise<void>;
  /** Whether the underlying page is still alive */
  isAlive(): boolean;
  /** Post message to widget via frame.evaluate */
  postMessage(data: unknown): Promise<void>;
}

/**
 * Implementation of WidgetFrameHandle that wraps a session-scoped Playwright Frame.
 *
 * MIG-PAGE: dispose() is a no-op — the dashboard page must NEVER be closed.
 * MIG-FRAME: Frame lookup uses session-scoped regex, never global /\/widget\//.
 */
export class WidgetFrameHandleImpl implements WidgetFrameHandle {
  readonly frame: PlaywrightFrame;
  readonly sessionId: string;
  private readonly page: PlaywrightPage;

  constructor(page: PlaywrightPage, frame: PlaywrightFrame, sessionId: string) {
    this.page = page;
    this.frame = frame;
    this.sessionId = sessionId;
  }

  async screenshot(opts?: { type?: "png" | "jpeg"; quality?: number }): Promise<Buffer> {
    return this.frame.locator("body").screenshot({
      type: opts?.type ?? "png",
      ...(opts?.quality !== undefined ? { quality: opts.quality } : {}),
    });
  }

  async resize(width: number, height: number): Promise<void> {
    await this.page.evaluate(
      ({ sid, w, h }) => {
        const iframe = document.querySelector(
          `iframe[data-session="${sid}"]`
        ) as HTMLIFrameElement | null;
        if (iframe) {
          iframe.style.width = `${w}px`;
          iframe.style.height = `${h}px`;
        }
      },
      { sid: this.sessionId, w: width, h: height }
    );
  }

  async dispose(): Promise<void> {
    // No-op: dashboard page must NEVER be closed (MIG-PAGE)
  }

  isAlive(): boolean {
    return !this.page.isClosed();
  }

  async postMessage(data: unknown): Promise<void> {
    await this.frame.evaluate((d) => window.postMessage(d, "*"), data);
  }
}

/**
 * Factory function for creating a WidgetFrameHandle.
 * Convenience wrapper around WidgetFrameHandleImpl.
 */
export function createWidgetFrameHandle(
  frame: PlaywrightFrame,
  sessionId: string,
  dashboardPage: PlaywrightPage
): WidgetFrameHandle {
  return new WidgetFrameHandleImpl(dashboardPage, frame, sessionId);
}
