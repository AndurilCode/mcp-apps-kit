/**
 * Unit tests for React hooks
 *
 * Tests useAppsClient, useToolResult, useHostContext, useWidgetState, and utility hooks.
 */

import { describe, it, expect, vi } from "vitest";
import { act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  AppsProvider,
  useAppsClient,
  useToolResult,
  useToolInput,
  useHostContext,
  useWidgetState,
  useDisplayMode,
  useSafeAreaInsets,
  useOnToolCancelled,
  useOnTeardown,
} from "../../src";
import type { AppsClient, ToolDefs } from "@mcp-apps-kit/ui";
import { MockAdapter, createAppsClient } from "@mcp-apps-kit/ui";

// Create a mock client for testing
async function createMockClient(): Promise<{ client: AppsClient<ToolDefs>; adapter: MockAdapter }> {
  const adapter = new MockAdapter();
  await adapter.connect();
  const client = createAppsClient(adapter);
  return { client, adapter };
}

// Wrapper component for testing hooks
function createWrapper(client: AppsClient<ToolDefs>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <AppsProvider client={client}>{children}</AppsProvider>;
  };
}

describe("useAppsClient", () => {
  it("should return the client from context", async () => {
    const { client } = await createMockClient();

    const { result } = renderHook(() => useAppsClient(), {
      wrapper: createWrapper(client),
    });

    expect(result.current).toBe(client);
  });

  it("should throw when client is not available", () => {
    expect(() => {
      renderHook(() => useAppsClient());
    }).toThrow("useAppsContext must be used within an AppsProvider");
  });
});

describe("useToolResult", () => {
  it("should return undefined initially", async () => {
    const { client } = await createMockClient();

    const { result } = renderHook(() => useToolResult(), {
      wrapper: createWrapper(client),
    });

    expect(result.current).toBeUndefined();
  });

  it("should update when tool result is emitted", async () => {
    const { client, adapter } = await createMockClient();

    const { result } = renderHook(() => useToolResult(), {
      wrapper: createWrapper(client),
    });

    expect(result.current).toBeUndefined();

    // Emit a tool result
    act(() => {
      adapter.emitToolResult({ myTool: { success: true } });
    });

    expect(result.current).toEqual({ myTool: { success: true } });
  });
});

describe("useToolInput", () => {
  it("should return current tool input", async () => {
    const { client, adapter } = await createMockClient();

    // Set initial input on the adapter
    adapter.setToolInput({ arg: "value" });

    const { result } = renderHook(() => useToolInput(), {
      wrapper: createWrapper(client),
    });

    // The hook reads from client.toolInput initially
    expect(result.current).toEqual({ arg: "value" });
  });

  it("should update when tool input changes", async () => {
    const { client, adapter } = await createMockClient();

    const { result } = renderHook(() => useToolInput(), {
      wrapper: createWrapper(client),
    });

    // Emit new input
    act(() => {
      adapter.emitToolInput({ newArg: "newValue" });
    });

    expect(result.current).toEqual({ newArg: "newValue" });
  });
});

describe("useHostContext", () => {
  it("should return default context", async () => {
    const { client } = await createMockClient();

    const { result } = renderHook(() => useHostContext(), {
      wrapper: createWrapper(client),
    });

    expect(result.current).toMatchObject({
      theme: expect.stringMatching(/^(light|dark)$/),
      displayMode: expect.any(String),
      platform: expect.any(String),
    });
  });

  it("should update when host context changes", async () => {
    const { client, adapter } = await createMockClient();

    const { result } = renderHook(() => useHostContext(), {
      wrapper: createWrapper(client),
    });

    // Emit context change
    act(() => {
      adapter.emitContextChange({
        theme: "dark",
        displayMode: "fullscreen",
        availableDisplayModes: ["inline", "fullscreen"],
        viewport: { width: 1920, height: 1080 },
        locale: "en-US",
        platform: "desktop",
      });
    });

    expect(result.current.theme).toBe("dark");
    expect(result.current.displayMode).toBe("fullscreen");
  });
});

describe("useWidgetState", () => {
  it("should return default value initially", async () => {
    const { client } = await createMockClient();

    const { result } = renderHook(() => useWidgetState(0), {
      wrapper: createWrapper(client),
    });

    expect(result.current[0]).toBe(0);
  });

  it("should update state with new value", async () => {
    const { client } = await createMockClient();

    const { result } = renderHook(() => useWidgetState(0), {
      wrapper: createWrapper(client),
    });

    act(() => {
      result.current[1](5);
    });

    expect(result.current[0]).toBe(5);
  });

  it("should update state with function updater", async () => {
    const { client } = await createMockClient();

    const { result } = renderHook(() => useWidgetState(10), {
      wrapper: createWrapper(client),
    });

    act(() => {
      result.current[1]((prev) => prev + 5);
    });

    expect(result.current[0]).toBe(15);
  });

  it("should persist state to client", async () => {
    const { client, adapter } = await createMockClient();
    const setStateSpy = vi.spyOn(adapter, "setState");

    const { result } = renderHook(() => useWidgetState({ count: 0 }), {
      wrapper: createWrapper(client),
    });

    act(() => {
      result.current[1]({ count: 42 });
    });

    expect(setStateSpy).toHaveBeenCalledWith({ count: 42 });
  });
});

describe("useDisplayMode", () => {
  it("should return current display mode and available modes", async () => {
    const { client } = await createMockClient();

    const { result } = renderHook(() => useDisplayMode(), {
      wrapper: createWrapper(client),
    });

    expect(result.current.mode).toBeDefined();
    expect(Array.isArray(result.current.availableModes)).toBe(true);
    expect(typeof result.current.requestMode).toBe("function");
  });

  it("should request new display mode", async () => {
    const { client, adapter } = await createMockClient();
    const requestSpy = vi.spyOn(adapter, "requestDisplayMode");

    const { result } = renderHook(() => useDisplayMode(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.requestMode("fullscreen");
    });

    expect(requestSpy).toHaveBeenCalledWith("fullscreen");
  });
});

describe("useSafeAreaInsets", () => {
  it("should return default insets when none provided", async () => {
    const { client } = await createMockClient();

    const { result } = renderHook(() => useSafeAreaInsets(), {
      wrapper: createWrapper(client),
    });

    expect(result.current).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });
});

describe("useOnToolCancelled", () => {
  it("should call handler when tool is cancelled", async () => {
    const { client, adapter } = await createMockClient();
    const handler = vi.fn();

    renderHook(() => useOnToolCancelled(handler), {
      wrapper: createWrapper(client),
    });

    act(() => {
      adapter.emitToolCancelled("user cancelled");
    });

    expect(handler).toHaveBeenCalledWith("user cancelled");
  });

  it("should unsubscribe on unmount", async () => {
    const { client, adapter } = await createMockClient();
    const handler = vi.fn();

    const { unmount } = renderHook(() => useOnToolCancelled(handler), {
      wrapper: createWrapper(client),
    });

    unmount();

    act(() => {
      adapter.emitToolCancelled("after unmount");
    });

    expect(handler).not.toHaveBeenCalled();
  });
});

describe("useOnTeardown", () => {
  it("should call handler when teardown occurs", async () => {
    const { client, adapter } = await createMockClient();
    const handler = vi.fn();

    renderHook(() => useOnTeardown(handler), {
      wrapper: createWrapper(client),
    });

    act(() => {
      adapter.emitTeardown("session ended");
    });

    expect(handler).toHaveBeenCalledWith("session ended");
  });
});

describe("useOnToolInputPartial", () => {
  it("should call handler when partial input is received", async () => {
    const { client, adapter } = await createMockClient();
    const handler = vi.fn();

    const { useOnToolInputPartial } = await import("../../src");

    renderHook(() => useOnToolInputPartial(handler), {
      wrapper: createWrapper(client),
    });

    act(() => {
      adapter.emitToolInputPartial({ partial: "data" });
    });

    expect(handler).toHaveBeenCalledWith({ partial: "data" });
  });
});

describe("useHostCapabilities", () => {
  it("should return host capabilities", async () => {
    const { client } = await createMockClient();
    const { useHostCapabilities } = await import("../../src");

    const { result } = renderHook(() => useHostCapabilities(), {
      wrapper: createWrapper(client),
    });

    expect(result.current).toBeDefined();
    expect(result.current?.logging).toBeDefined();
  });
});

describe("useHostVersion", () => {
  it("should return host version", async () => {
    const { client } = await createMockClient();
    const { useHostVersion } = await import("../../src");

    const { result } = renderHook(() => useHostVersion(), {
      wrapper: createWrapper(client),
    });

    expect(result.current).toBeDefined();
    expect(result.current?.name).toBe("MockHost");
    expect(result.current?.version).toBe("1.0.0");
  });
});

describe("useFileUpload", () => {
  it("should return upload state", async () => {
    const { client } = await createMockClient();
    const { useFileUpload } = await import("../../src");

    const { result } = renderHook(() => useFileUpload(), {
      wrapper: createWrapper(client),
    });

    expect(result.current.isUploading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.fileId).toBeNull();
    expect(typeof result.current.upload).toBe("function");
  });

  it("should handle upload when not supported", async () => {
    const { client } = await createMockClient();
    const { useFileUpload } = await import("../../src");

    const { result } = renderHook(() => useFileUpload(), {
      wrapper: createWrapper(client),
    });

    const file = new File(["test"], "test.txt", { type: "text/plain" });
    let uploadResult: unknown;

    await act(async () => {
      uploadResult = await result.current.upload(file);
    });

    expect(uploadResult).toBeNull();
    expect(result.current.error).toBeDefined();
  });
});

describe("useFileDownload", () => {
  it("should return download state", async () => {
    const { client } = await createMockClient();
    const { useFileDownload } = await import("../../src");

    const { result } = renderHook(() => useFileDownload(), {
      wrapper: createWrapper(client),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.downloadUrl).toBeNull();
    expect(typeof result.current.getDownloadUrl).toBe("function");
  });

  it("should handle getDownloadUrl when not supported", async () => {
    const { client } = await createMockClient();
    const { useFileDownload } = await import("../../src");

    const { result } = renderHook(() => useFileDownload(), {
      wrapper: createWrapper(client),
    });

    let downloadResult: unknown;

    await act(async () => {
      downloadResult = await result.current.getDownloadUrl("file-id");
    });

    expect(downloadResult).toBeNull();
    expect(result.current.error).toBeDefined();
  });
});

describe("useModal", () => {
  it("should return modal state", async () => {
    const { client } = await createMockClient();
    const { useModal } = await import("../../src");

    const { result } = renderHook(() => useModal(), {
      wrapper: createWrapper(client),
    });

    expect(result.current.isOpen).toBe(false);
    expect(typeof result.current.showModal).toBe("function");
  });

  it("should return null when modal not supported", async () => {
    const { client } = await createMockClient();
    const { useModal } = await import("../../src");

    const { result } = renderHook(() => useModal(), {
      wrapper: createWrapper(client),
    });

    let modalResult: unknown;

    await act(async () => {
      modalResult = await result.current.showModal({
        title: "Test",
        body: "Test body",
        buttons: [],
      });
    });

    expect(modalResult).toBeNull();
  });
});

describe("useView", () => {
  it("should return view from host context", async () => {
    const { client, adapter } = await createMockClient();
    const { useView } = await import("../../src");

    adapter.setHostContext({ view: "settings" });

    const { result } = renderHook(() => useView(), {
      wrapper: createWrapper(client),
    });

    expect(result.current).toBe("settings");
  });
});

describe("useIntrinsicHeight", () => {
  it("should return intrinsic height state", async () => {
    const { client } = await createMockClient();
    const { useIntrinsicHeight } = await import("../../src");

    const { result } = renderHook(() => useIntrinsicHeight(), {
      wrapper: createWrapper(client),
    });

    expect(result.current.containerRef).toBeDefined();
    expect(typeof result.current.notify).toBe("function");
  });
});

describe("useDebugLogger", () => {
  it("should return debug logger", async () => {
    const { client } = await createMockClient();
    const { useDebugLogger } = await import("../../src");

    const { result } = renderHook(() => useDebugLogger(), {
      wrapper: createWrapper(client),
    });

    expect(result.current).toBeDefined();
    expect(typeof result.current.info).toBe("function");
    expect(typeof result.current.error).toBe("function");
  });

  it("should accept configuration", async () => {
    const { client } = await createMockClient();
    const { useDebugLogger } = await import("../../src");

    const { result } = renderHook(() => useDebugLogger({ enabled: true, level: "debug" }), {
      wrapper: createWrapper(client),
    });

    expect(result.current).toBeDefined();
  });
});
