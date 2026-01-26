/**
 * Shared helpers for UI rendering tools
 *
 * Common utilities for extracting tool results, finding UI resources,
 * and processing widget content.
 */

import { MCP_WIDGET_MIME_TYPE, OPENAI_WIDGET_MIME_TYPE } from "@mcp-apps-kit/core";

/**
 * Detected protocol for a UI widget
 */
export type DetectedProtocol = "mcp" | "openai";

/**
 * Detect protocol from MIME type (standalone function for use without UIHostManager instance)
 */
export function detectProtocolFromMimeType(mimeType: string | undefined): DetectedProtocol | null {
  if (!mimeType) return null;
  if (mimeType === MCP_WIDGET_MIME_TYPE) return "mcp";
  if (mimeType === OPENAI_WIDGET_MIME_TYPE) return "openai";
  return null;
}

/**
 * Minimal MCP client interface for resource operations
 * Defines only the methods we need to avoid coupling to specific SDK versions
 */
export interface MCPResourceClient {
  listResources(): Promise<{
    resources: Array<{ uri: string; mimeType?: string }>;
  }>;
  readResource(params: { uri: string }): Promise<{
    contents: Array<{ text?: string } | Record<string, unknown>>;
  }>;
}

/**
 * UI resource info for a tool
 */
export interface UIResourceInfo {
  uri: string;
  mimeType: string;
  protocol: DetectedProtocol;
}

/**
 * MCP call tool response - supports various SDK response formats
 */
export interface MCPCallToolResponse {
  structuredContent?: unknown;
  content?: Array<{ type: string; text?: string }>;
  // Allow additional properties for SDK compatibility
  [key: string]: unknown;
}

/**
 * Extract tool result from MCP call response
 *
 * Handles both structuredContent and text content formats.
 */
export function extractToolResult(callResult: MCPCallToolResponse): unknown {
  if (callResult.structuredContent) {
    return callResult.structuredContent;
  }

  if (callResult.content && Array.isArray(callResult.content) && callResult.content.length > 0) {
    const textContent = callResult.content.find((c) => c.type === "text");
    if (textContent?.text) {
      try {
        return JSON.parse(textContent.text);
      } catch {
        return textContent.text;
      }
    }
  }

  return undefined;
}

/**
 * Find UI resource for a tool by name
 *
 * Searches through resources looking for matching MIME types and URI patterns.
 */
export async function findUIResourceForTool(
  rawClient: MCPResourceClient,
  toolName: string
): Promise<UIResourceInfo | null> {
  const resourcesResult = await rawClient.listResources();

  // Patterns to match tool name in URI
  const toolNamePatterns = [
    `__ui_${toolName}`,
    `/${toolName}?`,
    `/${toolName}`,
    `toolName=${toolName}`,
  ];

  for (const resource of resourcesResult.resources) {
    const mimeType = resource.mimeType;
    if (!mimeType) continue;

    const protocol = detectProtocolFromMimeType(mimeType);
    if (!protocol) continue;

    const uriMatchesTool = toolNamePatterns.some(
      (pattern) => resource.uri.includes(pattern) || resource.uri.endsWith(pattern.replace("?", ""))
    );

    if (uriMatchesTool) {
      return {
        uri: resource.uri,
        mimeType,
        protocol,
      };
    }
  }

  return null;
}

/**
 * Fetch widget HTML content from a resource URI
 */
export async function fetchWidgetHTML(rawClient: MCPResourceClient, uri: string): Promise<string> {
  const contentResult = await rawClient.readResource({ uri });
  let html = "";

  for (const content of contentResult.contents) {
    if ("text" in content && typeof content.text === "string") {
      html += content.text;
    }
  }

  return html;
}

/**
 * Determine protocol to use, respecting user override
 */
export function resolveProtocol(
  detectedProtocol: DetectedProtocol,
  userProtocol?: "mcp" | "openai" | "auto"
): DetectedProtocol {
  if (userProtocol && userProtocol !== "auto") {
    return userProtocol;
  }
  return detectedProtocol;
}

/**
 * Map Playwright console message type to log level
 */
export type LogLevel = "log" | "info" | "warn" | "error" | "debug";

export function mapConsoleTypeToLogLevel(type: string): LogLevel {
  switch (type) {
    case "log":
      return "log";
    case "info":
      return "info";
    case "warning":
      return "warn";
    case "error":
      return "error";
    case "debug":
      return "debug";
    default:
      return "log";
  }
}

/**
 * Determine log source from URL
 */
export type LogSource = "widget" | "host" | "unknown";

export function getLogSourceFromUrl(url: string): LogSource {
  if (url.includes("/widget/")) {
    return "widget";
  }
  if (url.includes("/host/") || url.includes("host-page")) {
    return "host";
  }
  return "unknown";
}

/**
 * Create empty log summary
 */
export function createEmptyLogSummary(): {
  total: number;
  log: number;
  info: number;
  warn: number;
  error: number;
  debug: number;
} {
  return { total: 0, log: 0, info: 0, warn: 0, error: 0, debug: 0 };
}

/**
 * Calculate log summary from entries
 */
export function calculateLogSummary(
  logs: Array<{ level: LogLevel }>
): ReturnType<typeof createEmptyLogSummary> {
  return {
    total: logs.length,
    log: logs.filter((l) => l.level === "log").length,
    info: logs.filter((l) => l.level === "info").length,
    warn: logs.filter((l) => l.level === "warn").length,
    error: logs.filter((l) => l.level === "error").length,
    debug: logs.filter((l) => l.level === "debug").length,
  };
}
