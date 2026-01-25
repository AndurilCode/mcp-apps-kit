/**
 * Tests for helpers.ts - shared utility functions
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractToolResult,
  findUIResourceForTool,
  fetchWidgetHTML,
  resolveProtocol,
  mapConsoleTypeToLogLevel,
  getLogSourceFromUrl,
  createEmptyLogSummary,
  calculateLogSummary,
  type MCPResourceClient,
} from "../src/tools/helpers";

describe("extractToolResult", () => {
  it("should extract structuredContent when present", () => {
    const result = extractToolResult({
      structuredContent: { foo: "bar", count: 42 },
    });
    expect(result).toEqual({ foo: "bar", count: 42 });
  });

  it("should extract and parse JSON text content when structuredContent is not present", () => {
    const result = extractToolResult({
      content: [{ type: "text", text: '{"name":"test","value":123}' }],
    });
    expect(result).toEqual({ name: "test", value: 123 });
  });

  it("should return raw text when JSON parsing fails", () => {
    const result = extractToolResult({
      content: [{ type: "text", text: "plain text content" }],
    });
    expect(result).toBe("plain text content");
  });

  it("should return undefined when no content is present", () => {
    const result = extractToolResult({});
    expect(result).toBeUndefined();
  });

  it("should return undefined when content array is empty", () => {
    const result = extractToolResult({ content: [] });
    expect(result).toBeUndefined();
  });

  it("should skip non-text content blocks", () => {
    const result = extractToolResult({
      content: [{ type: "image" }, { type: "text", text: '{"valid":"json"}' }],
    });
    expect(result).toEqual({ valid: "json" });
  });

  it("should return undefined when text content has no text property", () => {
    const result = extractToolResult({
      content: [{ type: "text" }],
    });
    expect(result).toBeUndefined();
  });
});

describe("findUIResourceForTool", () => {
  let mockClient: MCPResourceClient;

  beforeEach(() => {
    mockClient = {
      listResources: vi.fn(),
      readResource: vi.fn(),
    };
  });

  it("should find resource with __ui_ prefix pattern", async () => {
    vi.mocked(mockClient.listResources).mockResolvedValue({
      resources: [{ uri: "app://widgets/__ui_greet", mimeType: "text/html;profile=mcp-app" }],
    });

    const result = await findUIResourceForTool(mockClient, "greet");

    expect(result).toEqual({
      uri: "app://widgets/__ui_greet",
      mimeType: "text/html;profile=mcp-app",
      protocol: "mcp",
    });
  });

  it("should find resource with /toolName pattern", async () => {
    vi.mocked(mockClient.listResources).mockResolvedValue({
      resources: [{ uri: "app://widgets/greet", mimeType: "text/html+skybridge" }],
    });

    const result = await findUIResourceForTool(mockClient, "greet");

    expect(result).toEqual({
      uri: "app://widgets/greet",
      mimeType: "text/html+skybridge",
      protocol: "openai",
    });
  });

  it("should find resource with query parameter pattern", async () => {
    vi.mocked(mockClient.listResources).mockResolvedValue({
      resources: [{ uri: "app://widgets?toolName=search", mimeType: "text/html;profile=mcp-app" }],
    });

    const result = await findUIResourceForTool(mockClient, "search");

    expect(result).toEqual({
      uri: "app://widgets?toolName=search",
      mimeType: "text/html;profile=mcp-app",
      protocol: "mcp",
    });
  });

  it("should return null when no matching resource is found", async () => {
    vi.mocked(mockClient.listResources).mockResolvedValue({
      resources: [{ uri: "app://widgets/__ui_other", mimeType: "application/x-mcp-app-html+html" }],
    });

    const result = await findUIResourceForTool(mockClient, "greet");

    expect(result).toBeNull();
  });

  it("should skip resources without mimeType", async () => {
    vi.mocked(mockClient.listResources).mockResolvedValue({
      resources: [{ uri: "app://widgets/__ui_greet" }],
    });

    const result = await findUIResourceForTool(mockClient, "greet");

    expect(result).toBeNull();
  });

  it("should skip resources with unrecognized mimeType", async () => {
    vi.mocked(mockClient.listResources).mockResolvedValue({
      resources: [{ uri: "app://widgets/__ui_greet", mimeType: "text/plain" }],
    });

    const result = await findUIResourceForTool(mockClient, "greet");

    expect(result).toBeNull();
  });

  it("should return null when no resources exist", async () => {
    vi.mocked(mockClient.listResources).mockResolvedValue({
      resources: [],
    });

    const result = await findUIResourceForTool(mockClient, "greet");

    expect(result).toBeNull();
  });
});

describe("fetchWidgetHTML", () => {
  let mockClient: MCPResourceClient;

  beforeEach(() => {
    mockClient = {
      listResources: vi.fn(),
      readResource: vi.fn(),
    };
  });

  it("should fetch and concatenate text content", async () => {
    vi.mocked(mockClient.readResource).mockResolvedValue({
      contents: [{ text: "<html>" }, { text: "<body>Hello</body>" }, { text: "</html>" }],
    });

    const result = await fetchWidgetHTML(mockClient, "app://widget");

    expect(result).toBe("<html><body>Hello</body></html>");
  });

  it("should return empty string when no text content", async () => {
    vi.mocked(mockClient.readResource).mockResolvedValue({
      contents: [{ blob: "base64data" }],
    });

    const result = await fetchWidgetHTML(mockClient, "app://widget");

    expect(result).toBe("");
  });

  it("should skip non-text content blocks", async () => {
    vi.mocked(mockClient.readResource).mockResolvedValue({
      contents: [{ text: "<div>" }, { blob: "ignored" }, { text: "</div>" }],
    });

    const result = await fetchWidgetHTML(mockClient, "app://widget");

    expect(result).toBe("<div></div>");
  });
});

describe("resolveProtocol", () => {
  it("should return user protocol when specified and not auto", () => {
    expect(resolveProtocol("mcp", "openai")).toBe("openai");
    expect(resolveProtocol("openai", "mcp")).toBe("mcp");
  });

  it("should return detected protocol when user specifies auto", () => {
    expect(resolveProtocol("mcp", "auto")).toBe("mcp");
    expect(resolveProtocol("openai", "auto")).toBe("openai");
  });

  it("should return detected protocol when user protocol is undefined", () => {
    expect(resolveProtocol("mcp", undefined)).toBe("mcp");
    expect(resolveProtocol("openai", undefined)).toBe("openai");
  });
});

describe("mapConsoleTypeToLogLevel", () => {
  it("should map 'log' to 'log'", () => {
    expect(mapConsoleTypeToLogLevel("log")).toBe("log");
  });

  it("should map 'info' to 'info'", () => {
    expect(mapConsoleTypeToLogLevel("info")).toBe("info");
  });

  it("should map 'warning' to 'warn'", () => {
    expect(mapConsoleTypeToLogLevel("warning")).toBe("warn");
  });

  it("should map 'error' to 'error'", () => {
    expect(mapConsoleTypeToLogLevel("error")).toBe("error");
  });

  it("should map 'debug' to 'debug'", () => {
    expect(mapConsoleTypeToLogLevel("debug")).toBe("debug");
  });

  it("should map unknown types to 'log'", () => {
    expect(mapConsoleTypeToLogLevel("trace")).toBe("log");
    expect(mapConsoleTypeToLogLevel("verbose")).toBe("log");
    expect(mapConsoleTypeToLogLevel("")).toBe("log");
  });
});

describe("getLogSourceFromUrl", () => {
  it("should return 'widget' for widget URLs", () => {
    expect(getLogSourceFromUrl("http://localhost/widget/abc")).toBe("widget");
    expect(getLogSourceFromUrl("/widget/content")).toBe("widget");
  });

  it("should return 'host' for host URLs", () => {
    expect(getLogSourceFromUrl("http://localhost/host/abc")).toBe("host");
    expect(getLogSourceFromUrl("/host-page/content")).toBe("host");
  });

  it("should return 'unknown' for other URLs", () => {
    expect(getLogSourceFromUrl("http://example.com/page")).toBe("unknown");
    expect(getLogSourceFromUrl("")).toBe("unknown");
    expect(getLogSourceFromUrl("/other/path")).toBe("unknown");
  });
});

describe("createEmptyLogSummary", () => {
  it("should return all zeros", () => {
    expect(createEmptyLogSummary()).toEqual({
      total: 0,
      log: 0,
      info: 0,
      warn: 0,
      error: 0,
      debug: 0,
    });
  });
});

describe("calculateLogSummary", () => {
  it("should count logs by level", () => {
    const logs = [
      { level: "log" as const },
      { level: "log" as const },
      { level: "info" as const },
      { level: "warn" as const },
      { level: "error" as const },
      { level: "error" as const },
      { level: "debug" as const },
    ];

    const summary = calculateLogSummary(logs);

    expect(summary).toEqual({
      total: 7,
      log: 2,
      info: 1,
      warn: 1,
      error: 2,
      debug: 1,
    });
  });

  it("should return empty summary for empty array", () => {
    expect(calculateLogSummary([])).toEqual({
      total: 0,
      log: 0,
      info: 0,
      warn: 0,
      error: 0,
      debug: 0,
    });
  });
});
