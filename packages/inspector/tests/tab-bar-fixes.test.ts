/**
 * TASK-018: Tab Bar — Name Display, Lock Persistence & Background
 *
 * Tests for:
 * 1. Single-line tab display (name or URL, not both)
 * 2. isOAuth flag survives connection list refreshes
 * 3. Lock emoji replaced with SVG LockIcon
 * 4. Tab bar background color matches side panels (#0d0e0e)
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Helpers — read source files once, cache for the suite
// ---------------------------------------------------------------------------

import fs from "node:fs";
import nodePath from "node:path";

const tabBarSrc = fs.readFileSync(
  nodePath.resolve(__dirname, "../src/dashboard/react/components/TabBar.tsx"),
  "utf-8"
);
const toolbarSrc = fs.readFileSync(
  nodePath.resolve(__dirname, "../src/dashboard/react/components/Toolbar.tsx"),
  "utf-8"
);
const useConnectionsSrc = fs.readFileSync(
  nodePath.resolve(__dirname, "../src/dashboard/react/hooks/useConnections.ts"),
  "utf-8"
);

import type { TabInfo } from "../src/dashboard/react/components/TabBar";

// Reusable title computation matching the component's ?? chain
function computeTitle(tab: TabInfo): string {
  return tab.serverInfo?.name ?? tab.url ?? "Unknown";
}

describe("TASK-018: TabBar fixes", () => {
  // -----------------------------------------------------------------------
  // Background color
  // -----------------------------------------------------------------------
  describe("tabBarStyles.container.backgroundColor", () => {
    it("should be #0d0e0e (matching side panels)", () => {
      expect(tabBarSrc).toContain('backgroundColor: "#0d0e0e"');
      expect(tabBarSrc).not.toContain('backgroundColor: "#111111"');
    });

    it("should only define one backgroundColor in the container style", () => {
      // Guard against accidental duplicate / conflicting background colors
      const matches = tabBarSrc.match(/backgroundColor:\s*"#[0-9a-fA-F]+"/g) ?? [];
      // container has one, tab has one, tabActive has one — assert the exact list
      const colors = matches.map((m) => m.match(/"(#[^"]+)"/)?.[1]);
      expect(colors.filter((c) => c === "#0d0e0e")).toHaveLength(1);
      expect(colors).not.toContain("#111111");
    });
  });

  // -----------------------------------------------------------------------
  // Single-line tab display
  // -----------------------------------------------------------------------
  describe("single-line tab display", () => {
    it("should NOT render a secondary URL line in the source", () => {
      // The old code had a tabUrl style and rendered {tab.url} in a second div
      expect(tabBarSrc).not.toContain("tabUrl");
      expect(tabBarSrc).not.toMatch(/tabBarStyles\.tabUrl/);
    });

    it("title logic: uses serverInfo.name when available", () => {
      const tab: TabInfo = {
        id: "1",
        url: "http://localhost:3000",
        serverInfo: { name: "My Server", version: "1.0" },
        status: "connected",
      };
      expect(computeTitle(tab)).toBe("My Server");
    });

    it("title logic: falls back to URL when no serverInfo.name", () => {
      const tab: TabInfo = {
        id: "2",
        url: "http://localhost:3000",
        serverInfo: null,
        status: "connected",
      };
      expect(computeTitle(tab)).toBe("http://localhost:3000");
    });

    it("title logic: uses empty string when URL is empty (not Unknown)", () => {
      // Altair nit fix: previous test name said "Unknown" but asserted "".
      // ?? only checks null/undefined; empty string is intentional — connection exists.
      const tab: TabInfo = {
        id: "3",
        url: "",
        serverInfo: null,
        status: "disconnected",
      };
      expect(computeTitle(tab)).toBe("");
    });

    it("title logic: falls back to Unknown when both name and URL are nullish", () => {
      // Actual Unknown fallback — url is undefined (cast needed, mirrors runtime edge)
      const tab = {
        id: "4",
        url: undefined as unknown as string,
        serverInfo: null,
        status: "disconnected",
      } as TabInfo;
      expect(computeTitle(tab)).toBe("Unknown");
    });

    it("title logic: serverInfo exists but name is undefined", () => {
      // serverInfo present with only version, no name — should fall through to URL
      const tab: TabInfo = {
        id: "5",
        url: "http://localhost:4000",
        serverInfo: { version: "2.0" },
        status: "connected",
      };
      expect(computeTitle(tab)).toBe("http://localhost:4000");
    });

    it("title logic: serverInfo.name is empty string", () => {
      // Empty name = truthy-ish for ??, so it stays as empty string
      const tab: TabInfo = {
        id: "6",
        url: "http://localhost:5000",
        serverInfo: { name: "", version: "1.0" },
        status: "connected",
      };
      expect(computeTitle(tab)).toBe("");
    });

    it("source renders title via the ?? fallback chain", () => {
      // Verify the component actually uses the ?? chain we're testing
      expect(tabBarSrc).toMatch(/tab\.serverInfo\?\.name\s*\?\?\s*tab\.url\s*\?\?\s*"Unknown"/);
    });

    it("tab.url is used only as a hover tooltip, not a visible line", () => {
      // URL should appear as a title attribute for hover inspection
      expect(tabBarSrc).toContain("title={tab.url}");
      // Count occurrences of {tab.url} — should be exactly 1 (the title attr)
      const occurrences = tabBarSrc.match(/\{tab\.url\}/g) ?? [];
      expect(occurrences).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // SVG LockIcon (replaces 🔒 emoji)
  // -----------------------------------------------------------------------
  describe("LockIcon SVG", () => {
    it("should use SVG lock icon instead of emoji", () => {
      expect(tabBarSrc).not.toContain("🔒");
      expect(tabBarSrc).toContain("function LockIcon()");
      expect(tabBarSrc).toContain("<LockIcon />");
      expect(tabBarSrc).toContain('viewBox="0 0 24 24"');
      expect(tabBarSrc).toContain('aria-label="OAuth authenticated"');
    });

    it("SVG path elements match Toolbar.tsx lock icon", () => {
      // Both should use the same rect and path for the lock shape
      const rectPattern = '<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />';
      const pathPattern = '<path d="M7 11V7a5 5 0 0 1 10 0v4" />';
      expect(tabBarSrc).toContain(rectPattern);
      expect(tabBarSrc).toContain(pathPattern);
      expect(toolbarSrc).toContain(rectPattern);
      expect(toolbarSrc).toContain(pathPattern);
    });

    it("SVG stroke attributes match Toolbar.tsx", () => {
      // Both should share fill, stroke, strokeWidth, linecap, linejoin
      for (const attr of [
        'fill="none"',
        'stroke="currentColor"',
        'strokeWidth="2"',
        'strokeLinecap="round"',
        'strokeLinejoin="round"',
      ]) {
        expect(tabBarSrc).toContain(attr);
        expect(toolbarSrc).toContain(attr);
      }
    });

    it("TabBar lock icon is sized smaller than Toolbar (12px vs 16px)", () => {
      // Tab bar uses 12px for compact display; Toolbar uses 16px
      const tabBarLock = tabBarSrc.match(/function LockIcon[\s\S]*?<\/svg>/)?.[0] ?? "";
      const toolbarLock = toolbarSrc.match(/function LockIcon[\s\S]*?<\/svg>/)?.[0] ?? "";

      expect(tabBarLock).toContain('width="12"');
      expect(tabBarLock).toContain('height="12"');
      expect(toolbarLock).toContain('width="16"');
      expect(toolbarLock).toContain('height="16"');
    });

    it("lock icon has accessible title attribute on wrapper span", () => {
      expect(tabBarSrc).toContain('title="OAuth authenticated"');
    });
  });

  // -----------------------------------------------------------------------
  // isOAuth persistence across refresh
  // -----------------------------------------------------------------------
  describe("isOAuth flag persistence in useConnections", () => {
    it("refresh should preserve isOAuth from previous state", () => {
      expect(useConnectionsSrc).toContain("isOAuth: existing.isOAuth");
      expect(useConnectionsSrc).toMatch(/setConnections\(\(prev\)/);
      expect(useConnectionsSrc).toContain("prevMap");
    });

    it("normalizeConnection should NOT set isOAuth (API doesn't return it)", () => {
      const normalizeMatch = useConnectionsSrc.match(/function normalizeConnection[\s\S]*?^}/m);
      expect(normalizeMatch).toBeTruthy();
      const normalizeFn = normalizeMatch![0];
      expect(normalizeFn).not.toContain("isOAuth");
    });

    it("reconnectConnection sets isOAuth: true", () => {
      expect(useConnectionsSrc).toContain("isOAuth: true");
    });

    it("new connections from API (not in prevMap) do NOT get isOAuth", () => {
      // When a connection appears in the API response that wasn't in prev state,
      // it should NOT inherit isOAuth — only the ternary else branch applies
      // Verify the conditional structure: existing ? merge : plain
      expect(useConnectionsSrc).toMatch(
        /existing\s*\?\s*\{[^}]*isOAuth:\s*existing\.isOAuth[^}]*\}\s*:\s*c/
      );
    });

    it("prevMap is built from the Map constructor with id keys", () => {
      // Ensures O(1) lookup per connection instead of O(n) array scan
      expect(useConnectionsSrc).toContain("new Map(prev.map");
      expect(useConnectionsSrc).toMatch(/\[c\.id,\s*c\]/);
    });
  });

  // -----------------------------------------------------------------------
  // Tab accessibility
  // -----------------------------------------------------------------------
  describe("tab accessibility", () => {
    it("tabs have role=tab and aria-selected", () => {
      expect(tabBarSrc).toContain('role="tab"');
      expect(tabBarSrc).toContain("aria-selected={isActive}");
    });

    it("tabs are keyboard-navigable (Enter and Space)", () => {
      expect(tabBarSrc).toContain("onKeyDown");
      expect(tabBarSrc).toContain('"Enter"');
      expect(tabBarSrc).toContain('" "');
    });

    it("close button has aria-label", () => {
      expect(tabBarSrc).toContain('aria-label="Close tab"');
    });
  });

  // -----------------------------------------------------------------------
  // Style structure: Altair nit — flexShrink on non-flex child
  // -----------------------------------------------------------------------
  describe("style structure", () => {
    it("lockIcon.flexShrink is set (inline layout intent)", () => {
      // Altair nit: flexShrink: 0 on lockIcon span is a no-op because tabTitle
      // parent doesn't have display: flex. However, the span uses inline layout
      // so this is harmless — documenting the current state.
      expect(tabBarSrc).toMatch(/lockIcon[\s\S]*?flexShrink:\s*0/);
    });

    it("tabTitle does NOT set display: flex (lockIcon flexShrink is a no-op)", () => {
      // Extract the tabTitle style block to verify no display: flex
      const tabTitleMatch = tabBarSrc.match(/tabTitle:\s*\{([^}]*)\}/);
      expect(tabTitleMatch).toBeTruthy();
      const tabTitleStyle = tabTitleMatch![1];
      expect(tabTitleStyle).not.toContain("display");
      // This means lockIcon.flexShrink has no effect — noted for future cleanup
    });

    it("tab style is a flex container (children align correctly)", () => {
      const tabMatch = tabBarSrc.match(/\btab:\s*\{([^}]*)\}/);
      expect(tabMatch).toBeTruthy();
      expect(tabMatch![1]).toContain('display: "flex"');
    });
  });
});
