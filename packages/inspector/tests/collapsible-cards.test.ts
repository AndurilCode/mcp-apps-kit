/**
 * TASK-015: Collapsible Primitive Cards
 *
 * Behavioral tests for ToolCard, ResourceCard, and PromptCard collapse/expand:
 * - Default collapsed: shows name + WIDGET badge (if applicable) + expand arrow
 * - Expanded: shows description, parameters, output, annotations, metadata, Copy JSON
 * - Click header toggles state
 * - Reduced padding in collapsed state
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { McpTool, McpResource, McpPrompt } from "../src/dashboard/react/types/mcp-primitives";

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

function queryAll(selector: string): Element[] {
  return Array.from(container.querySelectorAll(selector));
}

function click(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** Find element by data-testid */
function findByTestId(testId: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

/** Find all elements with role="button" and aria-expanded attribute */
function findCardHeaders(): HTMLElement[] {
  return Array.from(container.querySelectorAll('[role="button"][aria-expanded]')) as HTMLElement[];
}

/**
 * Find the AnimatedCollapse wrapper for a card (the div with overflow:hidden + max-height transition).
 * It's the sibling after the card header div.
 */
function findCollapseWrapper(headerTestId: string): HTMLElement | null {
  const header = findByTestId(headerTestId);
  if (!header) return null;
  // The wrapper is the next sibling of the header div
  return header.nextElementSibling as HTMLElement | null;
}

/** Check if an AnimatedCollapse wrapper is visually collapsed */
function isCollapsed(headerTestId: string): boolean {
  const wrapper = findCollapseWrapper(headerTestId);
  if (!wrapper) return true;
  return wrapper.getAttribute("data-collapsed") === "true";
}

// =============================================================================
// TEST DATA FACTORIES
// =============================================================================

function makeTool(overrides: Partial<McpTool> = {}): McpTool {
  return {
    name: "test_tool",
    description: "A test tool description",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
      },
      required: ["query"],
    },
    ...overrides,
  };
}

function makeToolWithUI(overrides: Partial<McpTool> = {}): McpTool {
  return makeTool({
    name: "widget_tool",
    _meta: { ui: { resourceUri: "widget://test" } },
    ...overrides,
  });
}

function makeToolWithOutput(): McpTool {
  return makeTool({
    name: "output_tool",
    outputSchema: {
      type: "object",
      properties: {
        result: { type: "string", description: "The result" },
      },
    },
    annotations: { readOnlyHint: true },
    _meta: { version: "1.0" },
  });
}

function makeResource(overrides: Partial<McpResource> = {}): McpResource {
  return {
    name: "test_resource",
    uri: "file:///test/path.txt",
    description: "A test resource description",
    mimeType: "text/plain",
    ...overrides,
  };
}

function makePrompt(overrides: Partial<McpPrompt> = {}): McpPrompt {
  return {
    name: "test_prompt",
    description: "A test prompt description",
    arguments: [{ name: "topic", description: "The topic to discuss", required: true }],
    ...overrides,
  };
}

/** Default props for McpPrimitivesPanel */
function defaultPanelProps(overrides: Record<string, unknown> = {}) {
  return {
    tools: [] as McpTool[],
    resources: [] as McpResource[],
    prompts: [] as McpPrompt[],
    isLoading: false,
    isVisible: true,
    position: "center" as const,
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
});

afterEach(() => {
  unmount();
  document.body.removeChild(container);
});

// =============================================================================
// AC-1: isExpanded state toggle — default collapsed
// =============================================================================

describe("AC-1: Cards default to collapsed state", () => {
  it("ToolCard renders collapsed by default (aria-expanded=false)", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ tools: [makeTool()] });
    mount(createElement(McpPrimitivesPanel, props));

    const header = findByTestId("tool-card-header-test_tool");
    expect(header).not.toBeNull();
    expect(header!.getAttribute("aria-expanded")).toBe("false");
  });

  it("ResourceCard renders collapsed by default", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ resources: [makeResource()] });
    // Switch to resources tab
    mount(createElement(McpPrimitivesPanel, props));

    const tabButtons = queryAll("button");
    const resourcesTab = tabButtons.find((b) => b.textContent?.includes("Resources"));
    click(resourcesTab!);

    const header = findByTestId("resource-card-header-test_resource");
    expect(header).not.toBeNull();
    expect(header!.getAttribute("aria-expanded")).toBe("false");
  });

  it("PromptCard renders collapsed by default", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ prompts: [makePrompt()] });
    mount(createElement(McpPrimitivesPanel, props));

    const tabButtons = queryAll("button");
    const promptsTab = tabButtons.find((b) => b.textContent?.includes("Prompts"));
    click(promptsTab!);

    const header = findByTestId("prompt-card-header-test_prompt");
    expect(header).not.toBeNull();
    expect(header!.getAttribute("aria-expanded")).toBe("false");
  });
});

// =============================================================================
// AC-2: Collapsed state shows name, WIDGET badge, expand indicator
// =============================================================================

describe("AC-2: Collapsed state shows name + badge + arrow", () => {
  it("collapsed ToolCard shows tool name", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ tools: [makeTool({ name: "my_search" })] });
    mount(createElement(McpPrimitivesPanel, props));

    expect(container.textContent).toContain("my_search");
  });

  it("collapsed ToolCard shows WIDGET badge when tool has UI", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ tools: [makeToolWithUI()] });
    mount(createElement(McpPrimitivesPanel, props));

    expect(container.textContent).toContain("Widget");
  });

  it("collapsed ToolCard does NOT show WIDGET badge when tool has no UI", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ tools: [makeTool({ name: "plain_tool" })] });
    mount(createElement(McpPrimitivesPanel, props));

    // The card area should not contain "Widget"
    const header = findByTestId("tool-card-header-plain_tool");
    expect(header).not.toBeNull();
    expect(header!.textContent).not.toContain("Widget");
  });

  it("collapsed card shows expand indicator arrow (▶)", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ tools: [makeTool()] });
    mount(createElement(McpPrimitivesPanel, props));

    const header = findByTestId("tool-card-header-test_tool");
    expect(header!.textContent).toContain("▶");
  });

  it("collapsed ResourceCard shows resource name", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ resources: [makeResource({ name: "my_file" })] });
    mount(createElement(McpPrimitivesPanel, props));

    const tabButtons = queryAll("button");
    const resourcesTab = tabButtons.find((b) => b.textContent?.includes("Resources"));
    click(resourcesTab!);

    expect(container.textContent).toContain("my_file");
  });

  it("collapsed PromptCard shows prompt name", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ prompts: [makePrompt({ name: "my_prompt" })] });
    mount(createElement(McpPrimitivesPanel, props));

    const tabButtons = queryAll("button");
    const promptsTab = tabButtons.find((b) => b.textContent?.includes("Prompts"));
    click(promptsTab!);

    expect(container.textContent).toContain("my_prompt");
  });
});

// =============================================================================
// AC-3: Collapsed state hides description, params, output, metadata, Copy JSON
// =============================================================================

describe("AC-3: Collapsed state hides detailed content", () => {
  it("collapsed ToolCard hides description", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({
      tools: [makeTool({ description: "UNIQUE_TOOL_DESC_12345" })],
    });
    mount(createElement(McpPrimitivesPanel, props));

    // Content is in DOM but visually hidden via AnimatedCollapse (max-height: 0, overflow: hidden)
    expect(isCollapsed("tool-card-header-test_tool")).toBe(true);
    const wrapper = findCollapseWrapper("tool-card-header-test_tool")!;
    expect(wrapper.style.overflow).toBe("hidden");
  });

  it("collapsed ToolCard hides parameters", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ tools: [makeTool()] });
    mount(createElement(McpPrimitivesPanel, props));

    expect(isCollapsed("tool-card-header-test_tool")).toBe(true);
  });

  it("collapsed ToolCard hides output schema", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ tools: [makeToolWithOutput()] });
    mount(createElement(McpPrimitivesPanel, props));

    expect(isCollapsed("tool-card-header-output_tool")).toBe(true);
  });

  it("collapsed ToolCard hides annotations and metadata", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ tools: [makeToolWithOutput()] });
    mount(createElement(McpPrimitivesPanel, props));

    expect(isCollapsed("tool-card-header-output_tool")).toBe(true);
  });

  it("collapsed ToolCard hides Copy JSON button", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ tools: [makeTool()] });
    mount(createElement(McpPrimitivesPanel, props));

    // Copy JSON is inside AnimatedCollapse — hidden via overflow when collapsed
    expect(isCollapsed("tool-card-header-test_tool")).toBe(true);
    // Copy JSON button exists in DOM but is inside the collapsed wrapper
    const wrapper = findCollapseWrapper("tool-card-header-test_tool")!;
    const copyBtn = wrapper.querySelector("button");
    expect(copyBtn).not.toBeNull();
    expect(copyBtn!.textContent).toBe("Copy JSON");
  });

  it("collapsed ResourceCard hides URI, description, mimeType", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({
      resources: [
        makeResource({
          description: "UNIQUE_RES_DESC_67890",
          uri: "file:///hidden/path.txt",
          mimeType: "application/json",
        }),
      ],
    });
    mount(createElement(McpPrimitivesPanel, props));

    const tabButtons = queryAll("button");
    const resourcesTab = tabButtons.find((b) => b.textContent?.includes("Resources"));
    click(resourcesTab!);

    expect(isCollapsed("resource-card-header-test_resource")).toBe(true);
  });

  it("collapsed PromptCard hides description and arguments", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({
      prompts: [makePrompt({ description: "UNIQUE_PROMPT_DESC_11111" })],
    });
    mount(createElement(McpPrimitivesPanel, props));

    const tabButtons = queryAll("button");
    const promptsTab = tabButtons.find((b) => b.textContent?.includes("Prompts"));
    click(promptsTab!);

    expect(isCollapsed("prompt-card-header-test_prompt")).toBe(true);
  });
});

// =============================================================================
// AC-4: Click header toggles expanded state
// =============================================================================

describe("AC-4: Click header toggles expand/collapse", () => {
  it("clicking collapsed ToolCard header expands it", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({
      tools: [makeTool({ description: "VISIBLE_AFTER_EXPAND" })],
    });
    mount(createElement(McpPrimitivesPanel, props));

    const header = findByTestId("tool-card-header-test_tool")!;
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(isCollapsed("tool-card-header-test_tool")).toBe(true);

    // Click to expand
    click(header);

    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(isCollapsed("tool-card-header-test_tool")).toBe(false);
    expect(container.textContent).toContain("VISIBLE_AFTER_EXPAND");
  });

  it("clicking expanded ToolCard header collapses it", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({
      tools: [makeTool({ description: "NOW_YOU_SEE_ME" })],
    });
    mount(createElement(McpPrimitivesPanel, props));

    const header = findByTestId("tool-card-header-test_tool")!;

    // Expand
    click(header);
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("NOW_YOU_SEE_ME");

    // Collapse
    click(header);
    expect(header.getAttribute("aria-expanded")).toBe("false");
    // After collapsing, the AnimatedCollapse wrapper triggers max-height: 0
    const wrapper = findCollapseWrapper("tool-card-header-test_tool")!;
    expect(wrapper.style.overflow).toBe("hidden");
  });

  it("expanded card shows ▼ indicator, collapsed shows ▶", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ tools: [makeTool()] });
    mount(createElement(McpPrimitivesPanel, props));

    const header = findByTestId("tool-card-header-test_tool")!;

    // Collapsed: ▶
    expect(header.textContent).toContain("▶");
    expect(header.textContent).not.toContain("▼");

    // Expand
    click(header);

    // Expanded: ▼
    expect(header.textContent).toContain("▼");
    expect(header.textContent).not.toContain("▶");
  });

  it("expanded ToolCard shows Copy JSON button", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ tools: [makeTool()] });
    mount(createElement(McpPrimitivesPanel, props));

    const header = findByTestId("tool-card-header-test_tool")!;
    click(header);

    const buttons = queryAll("button");
    const copyBtn = buttons.find((b) => b.textContent === "Copy JSON");
    expect(copyBtn).toBeDefined();
  });

  it("expanded ToolCard shows parameters and output", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ tools: [makeToolWithOutput()] });
    mount(createElement(McpPrimitivesPanel, props));

    const header = findByTestId("tool-card-header-output_tool")!;
    click(header);

    expect(container.textContent).toContain("Parameters");
    expect(container.textContent).toContain("Output");
    expect(container.textContent).toContain("Annotations");
    expect(container.textContent).toContain("Metadata");
  });

  it("clicking ResourceCard header toggles expansion", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({
      resources: [makeResource({ description: "RES_TOGGLE_TEST" })],
    });
    mount(createElement(McpPrimitivesPanel, props));

    const tabButtons = queryAll("button");
    const resourcesTab = tabButtons.find((b) => b.textContent?.includes("Resources"));
    click(resourcesTab!);

    const header = findByTestId("resource-card-header-test_resource")!;
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(isCollapsed("resource-card-header-test_resource")).toBe(true);

    click(header);
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(isCollapsed("resource-card-header-test_resource")).toBe(false);
    expect(container.textContent).toContain("RES_TOGGLE_TEST");
    expect(container.textContent).toContain("file:///test/path.txt");
  });

  it("clicking PromptCard header toggles expansion", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({
      prompts: [makePrompt({ description: "PROMPT_TOGGLE_TEST" })],
    });
    mount(createElement(McpPrimitivesPanel, props));

    const tabButtons = queryAll("button");
    const promptsTab = tabButtons.find((b) => b.textContent?.includes("Prompts"));
    click(promptsTab!);

    const header = findByTestId("prompt-card-header-test_prompt")!;
    expect(header.getAttribute("aria-expanded")).toBe("false");

    click(header);
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("PROMPT_TOGGLE_TEST");
    expect(container.textContent).toContain("Arguments");
  });
});

// =============================================================================
// AC-5: hasToolUI() reused as-is for WIDGET badge
// =============================================================================

describe("AC-5: WIDGET badge uses hasToolUI()", () => {
  it("shows Widget badge for tool with _meta.ui.resourceUri", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const tool = makeTool({
      name: "ui_tool",
      _meta: { ui: { resourceUri: "widget://test" } },
    });
    const props = defaultPanelProps({ tools: [tool] });
    mount(createElement(McpPrimitivesPanel, props));

    const header = findByTestId("tool-card-header-ui_tool")!;
    expect(header.textContent).toContain("Widget");
  });

  it("shows Widget badge for tool with _meta['ui/resourceUri']", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const tool = makeTool({
      name: "alt_ui_tool",
      _meta: { "ui/resourceUri": "widget://alt" },
    });
    const props = defaultPanelProps({ tools: [tool] });
    mount(createElement(McpPrimitivesPanel, props));

    const header = findByTestId("tool-card-header-alt_ui_tool")!;
    expect(header.textContent).toContain("Widget");
  });

  it("no Widget badge for tool without UI meta", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const tool = makeTool({ name: "no_ui_tool", _meta: { version: "1" } });
    const props = defaultPanelProps({ tools: [tool] });
    mount(createElement(McpPrimitivesPanel, props));

    const header = findByTestId("tool-card-header-no_ui_tool")!;
    expect(header.textContent).not.toContain("Widget");
  });

  it("Widget badge visible in BOTH collapsed and expanded states", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ tools: [makeToolWithUI()] });
    mount(createElement(McpPrimitivesPanel, props));

    const header = findByTestId("tool-card-header-widget_tool")!;

    // Collapsed: badge visible
    expect(header.textContent).toContain("Widget");

    // Expanded: badge still visible
    click(header);
    expect(header.textContent).toContain("Widget");
  });

  it("ResourceCard and PromptCard do NOT show Widget badge", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({
      resources: [makeResource()],
      prompts: [makePrompt()],
    });
    mount(createElement(McpPrimitivesPanel, props));

    // Check resources tab
    const tabButtons = queryAll("button");
    const resourcesTab = tabButtons.find((b) => b.textContent?.includes("Resources"));
    click(resourcesTab!);
    const resHeader = findByTestId("resource-card-header-test_resource")!;
    expect(resHeader.textContent).not.toContain("Widget");

    // Check prompts tab
    const promptsTab = queryAll("button").find((b) => b.textContent?.includes("Prompts"));
    click(promptsTab!);
    const promptHeader = findByTestId("prompt-card-header-test_prompt")!;
    expect(promptHeader.textContent).not.toContain("Widget");
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe("Edge cases", () => {
  it("multiple cards can be independently expanded/collapsed", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const tools = [
      makeTool({ name: "tool_a", description: "DESC_A" }),
      makeTool({ name: "tool_b", description: "DESC_B" }),
      makeTool({ name: "tool_c", description: "DESC_C" }),
    ];
    const props = defaultPanelProps({ tools });
    mount(createElement(McpPrimitivesPanel, props));

    const headerA = findByTestId("tool-card-header-tool_a")!;
    const headerB = findByTestId("tool-card-header-tool_b")!;
    const headerC = findByTestId("tool-card-header-tool_c")!;

    // All collapsed
    expect(headerA.getAttribute("aria-expanded")).toBe("false");
    expect(headerB.getAttribute("aria-expanded")).toBe("false");
    expect(headerC.getAttribute("aria-expanded")).toBe("false");

    // Expand only B
    click(headerB);
    expect(headerA.getAttribute("aria-expanded")).toBe("false");
    expect(headerB.getAttribute("aria-expanded")).toBe("true");
    expect(headerC.getAttribute("aria-expanded")).toBe("false");

    // B expanded, A and C collapsed
    expect(isCollapsed("tool-card-header-tool_b")).toBe(false);
    expect(isCollapsed("tool-card-header-tool_a")).toBe(true);
    expect(isCollapsed("tool-card-header-tool_c")).toBe(true);

    // Expand A too
    click(headerA);
    expect(headerA.getAttribute("aria-expanded")).toBe("true");
    expect(headerB.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("DESC_A");
    expect(container.textContent).toContain("DESC_B");
  });

  it("card with no description or params still expands/collapses cleanly", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const tool = makeTool({
      name: "minimal_tool",
      description: undefined,
      inputSchema: undefined,
    });
    const props = defaultPanelProps({ tools: [tool] });
    mount(createElement(McpPrimitivesPanel, props));

    const header = findByTestId("tool-card-header-minimal_tool")!;
    expect(header.getAttribute("aria-expanded")).toBe("false");

    click(header);
    expect(header.getAttribute("aria-expanded")).toBe("true");

    click(header);
    expect(header.getAttribute("aria-expanded")).toBe("false");
  });

  it("header has role='button' for accessibility", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ tools: [makeTool()] });
    mount(createElement(McpPrimitivesPanel, props));

    const headers = findCardHeaders();
    expect(headers.length).toBe(1);
    expect(headers[0].getAttribute("role")).toBe("button");
  });
});

// =============================================================================
// ADDITIONAL EDGE CASES (Polaris — coverage gaps)
// =============================================================================

describe("AC-2 supplement: card name uses sans-serif font", () => {
  it("tool card name element has sans-serif font-family", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ tools: [makeTool({ name: "styled_tool" })] });
    mount(createElement(McpPrimitivesPanel, props));

    // The card name should use the sans-serif font stack
    const header = findByTestId("tool-card-header-styled_tool")!;
    // Walk to the span that contains the tool name text
    const nameEl = Array.from(header.querySelectorAll("span")).find(
      (s) => s.textContent === "styled_tool"
    ) as HTMLElement;
    expect(nameEl).not.toBeNull();
    expect(nameEl!.style.fontFamily).toContain("sans-serif");
  });
});

describe("AC-3 supplement: ResourceCard & PromptCard Copy JSON visibility", () => {
  it("collapsed ResourceCard hides Copy JSON button", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ resources: [makeResource()] });
    mount(createElement(McpPrimitivesPanel, props));

    const tabButtons = queryAll("button");
    const resourcesTab = tabButtons.find((b) => b.textContent?.includes("Resources"));
    click(resourcesTab!);

    // Copy JSON inside collapsed AnimatedCollapse wrapper
    expect(isCollapsed("resource-card-header-test_resource")).toBe(true);
  });

  it("expanded ResourceCard shows Copy JSON button", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ resources: [makeResource()] });
    mount(createElement(McpPrimitivesPanel, props));

    const tabButtons = queryAll("button");
    const resourcesTab = tabButtons.find((b) => b.textContent?.includes("Resources"));
    click(resourcesTab!);

    const header = findByTestId("resource-card-header-test_resource")!;
    click(header);

    const buttons = queryAll("button");
    const copyBtn = buttons.find((b) => b.textContent === "Copy JSON");
    expect(copyBtn).toBeDefined();
  });

  it("collapsed PromptCard hides Copy JSON button", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ prompts: [makePrompt()] });
    mount(createElement(McpPrimitivesPanel, props));

    const tabButtons = queryAll("button");
    const promptsTab = tabButtons.find((b) => b.textContent?.includes("Prompts"));
    click(promptsTab!);

    // Copy JSON inside collapsed AnimatedCollapse wrapper
    expect(isCollapsed("prompt-card-header-test_prompt")).toBe(true);
  });

  it("expanded PromptCard shows Copy JSON button", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ prompts: [makePrompt()] });
    mount(createElement(McpPrimitivesPanel, props));

    const tabButtons = queryAll("button");
    const promptsTab = tabButtons.find((b) => b.textContent?.includes("Prompts"));
    click(promptsTab!);

    const header = findByTestId("prompt-card-header-test_prompt")!;
    click(header);

    const buttons = queryAll("button");
    const copyBtn = buttons.find((b) => b.textContent === "Copy JSON");
    expect(copyBtn).toBeDefined();
  });
});

describe("AC-4 supplement: consistent padding eliminates jump", () => {
  it("card padding stays consistent between collapsed and expanded", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({ tools: [makeTool()] });
    mount(createElement(McpPrimitivesPanel, props));

    const header = findByTestId("tool-card-header-test_tool")!;
    const card = header.parentElement!;

    // Collapsed padding
    const collapsedPadding = card.style.padding;

    // Expand
    click(header);

    // Expanded: same padding (no jump)
    const expandedPadding = card.style.padding;
    expect(expandedPadding).toBe(collapsedPadding);
  });
});

describe("AC-5 supplement: hasToolUI with openai/outputTemplate", () => {
  it("shows Widget badge for tool with openai/outputTemplate", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const tool = makeTool({
      name: "openai_tool",
      _meta: { "openai/outputTemplate": "<div>{{result}}</div>" },
    });
    const props = defaultPanelProps({ tools: [tool] });
    mount(createElement(McpPrimitivesPanel, props));

    const header = findByTestId("tool-card-header-openai_tool")!;
    expect(header.textContent).toContain("Widget");
  });
});

describe("Edge cases: interaction details", () => {
  it("CopyButton click does not collapse the card (stopPropagation)", async () => {
    // Mock clipboard API to prevent jsdom unhandled rejection
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });

    try {
      const { McpPrimitivesPanel } =
        await import("../src/dashboard/react/components/McpPrimitivesPanel");
      const props = defaultPanelProps({
        tools: [makeTool({ description: "STAY_EXPANDED" })],
      });
      mount(createElement(McpPrimitivesPanel, props));

      const header = findByTestId("tool-card-header-test_tool")!;
      // Expand
      click(header);
      expect(header.getAttribute("aria-expanded")).toBe("true");
      expect(container.textContent).toContain("STAY_EXPANDED");

      // Click Copy JSON — card should stay expanded
      const buttons = queryAll("button");
      const copyBtn = buttons.find((b) => b.textContent === "Copy JSON")!;
      expect(copyBtn).toBeDefined();
      click(copyBtn);

      // Card should still be expanded (stopPropagation prevents collapse)
      expect(header.getAttribute("aria-expanded")).toBe("true");
      expect(container.textContent).toContain("STAY_EXPANDED");
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        value: originalClipboard,
        writable: true,
        configurable: true,
      });
    }
  });

  it("rapid double-toggle returns to collapsed state", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const props = defaultPanelProps({
      tools: [makeTool({ description: "RAPID_TEST" })],
    });
    mount(createElement(McpPrimitivesPanel, props));

    const header = findByTestId("tool-card-header-test_tool")!;
    expect(header.getAttribute("aria-expanded")).toBe("false");

    // Rapid: expand then immediately collapse
    click(header);
    click(header);

    expect(header.getAttribute("aria-expanded")).toBe("false");
    // Content hidden via AnimatedCollapse
    expect(isCollapsed("tool-card-header-test_tool")).toBe(true);
  });

  it("expanded ResourceCard shows annotations and metadata when present", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const resource = makeResource({
      annotations: { audience: ["internal"] } as unknown as McpResource["annotations"],
      _meta: { source: "filesystem" },
    });
    const props = defaultPanelProps({ resources: [resource] });
    mount(createElement(McpPrimitivesPanel, props));

    const tabButtons = queryAll("button");
    const resourcesTab = tabButtons.find((b) => b.textContent?.includes("Resources"));
    click(resourcesTab!);

    // Collapsed: hidden via AnimatedCollapse
    expect(isCollapsed("resource-card-header-test_resource")).toBe(true);

    // Expand
    const header = findByTestId("resource-card-header-test_resource")!;
    click(header);

    // Expanded: visible
    expect(isCollapsed("resource-card-header-test_resource")).toBe(false);
    expect(container.textContent).toContain("Annotations");
    expect(container.textContent).toContain("Metadata");
    expect(container.textContent).toContain("filesystem");
  });

  it("expanded PromptCard shows metadata when present", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const prompt = makePrompt({
      _meta: { author: "test-author", version: "2.0" },
    });
    const props = defaultPanelProps({ prompts: [prompt] });
    mount(createElement(McpPrimitivesPanel, props));

    const tabButtons = queryAll("button");
    const promptsTab = tabButtons.find((b) => b.textContent?.includes("Prompts"));
    click(promptsTab!);

    // Collapsed: hidden via AnimatedCollapse
    expect(isCollapsed("prompt-card-header-test_prompt")).toBe(true);

    // Expand
    const header = findByTestId("prompt-card-header-test_prompt")!;
    click(header);

    // Expanded: visible
    expect(isCollapsed("prompt-card-header-test_prompt")).toBe(false);
    expect(container.textContent).toContain("Metadata");
    expect(container.textContent).toContain("test-author");
    expect(container.textContent).toContain("2.0");
  });

  it("tool with only annotations (no desc/params) shows them only when expanded", async () => {
    const { McpPrimitivesPanel } =
      await import("../src/dashboard/react/components/McpPrimitivesPanel");
    const tool = makeTool({
      name: "annotated_only",
      description: undefined,
      inputSchema: undefined,
      annotations: { idempotentHint: true, readOnlyHint: false },
    });
    const props = defaultPanelProps({ tools: [tool] });
    mount(createElement(McpPrimitivesPanel, props));

    // Collapsed: hidden via AnimatedCollapse
    expect(isCollapsed("tool-card-header-annotated_only")).toBe(true);

    // Expand
    const header = findByTestId("tool-card-header-annotated_only")!;
    click(header);

    // Expanded: annotations visible
    expect(container.textContent).toContain("Annotations");
    expect(container.textContent).toContain("idempotentHint");
    expect(container.textContent).toContain("readOnlyHint");
  });
});
