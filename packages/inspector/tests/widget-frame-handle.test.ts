import { describe, it, expect, vi } from "vitest";
import { createWidgetFrameHandle } from "../src/types/widget-frame-handle";
import type { Frame, Page, ElementHandle } from "playwright";

// Mock helpers
function createMockFrame(sessionId: string): Frame {
  const frame = {
    url: () => `http://localhost:9999/widget/${sessionId}/`,
    $: vi.fn(),
    evaluate: vi.fn(),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
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

  it("screenshot delegates to frame body element", async () => {
    const frame = createMockFrame(sessionId);
    const page = createMockPage();
    const mockBuffer = Buffer.from("png-data");
    const mockBody = { screenshot: vi.fn().mockResolvedValue(mockBuffer) };
    (frame.$ as ReturnType<typeof vi.fn>).mockResolvedValue(mockBody);

    const handle = createWidgetFrameHandle(frame, sessionId, page);
    const result = await handle.screenshot({ type: "png" });

    expect(frame.$).toHaveBeenCalledWith("body");
    expect(mockBody.screenshot).toHaveBeenCalledWith({ type: "png" });
    expect(result).toBe(mockBuffer);
  });

  it("screenshot with quality passes it through", async () => {
    const frame = createMockFrame(sessionId);
    const page = createMockPage();
    const mockBody = { screenshot: vi.fn().mockResolvedValue(Buffer.from("")) };
    (frame.$ as ReturnType<typeof vi.fn>).mockResolvedValue(mockBody);

    const handle = createWidgetFrameHandle(frame, sessionId, page);
    await handle.screenshot({ type: "jpeg", quality: 80 });

    expect(mockBody.screenshot).toHaveBeenCalledWith({ type: "jpeg", quality: 80 });
  });

  it("screenshot throws when body not found", async () => {
    const frame = createMockFrame(sessionId);
    const page = createMockPage();
    (frame.$ as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const handle = createWidgetFrameHandle(frame, sessionId, page);
    await expect(handle.screenshot()).rejects.toThrow("frame body not found");
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
    // Should resolve without error and not close the page
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

  it("postMessage uses frame.evaluate with window.postMessage (MIG-POSTMSG)", async () => {
    const frame = createMockFrame(sessionId);
    const page = createMockPage();

    const handle = createWidgetFrameHandle(frame, sessionId, page);
    const data = { type: "test", payload: 42 };
    await handle.postMessage(data);

    expect(frame.evaluate).toHaveBeenCalledWith(expect.any(Function), data);
  });
});
