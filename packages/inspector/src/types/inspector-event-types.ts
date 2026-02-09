/**
 * Inspector Event Types
 *
 * Types for the events/logs panel in the inspector dashboard.
 * Events track all system activities: tool calls, globals changes, DOM interactions, lifecycle events, etc.
 */

/**
 * Event category for filtering and visual grouping
 */
export type EventCategory =
  | "tool"
  | "globals"
  | "dom"
  | "lifecycle"
  | "session"
  | "error"
  | "dialog"
  | "agent";

/**
 * All event types that can be recorded by the inspector
 *
 * Note: Screencast frame events are EXCLUDED (too noisy at ~30fps)
 */
export type InspectorEventType =
  // Tool events (inputs, outputs, results)
  | "tool-input"
  | "tool-input-partial"
  | "tool-output"
  | "tool-result"
  | "tool-cancelled"
  // Bidirectional tool calls (widget -> host -> server)
  | "call-tool"
  | "call-tool-response"
  // Globals/Environment
  | "globals"
  | "host-context-changed"
  // DOM interaction events
  | "dom-click"
  | "dom-dblclick"
  | "dom-input"
  | "dom-change"
  | "dom-focus"
  | "dom-blur"
  | "dom-scroll"
  | "dom-keydown"
  | "dom-keyup"
  | "dom-select"
  | "dom-hover"
  | "dom-drag"
  // Lifecycle events
  | "initialize"
  | "teardown"
  // Session events
  | "session-created"
  | "session-closed"
  // Error events
  | "page-error"
  // Dialog events
  | "dialog"
  // Agent events (session-agnostic tool calls from the inspector)
  | "agent-tool-call"
  | "agent-tool-result"
  | "agent-initialize"
  // Manual execution events (browse-mode primitive execution from the dashboard)
  | "manual_tool_call"
  | "manual_tool_result"
  | "manual_resource_read"
  | "manual_resource_result"
  | "manual_prompt_get"
  | "manual_prompt_result";

/**
 * Inspector event record
 *
 * Represents a single event captured by the inspector for display in the dashboard.
 */
export interface InspectorEvent {
  /** Unique event ID */
  id: string;
  /** Event category (for filtering) */
  category: EventCategory;
  /** Specific event type */
  type: InspectorEventType;
  /** Timestamp when the event occurred */
  timestamp: number;
  /** Session ID this event belongs to */
  sessionId: string;
  /** Event payload (type-dependent) */
  payload: unknown;
  /** Source of the event */
  source: "widget" | "host" | "server";
  /** Protocol used (mcp or openai) */
  protocol?: "mcp" | "openai";
}

/**
 * Session-agnostic inspector event record
 *
 * Used for events that are not tied to a specific widget session,
 * such as agent tool calls on the connected MCP server.
 */
export interface AgnosticInspectorEvent {
  /** Unique event ID */
  id: string;
  /** Event category (for filtering) */
  category: EventCategory;
  /** Specific event type */
  type: InspectorEventType;
  /** Timestamp when the event occurred */
  timestamp: number;
  /** Event payload (type-dependent) */
  payload: unknown;
  /** Source of the event */
  source: "widget" | "host" | "server" | "agent" | "manual";
  /** Protocol used (mcp or openai) */
  protocol?: "mcp" | "openai";
}

/**
 * Map event type to its category
 */
export function getEventCategory(type: InspectorEventType): EventCategory {
  switch (type) {
    case "tool-input":
    case "tool-input-partial":
    case "tool-output":
    case "tool-result":
    case "tool-cancelled":
    case "call-tool":
    case "call-tool-response":
      return "tool";

    case "globals":
    case "host-context-changed":
      return "globals";

    case "dom-click":
    case "dom-dblclick":
    case "dom-input":
    case "dom-change":
    case "dom-focus":
    case "dom-blur":
    case "dom-scroll":
    case "dom-keydown":
    case "dom-keyup":
    case "dom-select":
    case "dom-hover":
    case "dom-drag":
      return "dom";

    case "initialize":
    case "teardown":
      return "lifecycle";

    case "session-created":
    case "session-closed":
      return "session";

    case "page-error":
      return "error";

    case "dialog":
      return "dialog";

    case "agent-tool-call":
    case "agent-tool-result":
    case "agent-initialize":
    case "manual_tool_call":
    case "manual_tool_result":
    case "manual_resource_read":
    case "manual_resource_result":
    case "manual_prompt_get":
    case "manual_prompt_result":
      return "agent";
  }
}

/**
 * Helper to safely get a string property from an unknown payload
 */
function getStr(payload: unknown, key: string): string | undefined {
  if (payload && typeof payload === "object" && key in payload) {
    const value = (payload as Record<string, unknown>)[key];
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

/**
 * Generate a summary string for an event
 */
export function getEventSummary(event: InspectorEvent | AgnosticInspectorEvent): string {
  const payload = event.payload;

  switch (event.type) {
    case "tool-input":
    case "tool-input-partial":
      return `Tool Input: ${getStr(payload, "name") ?? getStr(payload, "toolName") ?? "unknown"}`;

    case "tool-output":
    case "tool-result":
      return `Tool Result: ${getStr(payload, "name") ?? getStr(payload, "toolName") ?? "unknown"}`;

    case "tool-cancelled":
      return `Tool Cancelled: ${getStr(payload, "name") ?? getStr(payload, "toolName") ?? "unknown"}`;

    case "call-tool":
      return `Widget Call: ${getStr(payload, "name") ?? getStr(payload, "toolName") ?? "unknown"}`;

    case "call-tool-response":
      return `Widget Response: ${getStr(payload, "name") ?? getStr(payload, "toolName") ?? "unknown"}`;

    case "globals":
    case "host-context-changed":
      return "Globals Updated";

    case "dom-click":
      return `Click: ${getStr(payload, "selector") ?? "element"}`;

    case "dom-dblclick":
      return `Double Click: ${getStr(payload, "selector") ?? "element"}`;

    case "dom-input":
      return `Input: ${getStr(payload, "selector") ?? "element"}`;

    case "dom-change":
      return `Change: ${getStr(payload, "selector") ?? "element"}`;

    case "dom-focus":
      return `Focus: ${getStr(payload, "selector") ?? "element"}`;

    case "dom-blur":
      return "Blur";

    case "dom-scroll":
      return `Scroll: ${getStr(payload, "selector") ?? "window"}`;

    case "dom-keydown":
      return `Key Down: ${getStr(payload, "key") ?? "unknown"}`;

    case "dom-keyup":
      return `Key Up: ${getStr(payload, "key") ?? "unknown"}`;

    case "dom-select":
      return `Select: ${getStr(payload, "selector") ?? "element"}`;

    case "dom-hover":
      return `Hover: ${getStr(payload, "selector") ?? "element"}`;

    case "dom-drag":
      return "Drag";

    case "initialize":
      return "Widget Initialized";

    case "teardown":
      return "Widget Teardown";

    case "session-created":
      return `Session Created: ${getStr(payload, "toolName") ?? "unknown"}`;

    case "session-closed":
      return "Session Closed";

    case "page-error": {
      const msg = getStr(payload, "message");
      if (msg) return `Error: ${msg.slice(0, 50)}`;
      return "Error: Unknown error";
    }

    case "dialog": {
      const dialogType = getStr(payload, "type") ?? "unknown";
      const dialogMsg = getStr(payload, "message") ?? "";
      return `Dialog: ${dialogType} - ${dialogMsg.slice(0, 30)}`;
    }

    case "agent-tool-call":
      return `Agent Call: ${getStr(payload, "name") ?? getStr(payload, "toolName") ?? "unknown"}`;

    case "agent-tool-result": {
      const isError =
        payload && typeof payload === "object" && "isError" in payload && payload.isError;
      const toolName = getStr(payload, "name") ?? getStr(payload, "toolName") ?? "unknown";
      return isError ? `Agent Error: ${toolName}` : `Agent Result: ${toolName}`;
    }

    case "agent-initialize": {
      const clientName = getStr(payload, "clientName") ?? getStr(payload, "name");
      return clientName ? `Agent Connected: ${clientName}` : "Agent Connected";
    }

    case "manual_tool_call":
      return `Manual Call: ${getStr(payload, "name") ?? "unknown"}`;

    case "manual_tool_result": {
      const manualToolError =
        payload && typeof payload === "object" && "isError" in payload && payload.isError;
      const manualToolName = getStr(payload, "name") ?? "unknown";
      return manualToolError
        ? `Manual Error: ${manualToolName}`
        : `Manual Result: ${manualToolName}`;
    }

    case "manual_resource_read":
      return `Manual Read: ${getStr(payload, "name") ?? getStr(payload, "uri") ?? "unknown"}`;

    case "manual_resource_result": {
      const manualResError =
        payload && typeof payload === "object" && "isError" in payload && payload.isError;
      const manualResName = getStr(payload, "name") ?? getStr(payload, "uri") ?? "unknown";
      return manualResError
        ? `Manual Read Error: ${manualResName}`
        : `Manual Read Result: ${manualResName}`;
    }

    case "manual_prompt_get":
      return `Manual Prompt: ${getStr(payload, "name") ?? "unknown"}`;

    case "manual_prompt_result": {
      const manualPromptError =
        payload && typeof payload === "object" && "isError" in payload && payload.isError;
      const manualPromptName = getStr(payload, "name") ?? "unknown";
      return manualPromptError
        ? `Manual Prompt Error: ${manualPromptName}`
        : `Manual Prompt Result: ${manualPromptName}`;
    }
  }
}
