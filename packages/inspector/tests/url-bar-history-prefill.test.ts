/**
 * TASK-019: URL Bar — History Prefill Without Auto-Connect
 *
 * Verifies that selecting a history entry only prefills the URL bar fields
 * and does NOT auto-connect. Connection is triggered only by:
 * - Enter with dropdown closed (handleCreate)
 * - Clicking the connect button
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import ReactDOMClient from "react-dom/client";
import { act } from "react";
import { ConnectionBar } from "../src/dashboard/react/components/ConnectionBar";
import type { ConnectionBarProps } from "../src/dashboard/react/components/ConnectionBar";
import type { ServerHistoryEntry } from "../src/dashboard/react/hooks/useServerHistory";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const httpEntry: ServerHistoryEntry = {
  url: "http://localhost:3000/mcp",
  protocolType: "mcp",
  lastConnected: Date.now(),
  transport: "http",
  name: "Local MCP",
};

const stdioEntry: ServerHistoryEntry = {
  url: "",
  protocolType: "mcp",
  lastConnected: Date.now(),
  transport: "stdio",
  command: "node",
  args: ["server.js", "--port", "3000"],
};

function makeProps(overrides?: Partial<ConnectionBarProps>): ConnectionBarProps {
  return {
    isOpen: true,
    isCreating: false,
    error: null,
    onCreateConnection: vi.fn().mockResolvedValue(true),
    onClose: vi.fn(),
    getMatchingEntries: vi.fn().mockReturnValue([httpEntry, stdioEntry]),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

let container: HTMLDivElement;
let root: ReactDOMClient.Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = ReactDOMClient.createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function renderBar(props: ConnectionBarProps): void {
  act(() => {
    root.render(React.createElement(ConnectionBar, props));
  });
}

/** Retrieve the main URL input (first text input). */
function getUrlInput(): HTMLInputElement {
  const inputs = container.querySelectorAll<HTMLInputElement>('input[type="text"]');
  return inputs[0]!;
}

/** Simulate focus on an element. */
function focusEl(el: HTMLElement): void {
  act(() => {
    el.focus();
    el.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
  });
}

/** Find all dropdown item divs (rendered when dropdown is visible). */
function getDropdownItems(): HTMLElement[] {
  // Dropdown items are inside a div with position: absolute, zIndex 100.
  // Each item has cursor: pointer. Filter out buttons/selects.
  return Array.from(container.querySelectorAll<HTMLElement>("div")).filter((el) => {
    const style = el.getAttribute("style") ?? "";
    return style.includes("cursor: pointer") && !el.closest("button");
  });
}

/** Simulate a click on an element. */
function clickEl(el: HTMLElement): void {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

/** Simulate a keydown event on an element. */
function pressKey(el: HTMLElement, key: string): void {
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

/** Simulate mouseenter on an element. */
function mouseEnter(el: HTMLElement): void {
  act(() => {
    el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("URL Bar — History Prefill Without Auto-Connect", () => {
  describe("handleSelectHistory (click on dropdown item)", () => {
    it("should NOT call onCreateConnection when clicking a history entry", () => {
      const onCreateConnection = vi.fn().mockResolvedValue(true);
      const props = makeProps({ onCreateConnection });
      renderBar(props);

      // Focus input to trigger dropdown
      const input = getUrlInput();
      focusEl(input);

      const items = getDropdownItems();
      expect(items.length).toBeGreaterThan(0);

      clickEl(items[0]!);

      expect(onCreateConnection).not.toHaveBeenCalled();
    });

    it("should prefill HTTP URL when clicking an HTTP history entry", () => {
      const onCreateConnection = vi.fn().mockResolvedValue(true);
      const props = makeProps({
        onCreateConnection,
        getMatchingEntries: vi.fn().mockReturnValue([httpEntry]),
      });
      renderBar(props);

      const input = getUrlInput();
      focusEl(input);

      const items = getDropdownItems();
      expect(items.length).toBeGreaterThan(0);
      clickEl(items[0]!);

      // Should NOT connect
      expect(onCreateConnection).not.toHaveBeenCalled();

      // Input should be prefilled (re-render picks up state)
      // The URL value is set via setState so it's reflected in the input
      expect(input.value).toBe(httpEntry.url);
    });

    it("should prefill stdio fields when clicking a stdio history entry", () => {
      const onCreateConnection = vi.fn().mockResolvedValue(true);
      const props = makeProps({
        onCreateConnection,
        getMatchingEntries: vi.fn().mockReturnValue([stdioEntry]),
      });
      renderBar(props);

      const input = getUrlInput();
      focusEl(input);

      const items = getDropdownItems();
      expect(items.length).toBeGreaterThan(0);
      clickEl(items[0]!);

      expect(onCreateConnection).not.toHaveBeenCalled();

      // Transport should have switched to stdio, so the select value is "stdio"
      const select = container.querySelector("select") as HTMLSelectElement;
      expect(select.value).toBe("stdio");
    });

    it("should be a no-op when isCreating is true", () => {
      const onCreateConnection = vi.fn().mockResolvedValue(true);
      const props = makeProps({ onCreateConnection, isCreating: true });
      renderBar(props);

      const input = getUrlInput();
      focusEl(input);

      const items = getDropdownItems();
      if (items.length > 0) {
        clickEl(items[0]!);
      }

      expect(onCreateConnection).not.toHaveBeenCalled();
    });
  });

  describe("handleKeyDown Enter on dropdown item", () => {
    it("should NOT call onCreateConnection when pressing Enter on a hovered dropdown item", () => {
      const onCreateConnection = vi.fn().mockResolvedValue(true);
      const props = makeProps({ onCreateConnection });
      renderBar(props);

      const input = getUrlInput();
      focusEl(input);

      // Arrow down to hover the first item
      pressKey(input, "ArrowDown");

      // Enter to select it
      pressKey(input, "Enter");

      // onCreateConnection must NOT be called — only prefill
      expect(onCreateConnection).not.toHaveBeenCalled();
    });

    it("should close dropdown when pressing Enter on a hovered item", () => {
      const props = makeProps();
      renderBar(props);

      const input = getUrlInput();
      focusEl(input);

      // Verify dropdown is visible
      let items = getDropdownItems();
      expect(items.length).toBeGreaterThan(0);

      // Arrow down then Enter
      pressKey(input, "ArrowDown");
      pressKey(input, "Enter");

      // Dropdown should be closed
      items = getDropdownItems();
      expect(items.length).toBe(0);
    });

    it("should prefill URL when pressing Enter on a hovered HTTP entry", () => {
      const onCreateConnection = vi.fn().mockResolvedValue(true);
      const props = makeProps({
        onCreateConnection,
        getMatchingEntries: vi.fn().mockReturnValue([httpEntry]),
      });
      renderBar(props);

      const input = getUrlInput();
      focusEl(input);
      pressKey(input, "ArrowDown");
      pressKey(input, "Enter");

      expect(onCreateConnection).not.toHaveBeenCalled();
      expect(input.value).toBe(httpEntry.url);
    });
  });

  describe("connection only via handleCreate or connect button", () => {
    it("should call onCreateConnection when clicking the connect button with a URL", () => {
      const onCreateConnection = vi.fn().mockResolvedValue(true);
      const props = makeProps({
        onCreateConnection,
        getMatchingEntries: vi.fn().mockReturnValue([]),
      });
      renderBar(props);

      const input = getUrlInput();

      // Type a URL
      act(() => {
        // React controlled input: fire change event
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set;
        nativeSetter?.call(input, "http://example.com/mcp");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });

      // Find connect button
      const connectBtn = container.querySelector(
        'button[title="Create connection"]'
      ) as HTMLButtonElement;
      expect(connectBtn).toBeTruthy();

      clickEl(connectBtn);

      // handleCreate fires onCreateConnection
      expect(onCreateConnection).toHaveBeenCalled();
    });

    it("should call onCreateConnection when pressing Enter with dropdown closed", () => {
      const onCreateConnection = vi.fn().mockResolvedValue(true);
      const props = makeProps({
        onCreateConnection,
        getMatchingEntries: vi.fn().mockReturnValue([]),
      });
      renderBar(props);

      const input = getUrlInput();

      // Type a URL
      act(() => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set;
        nativeSetter?.call(input, "http://example.com/mcp");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });

      // Press Enter with no dropdown
      pressKey(input, "Enter");

      // handleCreate should fire
      expect(onCreateConnection).toHaveBeenCalled();
    });

    it("should NOT call onCreateConnection when pressing Enter if dropdown is open with hovered item", () => {
      const onCreateConnection = vi.fn().mockResolvedValue(true);
      const props = makeProps({ onCreateConnection });
      renderBar(props);

      const input = getUrlInput();
      focusEl(input);

      // Dropdown should be open
      const items = getDropdownItems();
      expect(items.length).toBeGreaterThan(0);

      // Hover first item via ArrowDown
      pressKey(input, "ArrowDown");

      // Enter should prefill, NOT connect
      pressKey(input, "Enter");

      expect(onCreateConnection).not.toHaveBeenCalled();
    });
  });
});
