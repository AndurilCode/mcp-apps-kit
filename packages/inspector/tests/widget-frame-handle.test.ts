import { describe, it, expect, vi } from "vitest";
import { createWidgetFrameHandle, WidgetFrameHandleImpl } from "../src/types/widget-frame-handle";
import type { Frame, Page, Locator } from "playwright";

// Mock helpers
function createMockFrame(sessionId: string): Frame {
  const mockScreenshot = vi.fn().mockResolvedValue(Buffer.from("png-data"));
  const mockLocator = { screenshot: mockScreenshot } as unknown as Locator;
  const frame = {
    url: () => `http://localhost:9999/widget/${sessionId}/`,
    locator: vi.fn().mockReturnValue(mockLocator),
    evaluate: vi.fn(),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    _mockScreenshot: mockScreenshot,
    _mockLocator: mockLocator,
  } as unknown as Frame;
  return frame;
}

function createMockPage(closed = false): Page {
  const page = {
    isClosed: () => closed,
    evaluate: vi.fn().mockResolvedValue(undefined),
  } as unknown as Page;
  return page;
}

describe("WidgetFrameHandle", () => {
  const sessionId = "test-session-abc123";

  it("exposes frame and sessionId", () => {
    const frame = createMockFrame(sessionId);
    const page = createMockPage();
    const handle = createWidgetFrameHandle(frame, sessionId, page);

    expect(handle.frame).toBe(frame);
    expect(handle.sessionId).toBe(sessionId);
  });

  it("screenshot delegates to frame.locator('body').screenshot()", async () => {
    const frame = createMockFrame(sessionId);
    const page = createMockPage();

    const handle = createWidgetFrameHandle(frame, sessionId, page);
    const result = await handle.screenshot({ type: "png" });

    expect(
      (frame as unknown as { locator: ReturnType<typeof vi.fn> }).locator
    ).toHaveBeenCalledWith("body");
    expect(result).toEqual(Buffer.from("png-data"));
  });

  it("screenshot with quality passes it through", async () => {
    const frame = createMockFrame(sessionId);
    const page = createMockPage();
    const mockScreenshot = (frame as unknown as { _mockScreenshot: ReturnType<typeof vi.fn> })
      ._mockScreenshot;

    const handle = createWidgetFrameHandle(frame, sessionId, page);
    await handle.screenshot({ type: "jpeg", quality: 80 });

    expect(mockScreenshot).toHaveBeenCalledWith({ type: "jpeg", quality: 80 });
  });

  it("resize evaluates CSS change on dashboard page", async () => {
    const frame = createMockFrame(sessionId);
    const page = createMockPage();

    const handle = createWidgetFrameHandle(frame, sessionId, page);
    await handle.resize(1024, 768);

    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), {
      sid: sessionId,
      w: 1024,
      h: 768,
    });
  });

  it("dispose is a no-op (MIG-PAGE)", async () => {
    const frame = createMockFrame(sessionId);
    const page = createMockPage();

    const handle = createWidgetFrameHandle(frame, sessionId, page);
    await expect(handle.dispose()).resolves.toBeUndefined();
    expect(page.isClosed()).toBe(false);
  });

  it("isAlive returns true when page is open", () => {
    const frame = createMockFrame(sessionId);
    const page = createMockPage(false);

    const handle = createWidgetFrameHandle(frame, sessionId, page);
    expect(handle.isAlive()).toBe(true);
  });

  it("isAlive returns false when page is closed", () => {
    const frame = createMockFrame(sessionId);
    const page = createMockPage(true);

    const handle = createWidgetFrameHandle(frame, sessionId, page);
    expect(handle.isAlive()).toBe(false);
  });

  it("postMessage uses frame.evaluate with window.postMessage", async () => {
    const frame = createMockFrame(sessionId);
    const page = createMockPage();

    const handle = createWidgetFrameHandle(frame, sessionId, page);
    const data = { type: "test", payload: 42 };
    await handle.postMessage(data);

    expect(frame.evaluate).toHaveBeenCalledWith(expect.any(Function), data);
  });

  it("WidgetFrameHandleImpl class works directly", () => {
    const frame = createMockFrame(sessionId);
    const page = createMockPage();

    const handle = new WidgetFrameHandleImpl(page, frame, sessionId);
    expect(handle.frame).toBe(frame);
    expect(handle.sessionId).toBe(sessionId);
    expect(handle.isAlive()).toBe(true);
  });

  it("factory function creates WidgetFrameHandleImpl instance", () => {
    const frame = createMockFrame(sessionId);
    const page = createMockPage();

    const handle = createWidgetFrameHandle(frame, sessionId, page);
    expect(handle).toBeInstanceOf(WidgetFrameHandleImpl);
  });
});
