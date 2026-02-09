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
  /** Post message to widget via frame.evaluate (MIG-POSTMSG: no getElementById) */
  postMessage(data: unknown): Promise<void>;
}

/**
 * Create a WidgetFrameHandle wrapping a session-scoped frame.
 *
 * @param frame - The Playwright Frame for this widget's iframe
 * @param sessionId - The widget session ID
 * @param dashboardPage - The parent dashboard page (for liveness checks)
 */
export function createWidgetFrameHandle(
  frame: PlaywrightFrame,
  sessionId: string,
  dashboardPage: PlaywrightPage
): WidgetFrameHandle {
  return {
    frame,
    sessionId,

    async screenshot(opts) {
      // Screenshot the frame's body element for just this widget
      const body = await frame.$("body");
      if (!body) {
        throw new Error(`Cannot screenshot: frame body not found for session ${sessionId}`);
      }
      return body.screenshot({
        type: opts?.type ?? "png",
        ...(opts?.quality !== undefined ? { quality: opts.quality } : {}),
      });
    },

    async resize(width: number, height: number) {
      // Resize iframe via CSS on the parent page (not the viewport)
      await dashboardPage.evaluate(
        ({ sid, w, h }) => {
          const iframe = document.querySelector(
            `iframe[src*="/widget/${sid}/"]`
          ) as HTMLIFrameElement | null;
          if (iframe) {
            iframe.style.width = `${w}px`;
            iframe.style.height = `${h}px`;
          }
        },
        { sid: sessionId, w: width, h: height }
      );
    },

    async dispose() {
      // No-op: dashboard page must never be closed (MIG-PAGE)
    },

    isAlive() {
      return !dashboardPage.isClosed();
    },

    async postMessage(data: unknown) {
      // MIG-POSTMSG: use frame.evaluate, no getElementById
      await frame.evaluate((d) => window.postMessage(d, "*"), data);
    },
  };
}
