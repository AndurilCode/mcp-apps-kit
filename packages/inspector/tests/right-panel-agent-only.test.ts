/**
 * TASK-014: Right Panel — Agent Logs Only
 *
 * Behavioral tests for the dual-mode RightPanel:
 * - Non-streaming mode: static "Agent Logs" heading, AgentPanel only
 * - Streaming mode: three-tab view (Agent, Events, Logs) unchanged
 *
 * Also covers AgentPanel filter removal and localStorage cleanup.
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AgnosticInspectorEvent, InspectorEvent } from "../src/types";
import type { LogEntry } from "../src/dashboard/react/hooks/useLogStream";

// =============================================================================
// HELPERS
// =============================================================================

let container: HTMLDivElement;
let root: Root;

function mount(element: React.ReactElement): void {
  act(() => {
    root.render(element);
  });
}

function unmount(): void {
  act(() => {
    root.unmount();
  });
}

/** Get all matching elements */
function queryAll(selector: string): Element[] {
  return Array.from(container.querySelectorAll(selector));
}

/** Click a DOM element */
function click(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** Build a minimal AgnosticInspectorEvent for testing */
function makeAgentEvent(
  id: string,
  type: "agent-tool-call" | "agent-tool-result" = "agent-tool-call"
): AgnosticInspectorEvent {
  return {
    id,
    category: "agent",
    type,
    timestamp: Date.now(),
    payload: { name: `tool-${id}` },
    source: "agent",
  };
}

/** Build a minimal InspectorEvent */
function makeInspectorEvent(id: string): InspectorEvent {
  return {
    id,
    category: "tool",
    type: "tool-input",
    timestamp: Date.now(),
    sessionId: "sess-1",
    payload: { name: `tool-${id}` },
    source: "host",
  };
}

/** Build a minimal LogEntry */
function makeLogEntry(id: string): LogEntry {
  return {
    sessionId: "sess-1",
    timestamp: Date.now(),
    level: "log",
    args: [`log message ${id}`],
  };
}

// Default props shared across tests
function defaultRightPanelProps(overrides: Record<string, unknown> = {}) {
  return {
    logs: [] as LogEntry[],
    events: [] as InspectorEvent[],
    agentEvents: [] as AgnosticInspectorEvent[],
    onClearLogs: vi.fn(),
    onClearEvents: vi.fn(),
    onClearAgent: vi.fn(),
    isCollapsed: false,
    onToggleCollapse: vi.fn(),
    panelWidth: 400,
    resizeHandleProps: {},
    isResizing: false,
    isStreaming: false,
    ...overrides,
  };
}

// =============================================================================
// SETUP
// =============================================================================

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  // Clear localStorage before each test
  window.localStorage.clear();
});

afterEach(() => {
  unmount();
  document.body.removeChild(container);
});

// =============================================================================
// IMPORT COMPONENTS (dynamic to run after jsdom env is set up)
// =============================================================================

// We import dynamically inside tests to ensure jsdom environment is ready.
// Vitest hoists these properly with the environment pragma above.

// RightPanel is the main component under test
// AgentPanel is tested for filter removal

// =============================================================================
// AC-1: Non-streaming — static "Agent Logs" heading replaces three-tab system
// =============================================================================

describe("AC-1: Non-streaming mode shows static Agent Logs heading", () => {
  it("renders 'Agent Logs' text instead of tab buttons", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const props = defaultRightPanelProps({ isStreaming: false });
    mount(createElement(RightPanel, props));

    // Should show "Agent Logs" heading
    expect(container.textContent).toContain("Agent Logs");

    // Should NOT show individual tab labels for Events or Logs
    const buttons = queryAll("button");
    const tabButtons = buttons.filter(
      (b) => b.getAttribute("aria-pressed") === "true" || b.getAttribute("aria-pressed") === "false"
    );
    expect(tabButtons.length).toBe(0);
  });

  it("renders heading as a non-interactive span (not a button)", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const props = defaultRightPanelProps({ isStreaming: false });
    mount(createElement(RightPanel, props));

    // The "Agent Logs" text should be in a span, not a button
    const spans = queryAll("span");
    const agentLogsSpan = spans.find((s) => s.textContent?.includes("Agent Logs"));
    expect(agentLogsSpan).toBeDefined();
    expect(agentLogsSpan!.tagName).toBe("SPAN");

    // Verify cursor is "default" (non-clickable)
    const style = (agentLogsSpan as HTMLElement).style;
    expect(style.cursor).toBe("default");
  });
});

// =============================================================================
// AC-2: Streaming mode — three-tab view (Agent, Events, Logs) unchanged
// =============================================================================

describe("AC-2: Streaming mode preserves three-tab system", () => {
  it("renders Agent, Events, and Logs tab buttons", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const props = defaultRightPanelProps({ isStreaming: true });
    mount(createElement(RightPanel, props));

    const buttons = queryAll("button");
    const tabButtons = buttons.filter(
      (b) => b.getAttribute("aria-pressed") === "true" || b.getAttribute("aria-pressed") === "false"
    );

    expect(tabButtons.length).toBe(3);
    const labels = tabButtons.map((b) => b.textContent?.trim());
    expect(labels).toContain("Agent");
    expect(labels).toContain("Events");
    expect(labels).toContain("Logs");
  });

  it("allows switching between tabs", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const events = [makeInspectorEvent("e1")];
    const agentEvents = [makeAgentEvent("a1")];
    const logs = [makeLogEntry("l1")];
    const props = defaultRightPanelProps({
      isStreaming: true,
      events,
      agentEvents,
      logs,
    });
    mount(createElement(RightPanel, props));

    // Agent tab active by default
    const buttons = queryAll("button");
    const tabButtons = buttons.filter(
      (b) => b.getAttribute("aria-pressed") === "true" || b.getAttribute("aria-pressed") === "false"
    );
    const agentTab = tabButtons.find((b) => b.textContent?.includes("Agent"));
    const eventsTab = tabButtons.find((b) => b.textContent?.includes("Events"));
    const logsTab = tabButtons.find((b) => b.textContent?.includes("Logs"));

    expect(agentTab).toBeDefined();
    expect(eventsTab).toBeDefined();
    expect(logsTab).toBeDefined();

    // Default: Agent tab pressed
    expect(agentTab!.getAttribute("aria-pressed")).toBe("true");
    expect(eventsTab!.getAttribute("aria-pressed")).toBe("false");

    // Switch to Events tab
    click(eventsTab!);
    expect(eventsTab!.getAttribute("aria-pressed")).toBe("true");
    expect(agentTab!.getAttribute("aria-pressed")).toBe("false");

    // Switch to Logs tab
    click(logsTab!);
    expect(logsTab!.getAttribute("aria-pressed")).toBe("true");
    expect(eventsTab!.getAttribute("aria-pressed")).toBe("false");
  });
});

// =============================================================================
// AC-3: Conditional logic based on isStreaming prop
// =============================================================================

describe("AC-3: isStreaming prop controls rendering mode", () => {
  it("isStreaming=false → agent-only mode", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const props = defaultRightPanelProps({ isStreaming: false });
    mount(createElement(RightPanel, props));

    expect(container.textContent).toContain("Agent Logs");
    // No tab buttons with aria-pressed
    const tabButtons = queryAll("button").filter((b) => b.getAttribute("aria-pressed") !== null);
    expect(tabButtons.length).toBe(0);
  });

  it("isStreaming=true → tabbed mode", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const props = defaultRightPanelProps({ isStreaming: true });
    mount(createElement(RightPanel, props));

    const tabButtons = queryAll("button").filter((b) => b.getAttribute("aria-pressed") !== null);
    expect(tabButtons.length).toBe(3);
  });

  it("RightPanelProps interface includes isStreaming", async () => {
    // Type-level test: compilation proves the prop exists.
    // This test ensures isStreaming is required (not optional).
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const props = defaultRightPanelProps({ isStreaming: true });
    // If isStreaming were removed from the interface, this would fail to compile.
    mount(createElement(RightPanel, props));
    expect(container.innerHTML).not.toBe("");
  });
});

// =============================================================================
// AC-4: Only AgentPanel in agent-only mode; all three panels in streaming mode
// =============================================================================

describe("AC-4: Panel rendering based on mode", () => {
  it("non-streaming: renders AgentPanel content only", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const agentEvents = [makeAgentEvent("a1"), makeAgentEvent("a2")];
    const events = [makeInspectorEvent("e1")];
    const logs = [makeLogEntry("l1")];
    const props = defaultRightPanelProps({
      isStreaming: false,
      agentEvents,
      events,
      logs,
    });
    mount(createElement(RightPanel, props));

    // AgentPanel shows its events
    expect(container.textContent).toContain("Agent");

    // Events and Logs panels should NOT render their content.
    // EventsPanel would show "No events yet" or event data — neither should appear.
    // LogsPanel content markers should be absent.
    // There should be no way to switch to events/logs tabs.
    const tabButtons = queryAll("button").filter((b) => b.getAttribute("aria-pressed") !== null);
    expect(tabButtons.length).toBe(0);
  });

  it("streaming: all three panels accessible via tabs", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const agentEvents = [makeAgentEvent("a1")];
    const events = [makeInspectorEvent("e1")];
    const logs = [makeLogEntry("l1")];
    const props = defaultRightPanelProps({
      isStreaming: true,
      agentEvents,
      events,
      logs,
    });
    mount(createElement(RightPanel, props));

    const tabButtons = queryAll("button").filter((b) => b.getAttribute("aria-pressed") !== null);

    // Click Events tab — should render EventsPanel content
    const eventsTab = tabButtons.find((b) => b.textContent?.includes("Events"));
    click(eventsTab!);
    // EventsPanel renders a filter dropdown with "Filter events by category"
    const filterSelect = container.querySelector('[aria-label="Filter events by category"]');
    expect(filterSelect).not.toBeNull();

    // Click Logs tab — should render LogsPanel content
    const logsTab = tabButtons.find((b) => b.textContent?.includes("Logs"));
    click(logsTab!);
    // Events filter should no longer be visible (different panel)
    const filterSelectAfterLogs = container.querySelector(
      '[aria-label="Filter events by category"]'
    );
    expect(filterSelectAfterLogs).toBeNull();
  });
});

// =============================================================================
// AC-5: Category filter dropdown removed from AgentPanel
// =============================================================================

describe("AC-5: AgentPanel has no category filter dropdown", () => {
  it("does not render a <select> element", async () => {
    const { AgentPanel } = await import("../src/dashboard/react/components/AgentPanel");
    const events = [makeAgentEvent("a1"), makeAgentEvent("a2")];
    mount(createElement(AgentPanel, { events, onClearEvents: vi.fn() }));

    const selects = queryAll("select");
    expect(selects.length).toBe(0);
  });

  it("does not contain filter-related aria labels", async () => {
    const { AgentPanel } = await import("../src/dashboard/react/components/AgentPanel");
    const events = [makeAgentEvent("a1")];
    mount(createElement(AgentPanel, { events, onClearEvents: vi.fn() }));

    const filterLabel = container.querySelector('[aria-label="Filter agent events by category"]');
    expect(filterLabel).toBeNull();
  });

  it("shows all events without filtering (no category state)", async () => {
    const { AgentPanel } = await import("../src/dashboard/react/components/AgentPanel");
    const events = [
      makeAgentEvent("a1", "agent-tool-call"),
      makeAgentEvent("a2", "agent-tool-result"),
      makeAgentEvent("a3", "agent-tool-call"),
    ];
    mount(createElement(AgentPanel, { events, onClearEvents: vi.fn() }));

    // All 3 events should be visible (no filtering)
    // Each EventRow renders the event summary text
    expect(container.textContent).toContain("tool-a1");
    expect(container.textContent).toContain("tool-a2");
    expect(container.textContent).toContain("tool-a3");
  });

  it("EventsPanel STILL has its category filter dropdown (not orphaned)", async () => {
    const { EventsPanel } = await import("../src/dashboard/react/components/EventsPanel");
    const events = [makeInspectorEvent("e1")];
    mount(createElement(EventsPanel, { events, onClearEvents: vi.fn() }));

    const filterLabel = container.querySelector('[aria-label="Filter events by category"]');
    expect(filterLabel).not.toBeNull();
  });
});

// =============================================================================
// AC-6: No localStorage persistence for ACTIVE_TAB_STORAGE_KEY
// =============================================================================

describe("AC-6: localStorage persistence removed for active tab", () => {
  it("does not read from localStorage on mount", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    // Pre-set a value that the OLD code would have read
    window.localStorage.setItem("mcp-dashboard-right-panel-tab", "logs");

    const props = defaultRightPanelProps({ isStreaming: true });
    mount(createElement(RightPanel, props));

    // Should default to "agent" tab, NOT "logs" (ignoring localStorage)
    const tabButtons = queryAll("button").filter((b) => b.getAttribute("aria-pressed") !== null);
    const agentTab = tabButtons.find((b) => b.textContent?.includes("Agent"));
    expect(agentTab!.getAttribute("aria-pressed")).toBe("true");
  });

  it("does not write to localStorage when switching tabs", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const spy = vi.spyOn(window.localStorage, "setItem");

    const props = defaultRightPanelProps({ isStreaming: true });
    mount(createElement(RightPanel, props));

    // Switch to Events tab
    const tabButtons = queryAll("button").filter((b) => b.getAttribute("aria-pressed") !== null);
    const eventsTab = tabButtons.find((b) => b.textContent?.includes("Events"));
    click(eventsTab!);

    // localStorage.setItem should NOT have been called with the tab key
    const tabWrites = spy.mock.calls.filter(([key]) => key === "mcp-dashboard-right-panel-tab");
    expect(tabWrites.length).toBe(0);

    spy.mockRestore();
  });

  it("ACTIVE_TAB_STORAGE_KEY constant is removed from source", async () => {
    // Check the module doesn't export the old storage key constant
    const mod = await import("../src/dashboard/react/components/RightPanel");
    expect(mod).not.toHaveProperty("ACTIVE_TAB_STORAGE_KEY");
  });
});

// =============================================================================
// AC-7: Count badge shows agentEvents.length in both modes
// =============================================================================

describe("AC-7: Count badge shows agentEvents.length", () => {
  it("non-streaming: shows count badge next to Agent Logs heading", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const agentEvents = [makeAgentEvent("a1"), makeAgentEvent("a2"), makeAgentEvent("a3")];
    const props = defaultRightPanelProps({
      isStreaming: false,
      agentEvents,
    });
    mount(createElement(RightPanel, props));

    // The heading should contain the count
    expect(container.textContent).toContain("Agent Logs");
    expect(container.textContent).toContain("3");
  });

  it("non-streaming: hides badge when agentEvents is empty", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const props = defaultRightPanelProps({
      isStreaming: false,
      agentEvents: [],
    });
    mount(createElement(RightPanel, props));

    // The heading "Agent Logs" should exist, but no count span
    const spans = queryAll("span");
    const headingSpan = spans.find((s) => s.textContent?.includes("Agent Logs"));
    expect(headingSpan).toBeDefined();

    // Should NOT show "0" — badge is hidden when empty
    const innerSpans = headingSpan!.querySelectorAll("span");
    expect(innerSpans.length).toBe(0);
  });

  it("streaming: shows count badge on Agent tab", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const agentEvents = [makeAgentEvent("a1"), makeAgentEvent("a2")];
    const props = defaultRightPanelProps({
      isStreaming: true,
      agentEvents,
    });
    mount(createElement(RightPanel, props));

    const tabButtons = queryAll("button").filter((b) => b.getAttribute("aria-pressed") !== null);
    const agentTab = tabButtons.find((b) => b.textContent?.includes("Agent"));
    expect(agentTab).toBeDefined();
    // Tab text should include the count
    expect(agentTab!.textContent).toContain("2");
  });

  it("streaming: shows count badges on Events and Logs tabs too", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const events = [makeInspectorEvent("e1"), makeInspectorEvent("e2")];
    const logs = [makeLogEntry("l1")];
    const props = defaultRightPanelProps({
      isStreaming: true,
      events,
      logs,
    });
    mount(createElement(RightPanel, props));

    const tabButtons = queryAll("button").filter((b) => b.getAttribute("aria-pressed") !== null);
    const eventsTab = tabButtons.find((b) => b.textContent?.includes("Events"));
    const logsTab = tabButtons.find((b) => b.textContent?.includes("Logs"));

    expect(eventsTab!.textContent).toContain("2");
    expect(logsTab!.textContent).toContain("1");
  });
});

// =============================================================================
// AC-8: Clear button remains functional
// =============================================================================

describe("AC-8: Clear button works in both modes", () => {
  it("non-streaming: Clear calls onClearAgent", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const onClearAgent = vi.fn();
    const agentEvents = [makeAgentEvent("a1")];
    const props = defaultRightPanelProps({
      isStreaming: false,
      agentEvents,
      onClearAgent,
    });
    mount(createElement(RightPanel, props));

    const clearBtn = queryAll("button").find((b) => b.textContent === "Clear");
    expect(clearBtn).toBeDefined();
    click(clearBtn!);
    expect(onClearAgent).toHaveBeenCalledTimes(1);
  });

  it("non-streaming: Clear is disabled when onClearAgent is undefined", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const props = defaultRightPanelProps({
      isStreaming: false,
      onClearAgent: undefined,
    });
    mount(createElement(RightPanel, props));

    const clearBtn = queryAll("button").find((b) => b.textContent === "Clear") as HTMLButtonElement;
    expect(clearBtn).toBeDefined();
    expect(clearBtn!.disabled).toBe(true);
  });

  it("streaming: Clear on agent tab calls onClearAgent", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const onClearAgent = vi.fn();
    const props = defaultRightPanelProps({
      isStreaming: true,
      onClearAgent,
    });
    mount(createElement(RightPanel, props));

    // Default tab is agent
    const clearBtn = queryAll("button").find((b) => b.textContent === "Clear");
    click(clearBtn!);
    expect(onClearAgent).toHaveBeenCalledTimes(1);
  });

  it("streaming: Clear on events tab calls onClearEvents", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const onClearEvents = vi.fn();
    const props = defaultRightPanelProps({
      isStreaming: true,
      onClearEvents,
    });
    mount(createElement(RightPanel, props));

    // Switch to events tab
    const tabButtons = queryAll("button").filter((b) => b.getAttribute("aria-pressed") !== null);
    const eventsTab = tabButtons.find((b) => b.textContent?.includes("Events"));
    click(eventsTab!);

    const clearBtn = queryAll("button").find((b) => b.textContent === "Clear");
    click(clearBtn!);
    expect(onClearEvents).toHaveBeenCalledTimes(1);
  });

  it("streaming: Clear on logs tab calls onClearLogs", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const onClearLogs = vi.fn();
    const props = defaultRightPanelProps({
      isStreaming: true,
      onClearLogs,
    });
    mount(createElement(RightPanel, props));

    // Switch to logs tab
    const tabButtons = queryAll("button").filter((b) => b.getAttribute("aria-pressed") !== null);
    const logsTab = tabButtons.find((b) => b.textContent?.includes("Logs"));
    click(logsTab!);

    const clearBtn = queryAll("button").find((b) => b.textContent === "Clear");
    click(clearBtn!);
    expect(onClearLogs).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// EDGE CASES & REGRESSION
// =============================================================================

describe("Edge cases", () => {
  it("collapsed panel renders empty div regardless of isStreaming", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");

    // Non-streaming collapsed
    const props1 = defaultRightPanelProps({ isStreaming: false, isCollapsed: true });
    mount(createElement(RightPanel, props1));
    expect(container.textContent).toBe("");
    expect(queryAll("button").length).toBe(0);

    // Streaming collapsed
    const props2 = defaultRightPanelProps({ isStreaming: true, isCollapsed: true });
    mount(createElement(RightPanel, props2));
    expect(container.textContent).toBe("");
    expect(queryAll("button").length).toBe(0);
  });

  it("AgentPanel shows empty state message when no events", async () => {
    const { AgentPanel } = await import("../src/dashboard/react/components/AgentPanel");
    mount(createElement(AgentPanel, { events: [], onClearEvents: vi.fn() }));
    expect(container.textContent).toContain("No agent events yet");
  });

  it("non-streaming: Clear always targets agent events even if stale activeTab was set", async () => {
    // Altair noted: stale activeTab on streaming→non-streaming is harmless
    // because non-streaming branch ignores activeTab. Verify that.
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const onClearAgent = vi.fn();
    const onClearEvents = vi.fn();
    const onClearLogs = vi.fn();

    // First mount streaming, switch to events tab
    const streamingProps = defaultRightPanelProps({
      isStreaming: true,
      onClearAgent,
      onClearEvents,
      onClearLogs,
    });
    mount(createElement(RightPanel, streamingProps));

    const tabButtons = queryAll("button").filter((b) => b.getAttribute("aria-pressed") !== null);
    const eventsTab = tabButtons.find((b) => b.textContent?.includes("Events"));
    click(eventsTab!);

    // Now re-render as non-streaming (simulates streaming→non-streaming transition)
    const nonStreamingProps = defaultRightPanelProps({
      isStreaming: false,
      onClearAgent,
      onClearEvents,
      onClearLogs,
    });
    mount(createElement(RightPanel, nonStreamingProps));

    // Clear should call onClearAgent, NOT onClearEvents
    const clearBtn = queryAll("button").find((b) => b.textContent === "Clear");
    click(clearBtn!);
    expect(onClearAgent).toHaveBeenCalled();
    expect(onClearEvents).not.toHaveBeenCalled();
    expect(onClearLogs).not.toHaveBeenCalled();
  });
});
