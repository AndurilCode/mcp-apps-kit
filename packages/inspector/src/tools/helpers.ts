/**
 * Shared helpers for UI rendering tools
 *
 * Common utilities for extracting tool results, finding UI resources,
 * processing widget content, semantic locators, and DOM stability.
 */

import { MCP_WIDGET_MIME_TYPE, OPENAI_WIDGET_MIME_TYPE } from "@mcp-apps-kit/core";
import type { Frame, Locator } from "playwright";
import type { SemanticLocatorOptions, WaitForStabilityOptions, ToolHints } from "../types";
import type { ActiveWidgetSession, WidgetSessionManager } from "../widget-session-manager";

// =============================================================================
// SESSION VALIDATION
// =============================================================================

export interface SessionValidationSuccess {
  success: true;
  session: ActiveWidgetSession;
  frame: Frame;
}

export interface SessionValidationError {
  success: false;
  error: string;
  hints: ToolHints;
}

export type SessionValidationResult = SessionValidationSuccess | SessionValidationError;

/**
 * Validate a widget session exists, is open, and has a widget iframe
 *
 * Returns a discriminated union for easy pattern matching:
 * - success=true: session and frame are available
 * - success=false: error message and hints for recovery
 */
export function validateWidgetSession(
  sessionManager: WidgetSessionManager,
  sessionId: string
): SessionValidationResult {
  const session = sessionManager.getSession(sessionId);

  if (!session) {
    return {
      success: false,
      error: `Session not found: ${sessionId}`,
      hints: { next: "Create a new session with preview_ui or call_tool(renderWidget=true)" },
    };
  }

  // Use WidgetFrameHandle if available (interactive mode), otherwise raw page
  if (session.handle) {
    if (!session.handle.isAlive()) {
      return {
        success: false,
        error: "Page closed",
        hints: { next: "Create a new session with preview_ui or call_tool(renderWidget=true)" },
      };
    }
    return { success: true, session, frame: session.handle.frame };
  }

  if (session.page.isClosed()) {
    return {
      success: false,
      error: "Page closed",
      hints: { next: "Create a new session with preview_ui or call_tool(renderWidget=true)" },
    };
  }

  const frame = session.page.frame({ url: new RegExp(`/widget/${session.id}/`) });
  if (!frame) {
    return {
      success: false,
      error: "Widget iframe not found",
      hints: {
        next: "Wait for widget to load, or verify session is valid",
        warning: "Widget may still be loading",
      },
    };
  }

  return { success: true, session, frame };
}

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
  listTools(): Promise<{
    tools: Array<{
      name: string;
      _meta?: Record<string, unknown>;
    }>;
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
 * Result of extracting UI resource from tool metadata
 */
interface ExtractedUIResource {
  uri: string;
  /** Protocol inferred from the metadata format used */
  inferredProtocol: DetectedProtocol;
}

/**
 * Extract UI resource URI from tool metadata
 *
 * Supports multiple formats:
 * - MCP Apps format: _meta.ui.resourceUri
 * - Flat MCP format: _meta["ui/resourceUri"]
 * - OpenAI format: _meta["openai/outputTemplate"]
 *
 * Also returns the inferred protocol based on which metadata format was used.
 */
function extractUIResourceUriFromMeta(
  meta: Record<string, unknown> | undefined
): ExtractedUIResource | null {
  if (!meta) return null;

  // MCP Apps format: _meta.ui.resourceUri (SEP-1865)
  const uiMeta = meta.ui as Record<string, unknown> | undefined;
  if (uiMeta?.resourceUri) {
    return {
      uri: uiMeta.resourceUri as string,
      inferredProtocol: "mcp",
    };
  }

  // Flat MCP format: _meta["ui/resourceUri"]
  const flatResourceUri = meta["ui/resourceUri"] as string | undefined;
  if (flatResourceUri) {
    return {
      uri: flatResourceUri,
      inferredProtocol: "mcp",
    };
  }

  // OpenAI format: _meta["openai/outputTemplate"]
  const openaiOutputTemplate = meta["openai/outputTemplate"] as string | undefined;
  if (openaiOutputTemplate) {
    return {
      uri: openaiOutputTemplate,
      inferredProtocol: "openai",
    };
  }

  return null;
}

/**
 * Find UI resource for a tool by name
 *
 * First looks at the tool's _meta to find the resourceUri binding,
 * then falls back to URI pattern matching for backwards compatibility.
 *
 * When the tool metadata specifies a UI resource, we trust it even if the
 * resource's mimeType is missing or unknown. The protocol is inferred from
 * the metadata format used (e.g., openai/outputTemplate → openai protocol).
 * This follows how MCPJam inspector handles widget detection.
 */
export async function findUIResourceForTool(
  rawClient: MCPResourceClient,
  toolName: string
): Promise<UIResourceInfo | null> {
  // Step 1: Get the tool's metadata to find the resourceUri binding
  let extractedResource: ExtractedUIResource | null = null;

  try {
    const toolsResult = await rawClient.listTools();
    const tool = toolsResult.tools.find((t) => t.name === toolName);
    if (tool?._meta) {
      extractedResource = extractUIResourceUriFromMeta(tool._meta);
    }
  } catch {
    // If listTools fails, continue with pattern matching fallback
  }

  const resourcesResult = await rawClient.listResources();

  // Step 2: If we have a target URI from metadata, find that exact resource
  // Trust the metadata even if the resource's mimeType is missing/unknown
  if (extractedResource) {
    for (const resource of resourcesResult.resources) {
      if (resource.uri === extractedResource.uri) {
        const mimeType = resource.mimeType;

        // Try to detect protocol from mimeType first
        const protocolFromMime = mimeType ? detectProtocolFromMimeType(mimeType) : null;

        // Use mimeType-based protocol if available, otherwise use inferred protocol from metadata
        const protocol = protocolFromMime ?? extractedResource.inferredProtocol;

        return {
          uri: resource.uri,
          mimeType: mimeType ?? "text/html", // Default to text/html if missing
          protocol,
        };
      }
    }

    // Resource URI from metadata exists but resource not found in list
    // This can happen if the server doesn't list the resource but serves it on-demand
    // Trust the metadata and assume it's valid
    return {
      uri: extractedResource.uri,
      mimeType: "text/html", // Default
      protocol: extractedResource.inferredProtocol,
    };
  }

  // Step 3: Fallback to pattern matching (backwards compatibility)
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

// =============================================================================
// SEMANTIC LOCATOR HELPERS
// =============================================================================

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolve a locator from semantic options
 *
 * Priority order:
 * 1. selector (CSS selector) - if provided, used directly
 * 2. testId (data-testid) - most stable for testing
 * 3. role + name - semantic and accessible
 * 4. label - for form elements
 * 5. placeholder - for inputs
 * 6. text - visible text content
 *
 * @throws Error if no valid locator options are provided
 */
export function resolveLocator(frame: Frame, options: SemanticLocatorOptions): Locator {
  const { selector, text, role, name, label, placeholder, testId, exact } = options;

  // Priority 1: CSS selector (explicit override)
  if (selector) {
    return frame.locator(selector).first();
  }

  // Priority 2: data-testid (most stable for testing)
  if (testId) {
    return frame.getByTestId(testId).first();
  }

  // Priority 3: Role + name (semantic and accessible)
  if (role) {
    const roleOptions: { name?: string | RegExp; exact?: boolean } = {};
    if (name) {
      roleOptions.name = exact ? name : new RegExp(escapeRegex(name), "i");
      roleOptions.exact = exact;
    }
    // Cast role to any valid role type - Playwright accepts string
    return frame.getByRole(role as Parameters<typeof frame.getByRole>[0], roleOptions).first();
  }

  // Priority 4: Label (for form elements)
  if (label) {
    return frame.getByLabel(label, { exact }).first();
  }

  // Priority 5: Placeholder (for inputs)
  if (placeholder) {
    return frame.getByPlaceholder(placeholder, { exact }).first();
  }

  // Priority 6: Text (visible text content)
  if (text) {
    return frame.getByText(text, { exact }).first();
  }

  // No valid locator options provided
  throw new Error(
    "No locator specified. Provide one of: selector, text, role, label, placeholder, or testId"
  );
}

/**
 * Check if any locator option is provided
 */
export function hasLocatorOptions(options: SemanticLocatorOptions): boolean {
  // Using Boolean() to convert to boolean - empty strings are intentionally falsy
  return Boolean(
    options.selector ??
    options.text ??
    options.role ??
    options.label ??
    options.placeholder ??
    options.testId
  );
}

/**
 * Get human-readable description of the locator strategy used
 */
export function describeLocatorStrategy(options: SemanticLocatorOptions): string {
  if (options.selector) return `CSS selector: ${options.selector}`;
  if (options.testId) return `data-testid: ${options.testId}`;
  if (options.role) {
    return options.name
      ? `role "${options.role}" with name "${options.name}"`
      : `role "${options.role}"`;
  }
  if (options.label) return `label: ${options.label}`;
  if (options.placeholder) return `placeholder: ${options.placeholder}`;
  if (options.text) return `text: ${options.text}`;
  return "unknown";
}

// =============================================================================
// DOM STABILITY HELPERS
// =============================================================================

/**
 * Wait for DOM to stabilize after an action
 *
 * Uses multiple strategies:
 * 1. Minimum wait time (always applied)
 * 2. Network idle (if waitForNetwork is true)
 * 3. DOM mutation stability (no changes for stabilityMs)
 */
export async function waitForDOMStability(
  frame: Frame,
  options: WaitForStabilityOptions = {}
): Promise<{ waitedMs: number; wasStable: boolean }> {
  const { waitForNetwork = false, stabilityMs = 100, timeout = 5000, minWait = 50 } = options;

  const startTime = Date.now();

  // Minimum wait
  await new Promise((resolve) => setTimeout(resolve, minWait));

  // Network idle wait
  if (waitForNetwork) {
    try {
      const remainingForNetwork = Math.max(0, timeout - (Date.now() - startTime));
      await frame.waitForLoadState("networkidle", { timeout: remainingForNetwork });
    } catch {
      // Timeout is acceptable - continue with DOM stability check
    }
  }

  // DOM mutation stability check using MutationObserver
  const remainingTimeout = Math.max(0, timeout - (Date.now() - startTime));
  let wasStable = false;

  if (remainingTimeout > stabilityMs) {
    try {
      wasStable = await frame.evaluate(
        ({ stabilityMs: ms, timeout: to }) => {
          return new Promise<boolean>((resolve) => {
            let lastMutationTime = Date.now();
            let checkInterval: ReturnType<typeof setInterval>;
            let timeoutId: ReturnType<typeof setTimeout>;

            const observer = new MutationObserver(() => {
              lastMutationTime = Date.now();
            });

            // eslint-disable-next-line no-undef -- runs in browser context via frame.evaluate
            observer.observe(document.body, {
              childList: true,
              subtree: true,
              attributes: true,
              characterData: true,
            });

            checkInterval = setInterval(() => {
              if (Date.now() - lastMutationTime >= ms) {
                cleanup();
                resolve(true); // DOM was stable
              }
            }, ms / 2);

            timeoutId = setTimeout(() => {
              cleanup();
              resolve(false); // Timed out without stability
            }, to);

            function cleanup() {
              observer.disconnect();
              clearInterval(checkInterval);
              clearTimeout(timeoutId);
            }
          });
        },
        { stabilityMs, timeout: remainingTimeout }
      );
    } catch {
      // Evaluation failed, assume stable
      wasStable = true;
    }
  }

  const waitedMs = Date.now() - startTime;
  return { waitedMs, wasStable };
}
