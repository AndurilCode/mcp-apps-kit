/**
 * Tests for executePrimitive utility and per-kind mapper functions.
 *
 * Covers:
 * - mapToolResponse: happy path (content blocks), error case (isError flag)
 * - mapResourceResponse: happy path (contents array), error case (empty)
 * - mapPromptResponse: happy path (messages), error case
 * - executePrimitive: successful tool execution, network error handling, timeout error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mapToolResponse,
  mapResourceResponse,
  mapPromptResponse,
  executePrimitive,
} from "../src/dashboard/react/utils/executePrimitive";
import type { Primitive } from "../src/dashboard/react/components/PrimitiveDetail";

// =============================================================================
// mapToolResponse
// =============================================================================

describe("mapToolResponse", () => {
  it("maps a successful tool response with content blocks", () => {
    const data = {
      content: [
        { type: "text", text: "Hello, world!" },
        { type: "image", data: "base64data", mimeType: "image/png" },
      ],
      isError: false,
      structuredContent: { foo: "bar" },
      _meta: { requestId: "req-123", duration_ms: 100 },
    };

    const result = mapToolResponse(data);

    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.content).toHaveLength(2);
    expect(result.content?.[0]).toEqual({
      type: "text",
      text: "Hello, world!",
      data: undefined,
      mimeType: undefined,
    });
    expect(result.content?.[1]).toEqual({
      type: "image",
      text: undefined,
      data: "base64data",
      mimeType: "image/png",
    });
    expect(result.structuredContent).toEqual({ foo: "bar" });
    expect(result._meta?.requestId).toBe("req-123");
  });

  it("maps an error tool response with isError flag", () => {
    const data = {
      content: [{ type: "text", text: "Something went wrong" }],
      isError: true,
    };

    const result = mapToolResponse(data);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Something went wrong");
    expect(result.content).toHaveLength(1);
  });

  it("handles isError with no text content", () => {
    const data = {
      content: [{ type: "image", data: "binary" }],
      isError: true,
    };

    const result = mapToolResponse(data);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Tool execution returned an error");
  });

  it("handles null/undefined data gracefully", () => {
    const result = mapToolResponse(null);
    expect(result.ok).toBe(true);
    expect(result.content).toEqual([]);
  });

  it("handles non-object data gracefully", () => {
    const result = mapToolResponse("string data");
    expect(result.ok).toBe(true);
    expect(result.content).toEqual([]);
  });

  it("handles empty content array", () => {
    const result = mapToolResponse({ content: [] });
    expect(result.ok).toBe(true);
    expect(result.content).toEqual([]);
  });
});

// =============================================================================
// mapResourceResponse
// =============================================================================

describe("mapResourceResponse", () => {
  it("maps a successful resource response with contents", () => {
    const data = {
      contents: [
        { uri: "file:///README.md", mimeType: "text/markdown", text: "# Hello" },
        { uri: "file:///data.bin", mimeType: "application/octet-stream", blob: "base64blob" },
      ],
      _meta: { cached: true },
    };

    const result = mapResourceResponse(data);

    expect(result.ok).toBe(true);
    expect(result.contents).toHaveLength(2);
    expect(result.contents?.[0]).toEqual({
      uri: "file:///README.md",
      mimeType: "text/markdown",
      text: "# Hello",
      blob: undefined,
    });
    expect(result.contents?.[1]).toEqual({
      uri: "file:///data.bin",
      mimeType: "application/octet-stream",
      text: undefined,
      blob: "base64blob",
    });
    expect(result._meta?.cached).toBe(true);
  });

  it("handles empty contents array", () => {
    const result = mapResourceResponse({ contents: [] });
    expect(result.ok).toBe(true);
    expect(result.contents).toEqual([]);
  });

  it("handles missing contents", () => {
    const result = mapResourceResponse({});
    expect(result.ok).toBe(true);
    expect(result.contents).toEqual([]);
  });

  it("handles null data gracefully", () => {
    const result = mapResourceResponse(null);
    expect(result.ok).toBe(true);
    expect(result.contents).toEqual([]);
  });
});

// =============================================================================
// mapPromptResponse
// =============================================================================

describe("mapPromptResponse", () => {
  it("maps a successful prompt response with messages", () => {
    const data = {
      messages: [
        { role: "user", content: "Summarize this page" },
        { role: "assistant", content: "Here is the summary." },
      ],
      _meta: { serverName: "test-server" },
    };

    const result = mapPromptResponse(data, "summarize-page");

    expect(result.ok).toBe(true);
    expect(result.messages).toHaveLength(2);
    expect(result.messages?.[0]).toEqual({ role: "user", content: "Summarize this page" });
    expect(result.messages?.[1]).toEqual({ role: "assistant", content: "Here is the summary." });
    expect(result._meta?.promptName).toBe("summarize-page");
    expect(result._meta?.serverName).toBe("test-server");
  });

  it("maps messages with content block arrays", () => {
    const data = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Hello" },
            { type: "image", data: "img_data", mimeType: "image/png" },
          ],
        },
      ],
    };

    const result = mapPromptResponse(data, "test-prompt");

    expect(result.ok).toBe(true);
    expect(result.messages).toHaveLength(1);
    const msg = result.messages?.[0];
    expect(Array.isArray(msg?.content)).toBe(true);
    if (Array.isArray(msg?.content)) {
      expect(msg.content).toHaveLength(2);
      expect(msg.content[0]?.type).toBe("text");
      expect(msg.content[0]?.text).toBe("Hello");
    }
  });

  it("handles empty messages array", () => {
    const result = mapPromptResponse({ messages: [] }, "empty-prompt");
    expect(result.ok).toBe(true);
    expect(result.messages).toEqual([]);
    expect(result._meta?.promptName).toBe("empty-prompt");
  });

  it("handles null data gracefully", () => {
    const result = mapPromptResponse(null, "test");
    expect(result.ok).toBe(true);
    expect(result.messages).toEqual([]);
    expect(result._meta?.promptName).toBe("test");
  });

  it("defaults unknown roles to user", () => {
    const data = {
      messages: [{ role: "system", content: "You are a helper" }],
    };
    const result = mapPromptResponse(data, "test");
    expect(result.messages?.[0]?.role).toBe("user");
  });
});

// =============================================================================
// executePrimitive
// =============================================================================

describe("executePrimitive", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const toolPrimitive: Primitive = {
    kind: "tool",
    name: "test-tool",
    description: "A test tool",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
      },
    },
  };

  const resourcePrimitive: Primitive = {
    kind: "resource",
    name: "test-resource",
    uri: "file:///test.md",
    description: "A test resource",
  };

  const promptPrimitive: Primitive = {
    kind: "prompt",
    name: "test-prompt",
    description: "A test prompt",
  };

  it("successfully executes a tool and maps the response", async () => {
    const mockResponse = {
      ok: true,
      kind: "tool",
      data: {
        content: [{ type: "text", text: "Tool result" }],
        isError: false,
      },
      duration_ms: 150,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await executePrimitive("conn-1", toolPrimitive, { query: "hello" });

    expect(result.ok).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content?.[0]?.text).toBe("Tool result");
    expect(result._meta?.duration_ms).toBe(150);

    // Verify fetch was called correctly
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/execute-primitive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionId: "conn-1",
        kind: "tool",
        name: "test-tool",
        params: { query: "hello" },
      }),
    });
  });

  it("successfully executes a resource and maps the response", async () => {
    const mockResponse = {
      ok: true,
      kind: "resource",
      data: {
        contents: [{ uri: "file:///test.md", mimeType: "text/markdown", text: "# Hello" }],
      },
      duration_ms: 50,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await executePrimitive("conn-1", resourcePrimitive, {
      uri: "file:///test.md",
    });

    expect(result.ok).toBe(true);
    expect(result.contents).toHaveLength(1);
    expect(result.contents?.[0]?.uri).toBe("file:///test.md");
    expect(result._meta?.duration_ms).toBe(50);
  });

  it("successfully executes a prompt and maps the response", async () => {
    const mockResponse = {
      ok: true,
      kind: "prompt",
      data: {
        messages: [{ role: "user", content: "Summarize this" }],
      },
      duration_ms: 30,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await executePrimitive("conn-1", promptPrimitive, {});

    expect(result.ok).toBe(true);
    expect(result.messages).toHaveLength(1);
    expect(result._meta?.promptName).toBe("test-prompt");
    expect(result._meta?.duration_ms).toBe(30);
  });

  it("handles network errors gracefully", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Failed to fetch"));

    const result = await executePrimitive("conn-1", toolPrimitive, {});

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Network error: Failed to fetch");
  });

  it("handles non-200 response with error message from backend", async () => {
    const mockResponse = {
      ok: false,
      kind: "tool",
      data: null,
      error: "Execution timed out after 30000ms",
      duration_ms: 30000,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await executePrimitive("conn-1", toolPrimitive, {});

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Execution timed out after 30000ms");
    expect(result._meta?.duration_ms).toBe(30000);
  });

  it("handles invalid JSON response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError("Unexpected end of JSON")),
    });

    const result = await executePrimitive("conn-1", toolPrimitive, {});

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid response");
  });

  it("handles backend ok:false with 200 status (execution error)", async () => {
    const mockResponse = {
      ok: false,
      kind: "tool",
      data: null,
      error: "Tool not found: unknown-tool",
      duration_ms: 5,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await executePrimitive("conn-1", toolPrimitive, {});

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Tool not found: unknown-tool");
  });
});
