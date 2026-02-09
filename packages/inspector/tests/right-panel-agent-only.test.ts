/**
 * RightPanel — Always-Visible Tabs
 *
 * Behavioral tests for the RightPanel:
 * - Always shows three tabs (Agent, Events, Logs) regardless of streaming state
 * - Clear button dispatches based on activeTab via switch
 * - Collapsed panel renders empty div
 *
 * Updated from the previous dual-mode (streaming/non-streaming) design.
 * The `isStreaming` prop has been removed; all three tabs are always visible.
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

// Default props shared across tests (isStreaming removed)
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
// AC-1: Three tabs always visible
// =============================================================================

describe("AC-1: Three tabs always visible (Agent, Events, Logs)", () => {
  it("renders Agent, Events, and Logs tab buttons", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const props = defaultRightPanelProps();
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
    const props = defaultRightPanelProps({ events, agentEvents, logs });
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
// AC-2: isStreaming prop removed from RightPanelProps
// =============================================================================

describe("AC-2: isStreaming prop removed from interface", () => {
  it("RightPanelProps does NOT include isStreaming", async () => {
    // Type-level: the component accepts props without isStreaming.
    // If isStreaming were still required, omitting it would cause a type error.
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const props = defaultRightPanelProps();
    mount(createElement(RightPanel, props));
    expect(container.innerHTML).not.toBe("");
  });
});

// =============================================================================
// AC-3: All three panels accessible via tabs
// =============================================================================

describe("AC-3: All three panels accessible via tabs", () => {
  it("all three panels are accessible", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const agentEvents = [makeAgentEvent("a1")];
    const events = [makeInspectorEvent("e1")];
    const logs = [makeLogEntry("l1")];
    const props = defaultRightPanelProps({ agentEvents, events, logs });
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
// AC-4: Category filter dropdown removed from AgentPanel
// =============================================================================

describe("AC-4: AgentPanel has no category filter dropdown", () => {
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
// AC-5: No localStorage persistence for ACTIVE_TAB_STORAGE_KEY
// =============================================================================

describe("AC-5: localStorage persistence removed for active tab", () => {
  it("does not read from localStorage on mount", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    // Pre-set a value that the OLD code would have read
    window.localStorage.setItem("mcp-dashboard-right-panel-tab", "logs");

    const props = defaultRightPanelProps();
    mount(createElement(RightPanel, props));

    // Should default to "agent" tab, NOT "logs" (ignoring localStorage)
    const tabButtons = queryAll("button").filter((b) => b.getAttribute("aria-pressed") !== null);
    const agentTab = tabButtons.find((b) => b.textContent?.includes("Agent"));
    expect(agentTab!.getAttribute("aria-pressed")).toBe("true");
  });

  it("does not write to localStorage when switching tabs", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const spy = vi.spyOn(window.localStorage, "setItem");

    const props = defaultRightPanelProps();
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
// AC-6: Count badge shows counts on all tabs
// =============================================================================

describe("AC-6: Count badge shows counts on tabs", () => {
  it("shows count badge on Agent tab", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const agentEvents = [makeAgentEvent("a1"), makeAgentEvent("a2")];
    const props = defaultRightPanelProps({ agentEvents });
    mount(createElement(RightPanel, props));

    const tabButtons = queryAll("button").filter((b) => b.getAttribute("aria-pressed") !== null);
    const agentTab = tabButtons.find((b) => b.textContent?.includes("Agent"));
    expect(agentTab).toBeDefined();
    // Tab text should include the count
    expect(agentTab!.textContent).toContain("2");
  });

  it("shows count badges on Events and Logs tabs", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const events = [makeInspectorEvent("e1"), makeInspectorEvent("e2")];
    const logs = [makeLogEntry("l1")];
    const props = defaultRightPanelProps({ events, logs });
    mount(createElement(RightPanel, props));

    const tabButtons = queryAll("button").filter((b) => b.getAttribute("aria-pressed") !== null);
    const eventsTab = tabButtons.find((b) => b.textContent?.includes("Events"));
    const logsTab = tabButtons.find((b) => b.textContent?.includes("Logs"));

    expect(eventsTab!.textContent).toContain("2");
    expect(logsTab!.textContent).toContain("1");
  });
});

// =============================================================================
// AC-7: Clear button dispatches based on activeTab via switch
// =============================================================================

describe("AC-7: Clear button works based on activeTab", () => {
  it("Clear on agent tab calls onClearAgent", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const onClearAgent = vi.fn();
    const props = defaultRightPanelProps({ onClearAgent });
    mount(createElement(RightPanel, props));

    // Default tab is agent
    const clearBtn = queryAll("button").find((b) => b.textContent === "Clear");
    click(clearBtn!);
    expect(onClearAgent).toHaveBeenCalledTimes(1);
  });

  it("Clear on events tab calls onClearEvents", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const onClearEvents = vi.fn();
    const props = defaultRightPanelProps({ onClearEvents });
    mount(createElement(RightPanel, props));

    // Switch to events tab
    const tabButtons = queryAll("button").filter((b) => b.getAttribute("aria-pressed") !== null);
    const eventsTab = tabButtons.find((b) => b.textContent?.includes("Events"));
    click(eventsTab!);

    const clearBtn = queryAll("button").find((b) => b.textContent === "Clear");
    click(clearBtn!);
    expect(onClearEvents).toHaveBeenCalledTimes(1);
  });

  it("Clear on logs tab calls onClearLogs", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const onClearLogs = vi.fn();
    const props = defaultRightPanelProps({ onClearLogs });
    mount(createElement(RightPanel, props));

    // Switch to logs tab
    const tabButtons = queryAll("button").filter((b) => b.getAttribute("aria-pressed") !== null);
    const logsTab = tabButtons.find((b) => b.textContent?.includes("Logs"));
    click(logsTab!);

    const clearBtn = queryAll("button").find((b) => b.textContent === "Clear");
    click(clearBtn!);
    expect(onClearLogs).toHaveBeenCalledTimes(1);
  });

  it("Clear is disabled when handler for active tab is undefined", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");
    const props = defaultRightPanelProps({ onClearAgent: undefined });
    mount(createElement(RightPanel, props));

    const clearBtn = queryAll("button").find((b) => b.textContent === "Clear") as HTMLButtonElement;
    expect(clearBtn).toBeDefined();
    expect(clearBtn!.disabled).toBe(true);
  });
});

// =============================================================================
// EDGE CASES & REGRESSION
// =============================================================================

describe("Edge cases", () => {
  it("collapsed panel renders empty div", async () => {
    const { RightPanel } = await import("../src/dashboard/react/components/RightPanel");

    const props = defaultRightPanelProps({ isCollapsed: true });
    mount(createElement(RightPanel, props));
    expect(container.textContent).toBe("");
    expect(queryAll("button").length).toBe(0);
  });

  it("AgentPanel shows empty state message when no events", async () => {
    const { AgentPanel } = await import("../src/dashboard/react/components/AgentPanel");
    mount(createElement(AgentPanel, { events: [], onClearEvents: vi.fn() }));
    expect(container.textContent).toContain("No agent events yet");
  });
});
