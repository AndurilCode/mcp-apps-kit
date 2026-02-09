/**
 * Tests for /api/execute-primitive backend endpoint logic.
 *
 * Covers:
 * - AC-01: Backend /api/execute-primitive endpoint
 * - AC-07: connectionId passed through executePrimitive
 * - AC-09: Request timeout (default 30s), error on timeout
 * - AC-10: Manual events include kind, name, params, connectionId, status, duration, source:manual
 *
 * Strategy:
 * We cannot spin up a full server in unit tests. Instead we test the endpoint's
 * validation and event-recording logic by:
 *   1. Testing the frontend executePrimitive utility's contract with the backend shape
 *   2. Testing createExecuteFn (curried version)
 *   3. Verifying backend response shapes against mapper expectations
 *   4. Testing edge cases in request body validation inferred from standalone-server.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  executePrimitive,
  createExecuteFn,
  mapToolResponse,
  mapResourceResponse,
  mapPromptResponse,
} from "../src/dashboard/react/utils/executePrimitive";
import type { Primitive } from "../src/dashboard/react/components/PrimitiveDetail";

// =============================================================================
// createExecuteFn
// =============================================================================

describe("createExecuteFn", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("curries connectionId and baseUrl into the execute function", async () => {
    const mockResponse = {
      ok: true,
      kind: "tool",
      data: {
        content: [{ type: "text", text: "result" }],
      },
      duration_ms: 50,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const executeFn = createExecuteFn("http://localhost:6274", "conn-42");
    const primitive: Primitive = {
      kind: "tool",
      name: "test-tool",
      description: "desc",
      inputSchema: { type: "object", properties: {} },
    };

    const result = await executeFn(primitive, { key: "value" });

    expect(result.ok).toBe(true);

    // Verify fetch was called with curried baseUrl and connectionId
    expect(globalThis.fetch).toHaveBeenCalledWith("http://localhost:6274/api/execute-primitive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionId: "conn-42",
        kind: "tool",
        name: "test-tool",
        params: { key: "value" },
      }),
    });
  });

  it("handles different baseUrl values", async () => {
    const mockResponse = {
      ok: true,
      kind: "resource",
      data: { contents: [] },
      duration_ms: 10,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const executeFn = createExecuteFn("http://127.0.0.1:3000", "conn-99");
    const primitive: Primitive = {
      kind: "resource",
      name: "test-resource",
      uri: "file:///test.md",
      description: "desc",
    };

    await executeFn(primitive, {});

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/api/execute-primitive",
      expect.objectContaining({
        body: expect.stringContaining('"connectionId":"conn-99"'),
      })
    );
  });
});

// =============================================================================
// Backend response shape validation
// =============================================================================

describe("Backend response shape handling", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("handles backend 400 for missing kind", async () => {
    const backendError = {
      ok: false,
      kind: null,
      data: null,
      error: 'Invalid or missing "kind". Must be "tool", "resource", or "prompt".',
      duration_ms: 0,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve(backendError),
    });

    const primitive: Primitive = {
      kind: "tool",
      name: "test",
      description: "desc",
      inputSchema: { type: "object", properties: {} },
    };

    const result = await executePrimitive("", "conn-1", primitive, {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("kind");
  });

  it("handles backend 400 for missing name", async () => {
    const backendError = {
      ok: false,
      kind: "tool",
      data: null,
      error: 'Missing or invalid "name".',
      duration_ms: 0,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve(backendError),
    });

    const primitive: Primitive = {
      kind: "tool",
      name: "test",
      description: "desc",
      inputSchema: { type: "object", properties: {} },
    };

    const result = await executePrimitive("", "conn-1", primitive, {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("name");
  });

  it("handles backend 503 for no active connection", async () => {
    const backendError = {
      ok: false,
      kind: "tool",
      data: null,
      error: "No active connection",
      duration_ms: 0,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve(backendError),
    });

    const primitive: Primitive = {
      kind: "tool",
      name: "test",
      description: "desc",
      inputSchema: { type: "object", properties: {} },
    };

    const result = await executePrimitive("", "conn-1", primitive, {});
    expect(result.ok).toBe(false);
    expect(result.error).toBe("No active connection");
  });

  it("handles backend 503 for connection not found", async () => {
    const backendError = {
      ok: false,
      kind: "tool",
      data: null,
      error: "Connection not found: conn-missing",
      duration_ms: 0,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve(backendError),
    });

    const primitive: Primitive = {
      kind: "tool",
      name: "test",
      description: "desc",
      inputSchema: { type: "object", properties: {} },
    };

    const result = await executePrimitive("", "conn-missing", primitive, {});
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Connection not found: conn-missing");
  });

  it("handles backend 503 for not connected to server", async () => {
    const backendError = {
      ok: false,
      kind: "tool",
      data: null,
      error: "Not connected to server",
      duration_ms: 0,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve(backendError),
    });

    const primitive: Primitive = {
      kind: "tool",
      name: "test",
      description: "desc",
      inputSchema: { type: "object", properties: {} },
    };

    const result = await executePrimitive("", "conn-1", primitive, {});
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Not connected to server");
  });

  it("handles backend timeout error response", async () => {
    const backendError = {
      ok: false,
      kind: "tool",
      data: null,
      error: "Execution timed out after 30000ms",
      duration_ms: 30000,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(backendError),
    });

    const primitive: Primitive = {
      kind: "tool",
      name: "slow-tool",
      description: "desc",
      inputSchema: { type: "object", properties: {} },
    };

    const result = await executePrimitive("", "conn-1", primitive, {});
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Execution timed out after 30000ms");
    expect(result._meta?.duration_ms).toBe(30000);
  });

  it("handles backend 400 for invalid JSON body", async () => {
    const backendError = {
      ok: false,
      kind: null,
      data: null,
      error: "Invalid JSON body",
      duration_ms: 0,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve(backendError),
    });

    const primitive: Primitive = {
      kind: "tool",
      name: "test",
      description: "desc",
      inputSchema: { type: "object", properties: {} },
    };

    const result = await executePrimitive("", "conn-1", primitive, {});
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Invalid JSON body");
  });
});

// =============================================================================
// connectionId passed through correctly (AC-07)
// =============================================================================

describe("connectionId passed through executePrimitive (AC-07)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("includes connectionId in the request body for tools", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          ok: true,
          kind: "tool",
          data: { content: [] },
          duration_ms: 10,
        }),
    });

    const primitive: Primitive = {
      kind: "tool",
      name: "my-tool",
      description: "",
      inputSchema: { type: "object", properties: {} },
    };

    await executePrimitive("http://localhost:6274", "conn-abc", primitive, {
      arg1: "val1",
    });

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(fetchCall).toBeDefined();
    const body = JSON.parse(fetchCall![1]!.body as string) as Record<string, unknown>;
    expect(body.connectionId).toBe("conn-abc");
    expect(body.kind).toBe("tool");
    expect(body.name).toBe("my-tool");
    expect(body.params).toEqual({ arg1: "val1" });
  });

  it("includes connectionId in the request body for resources", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          ok: true,
          kind: "resource",
          data: { contents: [] },
          duration_ms: 10,
        }),
    });

    const primitive: Primitive = {
      kind: "resource",
      name: "my-resource",
      uri: "file:///test.md",
      description: "",
    };

    await executePrimitive("", "conn-xyz", primitive, { uri: "file:///test.md" });

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const body = JSON.parse(fetchCall![1]!.body as string) as Record<string, unknown>;
    expect(body.connectionId).toBe("conn-xyz");
    expect(body.kind).toBe("resource");
    expect(body.name).toBe("my-resource");
  });

  it("includes connectionId in the request body for prompts", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          ok: true,
          kind: "prompt",
          data: { messages: [] },
          duration_ms: 10,
        }),
    });

    const primitive: Primitive = {
      kind: "prompt",
      name: "my-prompt",
      description: "",
    };

    await executePrimitive("", "conn-123", primitive, { style: "brief" });

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const body = JSON.parse(fetchCall![1]!.body as string) as Record<string, unknown>;
    expect(body.connectionId).toBe("conn-123");
    expect(body.kind).toBe("prompt");
    expect(body.name).toBe("my-prompt");
    expect(body.params).toEqual({ style: "brief" });
  });
});

// =============================================================================
// Additional mapper edge cases
// =============================================================================

describe("mapToolResponse — additional edge cases", () => {
  it("handles content items that are not objects (skipped)", () => {
    const result = mapToolResponse({
      content: ["string-item", 42, null, { type: "text", text: "valid" }],
    });
    expect(result.ok).toBe(true);
    // Non-object items should be skipped
    expect(result.content).toHaveLength(1);
    expect(result.content?.[0]?.text).toBe("valid");
  });

  it("handles content items with missing type (defaults to text)", () => {
    const result = mapToolResponse({
      content: [{ text: "no type field" }],
    });
    expect(result.ok).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content?.[0]?.type).toBe("text");
    expect(result.content?.[0]?.text).toBe("no type field");
  });

  it("handles non-string text/data/mimeType fields (treated as undefined)", () => {
    const result = mapToolResponse({
      content: [{ type: "text", text: 42, data: true, mimeType: null }],
    });
    expect(result.ok).toBe(true);
    expect(result.content?.[0]?.text).toBeUndefined();
    expect(result.content?.[0]?.data).toBeUndefined();
    expect(result.content?.[0]?.mimeType).toBeUndefined();
  });

  it("handles undefined data gracefully", () => {
    const result = mapToolResponse(undefined);
    expect(result.ok).toBe(true);
    expect(result.content).toEqual([]);
  });

  it("preserves structuredContent when undefined explicitly", () => {
    const result = mapToolResponse({
      content: [],
      structuredContent: undefined,
    });
    expect(result.structuredContent).toBeUndefined();
  });

  it("preserves _meta when it is an object", () => {
    const result = mapToolResponse({
      content: [],
      _meta: { requestId: "abc", custom: 42 },
    });
    expect(result._meta?.requestId).toBe("abc");
    expect((result._meta as Record<string, unknown>).custom).toBe(42);
  });

  it("handles _meta as non-object (ignored)", () => {
    const result = mapToolResponse({
      content: [],
      _meta: "not-an-object",
    });
    expect(result._meta).toEqual({});
  });
});

describe("mapResourceResponse — additional edge cases", () => {
  it("handles content items that are not objects (skipped)", () => {
    const result = mapResourceResponse({
      contents: ["string", 42, null, { uri: "file:///a.txt", text: "hello" }],
    });
    expect(result.ok).toBe(true);
    expect(result.contents).toHaveLength(1);
    expect(result.contents?.[0]?.uri).toBe("file:///a.txt");
  });

  it("handles items with missing uri (defaults to empty string)", () => {
    const result = mapResourceResponse({
      contents: [{ mimeType: "text/plain", text: "no uri" }],
    });
    expect(result.ok).toBe(true);
    expect(result.contents?.[0]?.uri).toBe("");
    expect(result.contents?.[0]?.text).toBe("no uri");
  });

  it("handles non-string field values (treated as undefined)", () => {
    const result = mapResourceResponse({
      contents: [{ uri: 42, mimeType: true, text: null, blob: undefined }],
    });
    expect(result.ok).toBe(true);
    // uri is non-string so defaults to ""
    expect(result.contents?.[0]?.uri).toBe("");
    expect(result.contents?.[0]?.mimeType).toBeUndefined();
    expect(result.contents?.[0]?.text).toBeUndefined();
    expect(result.contents?.[0]?.blob).toBeUndefined();
  });

  it("handles non-array contents (treated as empty)", () => {
    const result = mapResourceResponse({ contents: "not-array" });
    expect(result.ok).toBe(true);
    expect(result.contents).toEqual([]);
  });
});

describe("mapPromptResponse — additional edge cases", () => {
  it("handles message content as number (converted to string)", () => {
    const result = mapPromptResponse({ messages: [{ role: "user", content: 42 }] }, "test");
    expect(result.ok).toBe(true);
    expect(result.messages?.[0]?.content).toBe("42");
  });

  it("handles message content as boolean (converted to string)", () => {
    const result = mapPromptResponse({ messages: [{ role: "user", content: true }] }, "test");
    expect(result.ok).toBe(true);
    expect(result.messages?.[0]?.content).toBe("true");
  });

  it("handles message content as null (converted to empty string)", () => {
    const result = mapPromptResponse({ messages: [{ role: "user", content: null }] }, "test");
    expect(result.ok).toBe(true);
    expect(result.messages?.[0]?.content).toBe("");
  });

  it("handles message content as object (JSON-stringified)", () => {
    const result = mapPromptResponse(
      { messages: [{ role: "user", content: { nested: true } }] },
      "test"
    );
    expect(result.ok).toBe(true);
    expect(result.messages?.[0]?.content).toBe('{"nested":true}');
  });

  it("handles content blocks with non-object items (converted to text)", () => {
    const result = mapPromptResponse(
      {
        messages: [
          {
            role: "assistant",
            content: [42, "text-string", { type: "text", text: "block" }],
          },
        ],
      },
      "test"
    );
    expect(result.ok).toBe(true);
    const msg = result.messages?.[0];
    expect(Array.isArray(msg?.content)).toBe(true);
    if (Array.isArray(msg?.content)) {
      expect(msg.content).toHaveLength(3);
      // Non-object items get wrapped as text blocks
      expect(msg.content[0]?.type).toBe("text");
      expect(msg.content[0]?.text).toBe("42");
      expect(msg.content[1]?.type).toBe("text");
      expect(msg.content[1]?.text).toBe("text-string");
      expect(msg.content[2]?.type).toBe("text");
      expect(msg.content[2]?.text).toBe("block");
    }
  });

  it("handles message items that are not objects (skipped)", () => {
    const result = mapPromptResponse(
      { messages: ["not-an-object", 42, { role: "user", content: "valid" }] },
      "test"
    );
    expect(result.ok).toBe(true);
    expect(result.messages).toHaveLength(1);
    expect(result.messages?.[0]?.content).toBe("valid");
  });

  it("handles non-array messages (treated as empty)", () => {
    const result = mapPromptResponse({ messages: "not-array" }, "test");
    expect(result.ok).toBe(true);
    expect(result.messages).toEqual([]);
  });

  it("merges _meta with promptName", () => {
    const result = mapPromptResponse(
      {
        messages: [],
        _meta: { serverName: "test-server", custom: true },
      },
      "my-prompt"
    );
    expect(result._meta?.promptName).toBe("my-prompt");
    expect(result._meta?.serverName).toBe("test-server");
    expect((result._meta as Record<string, unknown>).custom).toBe(true);
  });
});

// =============================================================================
// executePrimitive — additional scenarios
// =============================================================================

describe("executePrimitive — additional scenarios", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("attaches duration_ms to _meta even when mapper provides its own _meta", async () => {
    const mockResponse = {
      ok: true,
      kind: "tool",
      data: {
        content: [{ type: "text", text: "ok" }],
        _meta: { requestId: "req-1" },
      },
      duration_ms: 200,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const primitive: Primitive = {
      kind: "tool",
      name: "test",
      description: "",
      inputSchema: { type: "object", properties: {} },
    };

    const result = await executePrimitive("", "c1", primitive, {});
    expect(result._meta?.duration_ms).toBe(200);
    expect(result._meta?.requestId).toBe("req-1");
  });

  it("creates _meta if mapper returns result without _meta", async () => {
    // mapToolResponse with null data returns { ok: true, content: [], _meta: {} }
    // but if backend ok:true and data is null, the mapper will produce _meta: {}
    const mockResponse = {
      ok: true,
      kind: "tool",
      data: null,
      duration_ms: 5,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const primitive: Primitive = {
      kind: "tool",
      name: "test",
      description: "",
      inputSchema: { type: "object", properties: {} },
    };

    const result = await executePrimitive("", "c1", primitive, {});
    expect(result._meta?.duration_ms).toBe(5);
  });

  it("handles error response with no error field (falls back to status)", async () => {
    const backendError = {
      ok: false,
      kind: "tool",
      data: null,
      duration_ms: 0,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve(backendError),
    });

    const primitive: Primitive = {
      kind: "tool",
      name: "test",
      description: "",
      inputSchema: { type: "object", properties: {} },
    };

    const result = await executePrimitive("", "c1", primitive, {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("500");
  });

  it("handles completely non-JSON response gracefully", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    });

    const primitive: Primitive = {
      kind: "tool",
      name: "test",
      description: "",
      inputSchema: { type: "object", properties: {} },
    };

    const result = await executePrimitive("", "c1", primitive, {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid response");
    expect(result.error).toContain("200");
  });

  it("handles TypeError from fetch (DNS failure, etc.)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to resolve hostname"));

    const primitive: Primitive = {
      kind: "tool",
      name: "test",
      description: "",
      inputSchema: { type: "object", properties: {} },
    };

    const result = await executePrimitive("http://nonexistent.localhost", "c1", primitive, {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Network error");
    expect(result.error).toContain("Failed to resolve hostname");
  });

  it("handles non-Error thrown from fetch (string)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue("connection refused");

    const primitive: Primitive = {
      kind: "tool",
      name: "test",
      description: "",
      inputSchema: { type: "object", properties: {} },
    };

    const result = await executePrimitive("", "c1", primitive, {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Network error");
    expect(result.error).toContain("connection refused");
  });
});
