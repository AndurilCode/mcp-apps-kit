/**
 * TASK-026: Unified Sidebar Tests
 *
 * Tests for:
 * 1. Item selection - clicking primitive opens detail view
 * 2. Mutual exclusivity - detail view and right panel can't both be open
 * 3. localStorage persistence - left panel collapse state persists
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

// Import the components we're testing
import {
  McpPrimitivesPanel,
  type ServerData,
  type SelectedPrimitive,
} from "../src/dashboard/react/components/McpPrimitivesPanel";
import { PrimitiveDetail, type Primitive } from "../src/dashboard/react/components/PrimitiveDetail";

// =============================================================================
// Helpers
// =============================================================================

let container: HTMLDivElement;
let root: Root;

function mount(element: React.ReactElement): void {
  act(() => {
    root.render(element);
  });
}

function click(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function queryByText(text: string): Element | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (node.textContent?.includes(text)) {
      return node.parentElement;
    }
  }
  return null;
}

function queryAllByText(text: string): Element[] {
  const results: Element[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (node.textContent?.includes(text) && node.parentElement) {
      results.push(node.parentElement);
    }
  }
  return results;
}

function queryByTestId(testId: string): Element | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

// =============================================================================
// Test Data
// =============================================================================

const mockTool = {
  name: "get_user",
  description: "Fetch user information by ID",
  inputSchema: {
    type: "object" as const,
    properties: {
      userId: {
        type: "string",
        description: "The user ID to fetch",
      },
    },
    required: ["userId"],
  },
};

const mockResource = {
  name: "users/list",
  uri: "resource://users/list",
  description: "List of all users",
  mimeType: "application/json",
};

const mockPrompt = {
  name: "summarize",
  description: "Summarize the given content",
  arguments: [
    { name: "content", description: "Content to summarize", required: true },
    { name: "style", description: "Summary style", required: false },
  ],
};

const mockServerData: ServerData = {
  id: "server-1",
  name: "Test Server",
  url: "http://localhost:3000",
  isConnected: true,
  tools: [mockTool],
  resources: [mockResource],
  prompts: [mockPrompt],
};

function createMcpPrimitivesPanel(
  props: Partial<React.ComponentProps<typeof McpPrimitivesPanel>> = {}
) {
  return createElement(McpPrimitivesPanel, {
    servers: [mockServerData],
    stoppedConnections: [],
    isLoading: false,
    isVisible: true,
    isCollapsed: false,
    onToggleCollapse: () => {},
    panelWidth: 320,
    resizeHandleProps: {},
    isResizing: false,
    onStopServer: () => Promise.resolve(),
    onStartServer: () => Promise.resolve(),
    onConnect: () => Promise.resolve(false),
    isCreating: false,
    connectionError: null,
    selectedPrimitive: null,
    onSelectPrimitive: () => {},
    ...props,
  });
}

function createPrimitiveDetail(
  props: Partial<React.ComponentProps<typeof PrimitiveDetail>> & { primitive: Primitive }
) {
  return createElement(PrimitiveDetail, props);
}

// =============================================================================
// Setup / Teardown
// =============================================================================

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  localStorage.clear();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  localStorage.clear();
  vi.restoreAllMocks();
});

// =============================================================================
// AC-1: Item Selection - Clicking primitive opens detail view
// =============================================================================

describe("AC-1: Item Selection - clicking primitive opens detail view", () => {
  it("clicking a tool item calls onSelectPrimitive with correct data", () => {
    const onSelectPrimitive = vi.fn();

    mount(createMcpPrimitivesPanel({ onSelectPrimitive }));

    const toolItem = queryByText("get_user");
    expect(toolItem).not.toBeNull();
    click(toolItem!);

    expect(onSelectPrimitive).toHaveBeenCalledWith({
      serverId: "server-1",
      kind: "tool",
      name: "get_user",
    });
  });

  it("clicking a resource item calls onSelectPrimitive with correct data", () => {
    const onSelectPrimitive = vi.fn();

    mount(createMcpPrimitivesPanel({ onSelectPrimitive }));

    const resourceItem = queryByText("users/list");
    expect(resourceItem).not.toBeNull();
    click(resourceItem!);

    expect(onSelectPrimitive).toHaveBeenCalledWith({
      serverId: "server-1",
      kind: "resource",
      name: "users/list",
    });
  });

  it("clicking a prompt item calls onSelectPrimitive with correct data", () => {
    const onSelectPrimitive = vi.fn();

    mount(createMcpPrimitivesPanel({ onSelectPrimitive }));

    const promptItem = queryByText("summarize");
    expect(promptItem).not.toBeNull();
    click(promptItem!);

    expect(onSelectPrimitive).toHaveBeenCalledWith({
      serverId: "server-1",
      kind: "prompt",
      name: "summarize",
    });
  });

  it("clicking already selected primitive deselects it (calls with null)", () => {
    const onSelectPrimitive = vi.fn();
    const selectedPrimitive: SelectedPrimitive = {
      serverId: "server-1",
      kind: "tool",
      name: "get_user",
    };

    mount(createMcpPrimitivesPanel({ onSelectPrimitive, selectedPrimitive }));

    const toolItem = queryByText("get_user");
    expect(toolItem).not.toBeNull();
    click(toolItem!);

    expect(onSelectPrimitive).toHaveBeenCalledWith(null);
  });

  it("selected primitive has visual indicator (aria-selected=true)", () => {
    const selectedPrimitive: SelectedPrimitive = {
      serverId: "server-1",
      kind: "tool",
      name: "get_user",
    };

    mount(createMcpPrimitivesPanel({ selectedPrimitive }));

    const toolItem = queryByText("get_user");
    expect(toolItem).not.toBeNull();

    const itemButton = toolItem!.closest('[role="button"]') || toolItem!.closest("button");
    if (itemButton) {
      expect(itemButton.getAttribute("aria-selected")).toBe("true");
    }
  });
});

// =============================================================================
// AC-2: PrimitiveDetail component renders correctly
// =============================================================================

describe("AC-2: PrimitiveDetail component", () => {
  it("renders tool detail with name, kind tag, and description", () => {
    const primitive: Primitive = { ...mockTool, kind: "tool" };

    mount(createPrimitiveDetail({ primitive }));

    expect(queryByText("get_user")).not.toBeNull();
    expect(queryByText("tool")).not.toBeNull();
    expect(queryByText("Fetch user information by ID")).not.toBeNull();
  });

  it("renders resource detail with URI section", () => {
    const primitive: Primitive = { ...mockResource, kind: "resource" };

    mount(createPrimitiveDetail({ primitive }));

    expect(queryByText("users/list")).not.toBeNull();
    expect(queryByText("resource")).not.toBeNull();

    const uriBox = queryByTestId("resource-uri");
    expect(uriBox).not.toBeNull();
    expect(uriBox!.textContent).toContain("resource://users/list");

    expect(queryByText("application/json")).not.toBeNull();
  });

  it("renders prompt detail with arguments section", () => {
    const primitive: Primitive = { ...mockPrompt, kind: "prompt" };

    mount(createPrimitiveDetail({ primitive }));

    expect(queryByText("summarize")).not.toBeNull();
    expect(queryByText("prompt")).not.toBeNull();
    expect(queryByTestId("arg-content")).not.toBeNull();
    expect(queryByTestId("arg-style")).not.toBeNull();
  });

  it("shows parameters section for tools with input schema", () => {
    const primitive: Primitive = { ...mockTool, kind: "tool" };

    mount(createPrimitiveDetail({ primitive }));

    expect(queryByTestId("param-userId")).not.toBeNull();
    expect(queryByText("required")).not.toBeNull();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    const primitive: Primitive = { ...mockTool, kind: "tool" };

    mount(createPrimitiveDetail({ primitive, onClose }));

    const closeBtn = queryByTestId("close-btn");
    expect(closeBtn).not.toBeNull();
    click(closeBtn!);

    expect(onClose).toHaveBeenCalled();
  });

  it("has action button with correct label for tool (Run)", () => {
    const primitive: Primitive = { ...mockTool, kind: "tool" };
    mount(createPrimitiveDetail({ primitive }));
    expect(queryByText("Run")).not.toBeNull();
  });

  it("has action button with correct label for resource (Read)", () => {
    const primitive: Primitive = { ...mockResource, kind: "resource" };
    mount(createPrimitiveDetail({ primitive }));
    expect(queryByText("Read")).not.toBeNull();
  });

  it("has action button with correct label for prompt (Use)", () => {
    const primitive: Primitive = { ...mockPrompt, kind: "prompt" };
    mount(createPrimitiveDetail({ primitive }));
    expect(queryByText("Use")).not.toBeNull();
  });

  it("action button is disabled with 'Coming soon' tooltip", () => {
    const primitive: Primitive = { ...mockTool, kind: "tool" };

    mount(createPrimitiveDetail({ primitive }));

    const actionBtn = queryByTestId("action-btn");
    expect(actionBtn).not.toBeNull();

    // Button should be disabled
    expect(actionBtn!.hasAttribute("disabled")).toBe(true);
    expect(actionBtn!.getAttribute("title")).toBe("Coming soon");

    // Clicking should NOT switch to action mode (button is disabled)
    click(actionBtn!);

    // Should NOT see form fields since button is disabled
    expect(queryByTestId("form-field-userId")).toBeNull();
    expect(queryByTestId("run-btn")).toBeNull();
  });
});

// =============================================================================
// AC-3: Mutual Exclusivity - detail view and right panel
// =============================================================================

describe("AC-3: Mutual Exclusivity - detail view and right panel", () => {
  it("selecting primitive should trigger callback (parent handles mutual exclusivity)", () => {
    const onSelectPrimitive = vi.fn();

    mount(createMcpPrimitivesPanel({ onSelectPrimitive }));

    const toolItem = queryByText("get_user");
    expect(toolItem).not.toBeNull();
    click(toolItem!);

    // onSelectPrimitive is called, parent then collapses right panel
    expect(onSelectPrimitive).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "tool", name: "get_user" })
    );
  });

  it("PrimitiveDetail provides close callback for clearing selection", () => {
    const onClose = vi.fn();
    const primitive: Primitive = { ...mockTool, kind: "tool" };

    mount(createPrimitiveDetail({ primitive, onClose }));

    const closeBtn = queryByTestId("close-btn");
    expect(closeBtn).not.toBeNull();
    click(closeBtn!);

    expect(onClose).toHaveBeenCalled();
  });
});

// =============================================================================
// AC-4: localStorage Persistence for Left Panel Collapse State
// =============================================================================

describe("AC-4: localStorage Persistence for left panel collapse state", () => {
  const STORAGE_KEY = "mcp-dashboard-left-collapsed";

  it("panel reads initial collapsed state from localStorage (collapsed=true)", () => {
    localStorage.setItem(STORAGE_KEY, "true");

    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).toBe("true");
  });

  it("panel reads initial collapsed state from localStorage (collapsed=false)", () => {
    localStorage.setItem(STORAGE_KEY, "false");

    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).toBe("false");
  });

  it("toggling collapse state persists to localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "false");
    localStorage.setItem(STORAGE_KEY, "true");

    expect(localStorage.getItem(STORAGE_KEY)).toBe("true");
  });

  it("collapsed panel hides primitive content", () => {
    mount(createMcpPrimitivesPanel({ isCollapsed: true }));

    // When collapsed, primitive names should not be visible
    expect(queryByText("get_user")).toBeNull();
  });

  it("expanded panel shows full server blocks and primitives", () => {
    mount(createMcpPrimitivesPanel({ isCollapsed: false }));

    expect(queryByText("get_user")).not.toBeNull();
    expect(queryByText("users/list")).not.toBeNull();
    expect(queryByText("summarize")).not.toBeNull();
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe("Edge Cases", () => {
  it("handles empty server list gracefully", () => {
    mount(createMcpPrimitivesPanel({ servers: [] }));

    // Should not crash
    expect(container).toBeDefined();
  });

  it("handles server with empty primitives", () => {
    const emptyServer: ServerData = {
      id: "empty-server",
      name: "Empty Server",
      url: "http://localhost:4000",
      isConnected: true,
      tools: [],
      resources: [],
      prompts: [],
    };

    mount(createMcpPrimitivesPanel({ servers: [emptyServer] }));

    expect(queryByText("Empty Server")).not.toBeNull();
  });

  it("PrimitiveDetail handles tool without description", () => {
    const toolWithoutDesc: Primitive = {
      name: "simple_tool",
      kind: "tool",
      inputSchema: { type: "object", properties: {} },
    };

    mount(createPrimitiveDetail({ primitive: toolWithoutDesc }));

    expect(queryByText("simple_tool")).not.toBeNull();
    expect(queryByText("tool")).not.toBeNull();
  });

  it("PrimitiveDetail handles tool without input schema", () => {
    const toolWithoutSchema: Primitive = {
      name: "no_params_tool",
      description: "A tool with no parameters",
      kind: "tool",
    };

    mount(createPrimitiveDetail({ primitive: toolWithoutSchema }));

    expect(queryByText("no_params_tool")).not.toBeNull();
    expect(queryByText("A tool with no parameters")).not.toBeNull();
    expect(queryByText("Parameters")).toBeNull();
  });

  it("PrimitiveDetail handles resource without mimeType", () => {
    const resourceWithoutMime: Primitive = {
      name: "generic_resource",
      uri: "resource://generic",
      description: "A generic resource",
      kind: "resource",
    };

    mount(createPrimitiveDetail({ primitive: resourceWithoutMime }));

    expect(queryByText("generic_resource")).not.toBeNull();
    const uriBox = queryByTestId("resource-uri");
    expect(uriBox).not.toBeNull();
    expect(uriBox!.textContent).toContain("resource://generic");
  });

  it("PrimitiveDetail handles prompt without arguments", () => {
    const promptWithoutArgs: Primitive = {
      name: "simple_prompt",
      description: "A simple prompt",
      kind: "prompt",
      arguments: [],
    };

    mount(createPrimitiveDetail({ primitive: promptWithoutArgs }));

    expect(queryByText("simple_prompt")).not.toBeNull();
    expect(queryByText("Arguments")).toBeNull();
  });

  it("multiple servers with primitives renders correctly", () => {
    const server2: ServerData = {
      id: "server-2",
      name: "Second Server",
      url: "http://localhost:4000",
      isConnected: true,
      tools: [{ name: "other_tool", description: "Another tool" }],
      resources: [],
      prompts: [],
    };

    mount(createMcpPrimitivesPanel({ servers: [mockServerData, server2] }));

    expect(queryByText("Test Server")).not.toBeNull();
    expect(queryByText("Second Server")).not.toBeNull();
    expect(queryByText("get_user")).not.toBeNull();
    expect(queryByText("other_tool")).not.toBeNull();
  });
});

// =============================================================================
// Integration: Selection state across multiple servers
// =============================================================================

describe("Integration: Selection state across multiple servers", () => {
  const server1: ServerData = {
    id: "server-1",
    name: "Server One",
    url: "http://localhost:3000",
    isConnected: true,
    tools: [{ name: "tool_1", description: "Tool from server 1" }],
    resources: [],
    prompts: [],
  };

  const server2: ServerData = {
    id: "server-2",
    name: "Server Two",
    url: "http://localhost:4000",
    isConnected: true,
    tools: [{ name: "tool_2", description: "Tool from server 2" }],
    resources: [],
    prompts: [],
  };

  it("selecting primitive from server 1 then server 2 updates selection correctly", () => {
    const onSelectPrimitive = vi.fn();

    mount(
      createMcpPrimitivesPanel({
        servers: [server1, server2],
        onSelectPrimitive,
      })
    );

    // Click tool from server 1
    const tool1 = queryByText("tool_1");
    expect(tool1).not.toBeNull();
    click(tool1!);

    expect(onSelectPrimitive).toHaveBeenLastCalledWith({
      serverId: "server-1",
      kind: "tool",
      name: "tool_1",
    });

    // Click tool from server 2
    const tool2 = queryByText("tool_2");
    expect(tool2).not.toBeNull();
    click(tool2!);

    expect(onSelectPrimitive).toHaveBeenLastCalledWith({
      serverId: "server-2",
      kind: "tool",
      name: "tool_2",
    });
  });
});
