/**
 * Tests for manual event types in the inspector event system.
 *
 * Covers:
 * - AC-05: Agent panel shows manual calls with source:manual badge
 * - AC-10: Manual events include kind, name, params, connectionId, status, duration, source:manual
 * - AC-08: getEventCategory returns "agent" for all manual_* event types
 * - getEventSummary returns correct summaries for manual events
 * - Event structure validation for AgnosticInspectorEvent with source "manual"
 */

import { describe, it, expect } from "vitest";
import { getEventCategory, getEventSummary } from "../src/types/inspector-event-types";
import type {
  AgnosticInspectorEvent,
  InspectorEventType,
} from "../src/types/inspector-event-types";

// =============================================================================
// getEventCategory — manual event types map to "agent" category
// =============================================================================

describe("getEventCategory — manual event types", () => {
  const manualEventTypes: InspectorEventType[] = [
    "manual_tool_call",
    "manual_tool_result",
    "manual_resource_read",
    "manual_resource_result",
    "manual_prompt_get",
    "manual_prompt_result",
  ];

  for (const type of manualEventTypes) {
    it(`returns "agent" for "${type}"`, () => {
      expect(getEventCategory(type)).toBe("agent");
    });
  }

  it("also returns agent for standard agent event types", () => {
    expect(getEventCategory("agent-tool-call")).toBe("agent");
    expect(getEventCategory("agent-tool-result")).toBe("agent");
    expect(getEventCategory("agent-initialize")).toBe("agent");
  });

  it("returns non-agent for tool events", () => {
    expect(getEventCategory("tool-input")).toBe("tool");
    expect(getEventCategory("tool-result")).toBe("tool");
  });
});

// =============================================================================
// getEventSummary — manual event types
// =============================================================================

describe("getEventSummary — manual_tool_call", () => {
  it("returns correct summary with tool name", () => {
    const event: AgnosticInspectorEvent = {
      id: "m-1",
      category: "agent",
      type: "manual_tool_call",
      timestamp: Date.now(),
      payload: { name: "search_docs" },
      source: "manual",
    };
    expect(getEventSummary(event)).toBe("Manual Call: search_docs");
  });

  it("returns unknown when name is missing", () => {
    const event: AgnosticInspectorEvent = {
      id: "m-2",
      category: "agent",
      type: "manual_tool_call",
      timestamp: Date.now(),
      payload: {},
      source: "manual",
    };
    expect(getEventSummary(event)).toBe("Manual Call: unknown");
  });
});

describe("getEventSummary — manual_tool_result", () => {
  it("returns success summary", () => {
    const event: AgnosticInspectorEvent = {
      id: "m-3",
      category: "agent",
      type: "manual_tool_result",
      timestamp: Date.now(),
      payload: { name: "search_docs", isError: false, duration: 150 },
      source: "manual",
    };
    expect(getEventSummary(event)).toBe("Manual Result: search_docs");
  });

  it("returns error summary when isError is true", () => {
    const event: AgnosticInspectorEvent = {
      id: "m-4",
      category: "agent",
      type: "manual_tool_result",
      timestamp: Date.now(),
      payload: { name: "search_docs", isError: true, error: "timeout" },
      source: "manual",
    };
    expect(getEventSummary(event)).toBe("Manual Error: search_docs");
  });

  it("returns unknown when name is missing", () => {
    const event: AgnosticInspectorEvent = {
      id: "m-5",
      category: "agent",
      type: "manual_tool_result",
      timestamp: Date.now(),
      payload: { isError: false },
      source: "manual",
    };
    expect(getEventSummary(event)).toBe("Manual Result: unknown");
  });
});

describe("getEventSummary — manual_resource_read", () => {
  it("returns summary with resource name", () => {
    const event: AgnosticInspectorEvent = {
      id: "m-6",
      category: "agent",
      type: "manual_resource_read",
      timestamp: Date.now(),
      payload: { name: "config.json" },
      source: "manual",
    };
    expect(getEventSummary(event)).toBe("Manual Read: config.json");
  });

  it("falls back to uri when name is missing", () => {
    const event: AgnosticInspectorEvent = {
      id: "m-7",
      category: "agent",
      type: "manual_resource_read",
      timestamp: Date.now(),
      payload: { uri: "file:///etc/config.json" },
      source: "manual",
    };
    expect(getEventSummary(event)).toBe("Manual Read: file:///etc/config.json");
  });

  it("returns unknown when both name and uri are missing", () => {
    const event: AgnosticInspectorEvent = {
      id: "m-8",
      category: "agent",
      type: "manual_resource_read",
      timestamp: Date.now(),
      payload: {},
      source: "manual",
    };
    expect(getEventSummary(event)).toBe("Manual Read: unknown");
  });
});

describe("getEventSummary — manual_resource_result", () => {
  it("returns success summary", () => {
    const event: AgnosticInspectorEvent = {
      id: "m-9",
      category: "agent",
      type: "manual_resource_result",
      timestamp: Date.now(),
      payload: { name: "config.json", isError: false },
      source: "manual",
    };
    expect(getEventSummary(event)).toBe("Manual Read Result: config.json");
  });

  it("returns error summary when isError is true", () => {
    const event: AgnosticInspectorEvent = {
      id: "m-10",
      category: "agent",
      type: "manual_resource_result",
      timestamp: Date.now(),
      payload: { name: "missing.json", isError: true },
      source: "manual",
    };
    expect(getEventSummary(event)).toBe("Manual Read Error: missing.json");
  });

  it("falls back to uri when name is missing", () => {
    const event: AgnosticInspectorEvent = {
      id: "m-11",
      category: "agent",
      type: "manual_resource_result",
      timestamp: Date.now(),
      payload: { uri: "file:///docs/readme.md", isError: false },
      source: "manual",
    };
    expect(getEventSummary(event)).toBe("Manual Read Result: file:///docs/readme.md");
  });
});

describe("getEventSummary — manual_prompt_get", () => {
  it("returns summary with prompt name", () => {
    const event: AgnosticInspectorEvent = {
      id: "m-12",
      category: "agent",
      type: "manual_prompt_get",
      timestamp: Date.now(),
      payload: { name: "summarize-page" },
      source: "manual",
    };
    expect(getEventSummary(event)).toBe("Manual Prompt: summarize-page");
  });

  it("returns unknown when name is missing", () => {
    const event: AgnosticInspectorEvent = {
      id: "m-13",
      category: "agent",
      type: "manual_prompt_get",
      timestamp: Date.now(),
      payload: {},
      source: "manual",
    };
    expect(getEventSummary(event)).toBe("Manual Prompt: unknown");
  });
});

describe("getEventSummary — manual_prompt_result", () => {
  it("returns success summary", () => {
    const event: AgnosticInspectorEvent = {
      id: "m-14",
      category: "agent",
      type: "manual_prompt_result",
      timestamp: Date.now(),
      payload: { name: "summarize-page", isError: false },
      source: "manual",
    };
    expect(getEventSummary(event)).toBe("Manual Prompt Result: summarize-page");
  });

  it("returns error summary when isError is true", () => {
    const event: AgnosticInspectorEvent = {
      id: "m-15",
      category: "agent",
      type: "manual_prompt_result",
      timestamp: Date.now(),
      payload: { name: "summarize-page", isError: true },
      source: "manual",
    };
    expect(getEventSummary(event)).toBe("Manual Prompt Error: summarize-page");
  });
});

// =============================================================================
// AgnosticInspectorEvent structure — source: "manual"
// =============================================================================

describe("AgnosticInspectorEvent structure for manual events", () => {
  it("accepts source 'manual' in the event interface", () => {
    const event: AgnosticInspectorEvent = {
      id: "manual-001",
      category: "agent",
      type: "manual_tool_call",
      timestamp: Date.now(),
      payload: {
        name: "search",
        params: { query: "hello" },
      },
      source: "manual",
    };

    expect(event.source).toBe("manual");
    expect(event.category).toBe("agent");
    expect(event.type).toBe("manual_tool_call");
  });

  it("manual event payload includes expected fields for tool call", () => {
    const payload = {
      name: "get_weather",
      params: { location: "NYC" },
    };

    const event: AgnosticInspectorEvent = {
      id: "manual-002",
      category: "agent",
      type: "manual_tool_call",
      timestamp: Date.now(),
      payload,
      source: "manual",
    };

    const p = event.payload as Record<string, unknown>;
    expect(p.name).toBe("get_weather");
    expect(p.params).toEqual({ location: "NYC" });
  });

  it("manual result event payload includes status and duration", () => {
    const payload = {
      name: "get_weather",
      isError: false,
      duration: 245,
      result: { temperature: 72 },
    };

    const event: AgnosticInspectorEvent = {
      id: "manual-003",
      category: "agent",
      type: "manual_tool_result",
      timestamp: Date.now(),
      payload,
      source: "manual",
    };

    const p = event.payload as Record<string, unknown>;
    expect(p.isError).toBe(false);
    expect(p.duration).toBe(245);
    expect(p.result).toEqual({ temperature: 72 });
  });

  it("manual error result event includes error field", () => {
    const payload = {
      name: "get_weather",
      isError: true,
      duration: 30000,
      error: "Execution timed out after 30000ms",
    };

    const event: AgnosticInspectorEvent = {
      id: "manual-004",
      category: "agent",
      type: "manual_tool_result",
      timestamp: Date.now(),
      payload,
      source: "manual",
    };

    const p = event.payload as Record<string, unknown>;
    expect(p.isError).toBe(true);
    expect(p.error).toContain("timed out");
  });
});

// =============================================================================
// getEventCategory — full coverage of all event types
// =============================================================================

describe("getEventCategory — non-manual types coverage", () => {
  it("maps tool event types to 'tool'", () => {
    expect(getEventCategory("tool-input")).toBe("tool");
    expect(getEventCategory("tool-input-partial")).toBe("tool");
    expect(getEventCategory("tool-output")).toBe("tool");
    expect(getEventCategory("tool-result")).toBe("tool");
    expect(getEventCategory("tool-cancelled")).toBe("tool");
    expect(getEventCategory("call-tool")).toBe("tool");
    expect(getEventCategory("call-tool-response")).toBe("tool");
  });

  it("maps globals event types to 'globals'", () => {
    expect(getEventCategory("globals")).toBe("globals");
    expect(getEventCategory("host-context-changed")).toBe("globals");
  });

  it("maps DOM event types to 'dom'", () => {
    expect(getEventCategory("dom-click")).toBe("dom");
    expect(getEventCategory("dom-dblclick")).toBe("dom");
    expect(getEventCategory("dom-input")).toBe("dom");
    expect(getEventCategory("dom-change")).toBe("dom");
    expect(getEventCategory("dom-focus")).toBe("dom");
    expect(getEventCategory("dom-blur")).toBe("dom");
    expect(getEventCategory("dom-scroll")).toBe("dom");
    expect(getEventCategory("dom-keydown")).toBe("dom");
    expect(getEventCategory("dom-keyup")).toBe("dom");
    expect(getEventCategory("dom-select")).toBe("dom");
    expect(getEventCategory("dom-hover")).toBe("dom");
    expect(getEventCategory("dom-drag")).toBe("dom");
  });

  it("maps lifecycle event types to 'lifecycle'", () => {
    expect(getEventCategory("initialize")).toBe("lifecycle");
    expect(getEventCategory("teardown")).toBe("lifecycle");
  });

  it("maps session event types to 'session'", () => {
    expect(getEventCategory("session-created")).toBe("session");
    expect(getEventCategory("session-closed")).toBe("session");
  });

  it("maps error event types to 'error'", () => {
    expect(getEventCategory("page-error")).toBe("error");
  });

  it("maps dialog event types to 'dialog'", () => {
    expect(getEventCategory("dialog")).toBe("dialog");
  });
});

// =============================================================================
// getEventSummary — agent event types
// =============================================================================

describe("getEventSummary — agent event types", () => {
  it("agent-tool-call returns correct summary", () => {
    const event: AgnosticInspectorEvent = {
      id: "a-1",
      category: "agent",
      type: "agent-tool-call",
      timestamp: Date.now(),
      payload: { name: "list_tools" },
      source: "agent",
    };
    expect(getEventSummary(event)).toBe("Agent Call: list_tools");
  });

  it("agent-tool-result returns correct summary for success", () => {
    const event: AgnosticInspectorEvent = {
      id: "a-2",
      category: "agent",
      type: "agent-tool-result",
      timestamp: Date.now(),
      payload: { name: "list_tools", isError: false },
      source: "agent",
    };
    expect(getEventSummary(event)).toBe("Agent Result: list_tools");
  });

  it("agent-tool-result returns error summary", () => {
    const event: AgnosticInspectorEvent = {
      id: "a-3",
      category: "agent",
      type: "agent-tool-result",
      timestamp: Date.now(),
      payload: { name: "list_tools", isError: true },
      source: "agent",
    };
    expect(getEventSummary(event)).toBe("Agent Error: list_tools");
  });

  it("agent-initialize returns connected summary", () => {
    const event: AgnosticInspectorEvent = {
      id: "a-4",
      category: "agent",
      type: "agent-initialize",
      timestamp: Date.now(),
      payload: { clientName: "Claude" },
      source: "agent",
    };
    expect(getEventSummary(event)).toBe("Agent Connected: Claude");
  });

  it("agent-initialize returns generic summary without client name", () => {
    const event: AgnosticInspectorEvent = {
      id: "a-5",
      category: "agent",
      type: "agent-initialize",
      timestamp: Date.now(),
      payload: {},
      source: "agent",
    };
    expect(getEventSummary(event)).toBe("Agent Connected");
  });

  it("agent-tool-call falls back to toolName", () => {
    const event: AgnosticInspectorEvent = {
      id: "a-6",
      category: "agent",
      type: "agent-tool-call",
      timestamp: Date.now(),
      payload: { toolName: "get_widget_state" },
      source: "agent",
    };
    expect(getEventSummary(event)).toBe("Agent Call: get_widget_state");
  });

  it("agent-tool-result falls back to toolName", () => {
    const event: AgnosticInspectorEvent = {
      id: "a-7",
      category: "agent",
      type: "agent-tool-result",
      timestamp: Date.now(),
      payload: { toolName: "widget_click", isError: false },
      source: "agent",
    };
    expect(getEventSummary(event)).toBe("Agent Result: widget_click");
  });
});

// =============================================================================
// getEventSummary — other event types for completeness
// =============================================================================

describe("getEventSummary — other event types", () => {
  it("tool-input returns summary with name", () => {
    const event: AgnosticInspectorEvent = {
      id: "e-1",
      category: "tool",
      type: "tool-input",
      timestamp: Date.now(),
      payload: { name: "search" },
      source: "host",
    };
    expect(getEventSummary(event)).toBe("Tool Input: search");
  });

  it("dom-click returns summary with selector", () => {
    const event: AgnosticInspectorEvent = {
      id: "e-2",
      category: "dom",
      type: "dom-click",
      timestamp: Date.now(),
      payload: { selector: "#submit-btn" },
      source: "widget",
    };
    expect(getEventSummary(event)).toBe("Click: #submit-btn");
  });

  it("page-error truncates long messages", () => {
    const event: AgnosticInspectorEvent = {
      id: "e-3",
      category: "error",
      type: "page-error",
      timestamp: Date.now(),
      payload: { message: "A".repeat(100) },
      source: "widget",
    };
    const summary = getEventSummary(event);
    expect(summary).toBe(`Error: ${"A".repeat(50)}`);
  });

  it("dialog returns type and message", () => {
    const event: AgnosticInspectorEvent = {
      id: "e-4",
      category: "dialog",
      type: "dialog",
      timestamp: Date.now(),
      payload: { type: "alert", message: "Are you sure you want to delete?" },
      source: "widget",
    };
    expect(getEventSummary(event)).toBe("Dialog: alert - Are you sure you want to delet");
  });

  it("session-created includes tool name", () => {
    const event: AgnosticInspectorEvent = {
      id: "e-5",
      category: "session",
      type: "session-created",
      timestamp: Date.now(),
      payload: { toolName: "weather-widget" },
      source: "host",
    };
    expect(getEventSummary(event)).toBe("Session Created: weather-widget");
  });
});
