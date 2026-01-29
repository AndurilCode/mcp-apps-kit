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

// Import additional functions for testing
import {
  hasLocatorOptions,
  describeLocatorStrategy,
  detectProtocolFromMimeType,
  validateWidgetSession,
} from "../src/tools/helpers";

describe("hasLocatorOptions", () => {
  it("should return true when selector is provided", () => {
    expect(hasLocatorOptions({ selector: "#btn" })).toBe(true);
  });

  it("should return true when text is provided", () => {
    expect(hasLocatorOptions({ text: "Click me" })).toBe(true);
  });

  it("should return true when role is provided", () => {
    expect(hasLocatorOptions({ role: "button" })).toBe(true);
  });

  it("should return true when label is provided", () => {
    expect(hasLocatorOptions({ label: "Email" })).toBe(true);
  });

  it("should return true when placeholder is provided", () => {
    expect(hasLocatorOptions({ placeholder: "Enter email" })).toBe(true);
  });

  it("should return true when testId is provided", () => {
    expect(hasLocatorOptions({ testId: "submit-btn" })).toBe(true);
  });

  it("should return false when no options provided", () => {
    expect(hasLocatorOptions({})).toBe(false);
  });

  it("should return false when only empty strings provided", () => {
    expect(hasLocatorOptions({ text: "", selector: "" })).toBe(false);
  });
});

describe("describeLocatorStrategy", () => {
  it("should describe CSS selector", () => {
    expect(describeLocatorStrategy({ selector: "#btn" })).toBe("CSS selector: #btn");
  });

  it("should describe testId", () => {
    expect(describeLocatorStrategy({ testId: "submit-btn" })).toBe("data-testid: submit-btn");
  });

  it("should describe role without name", () => {
    expect(describeLocatorStrategy({ role: "button" })).toBe('role "button"');
  });

  it("should describe role with name", () => {
    expect(describeLocatorStrategy({ role: "button", name: "Submit" })).toBe(
      'role "button" with name "Submit"'
    );
  });

  it("should describe label", () => {
    expect(describeLocatorStrategy({ label: "Email" })).toBe("label: Email");
  });

  it("should describe placeholder", () => {
    expect(describeLocatorStrategy({ placeholder: "Enter email" })).toBe(
      "placeholder: Enter email"
    );
  });

  it("should describe text", () => {
    expect(describeLocatorStrategy({ text: "Click me" })).toBe("text: Click me");
  });

  it("should return unknown when no options", () => {
    expect(describeLocatorStrategy({})).toBe("unknown");
  });

  it("should prioritize selector over other options", () => {
    expect(describeLocatorStrategy({ selector: "#btn", text: "Click" })).toBe("CSS selector: #btn");
  });

  it("should prioritize testId over role/text", () => {
    expect(describeLocatorStrategy({ testId: "btn", text: "Click" })).toBe("data-testid: btn");
  });
});

describe("detectProtocolFromMimeType", () => {
  it("should return mcp for MCP widget mime type", () => {
    expect(detectProtocolFromMimeType("text/html;profile=mcp-app")).toBe("mcp");
  });

  it("should return openai for OpenAI widget mime type", () => {
    expect(detectProtocolFromMimeType("text/html+skybridge")).toBe("openai");
  });

  it("should return null for unknown mime type", () => {
    expect(detectProtocolFromMimeType("text/html")).toBeNull();
    expect(detectProtocolFromMimeType("application/json")).toBeNull();
  });

  it("should return null for undefined mime type", () => {
    expect(detectProtocolFromMimeType(undefined)).toBeNull();
  });
});

describe("validateWidgetSession", () => {
  it("should return error when session is null", () => {
    const mockSessionManager = {
      getSession: vi.fn().mockReturnValue(null),
    };
    const result = validateWidgetSession(
      mockSessionManager as unknown as Parameters<typeof validateWidgetSession>[0],
      "test-session"
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Session not found");
    }
  });

  it("should return error when page is closed", () => {
    const mockSession = {
      page: { isClosed: () => true, frame: vi.fn() },
    };
    const mockSessionManager = {
      getSession: vi.fn().mockReturnValue(mockSession),
    };
    const result = validateWidgetSession(
      mockSessionManager as unknown as Parameters<typeof validateWidgetSession>[0],
      "test-session"
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Page closed");
    }
  });

  it("should return error when widget iframe not found", () => {
    const mockSession = {
      page: { isClosed: () => false, frame: () => null },
    };
    const mockSessionManager = {
      getSession: vi.fn().mockReturnValue(mockSession),
    };
    const result = validateWidgetSession(
      mockSessionManager as unknown as Parameters<typeof validateWidgetSession>[0],
      "test-session"
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Widget iframe not found");
    }
  });

  it("should return success when session and frame are valid", () => {
    const mockFrame = { url: () => "http://localhost/widget/test" };
    const mockSession = {
      page: { isClosed: () => false, frame: () => mockFrame },
    };
    const mockSessionManager = {
      getSession: vi.fn().mockReturnValue(mockSession),
    };
    const result = validateWidgetSession(
      mockSessionManager as unknown as Parameters<typeof validateWidgetSession>[0],
      "test-session"
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.session).toBe(mockSession);
      expect(result.frame).toBe(mockFrame);
    }
  });
});
