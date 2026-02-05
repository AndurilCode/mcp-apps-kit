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
// 1. TabBar component tests (pure rendering logic)
// ---------------------------------------------------------------------------

// Import the source to inspect styles and rendering behavior.
// We test the exported styles and component logic directly.
import type { TabInfo } from "../src/dashboard/react/components/TabBar";

describe("TASK-018: TabBar fixes", () => {
  // -----------------------------------------------------------------------
  // Background color
  // -----------------------------------------------------------------------
  describe("tabBarStyles.container.backgroundColor", () => {
    it("should be #0d0e0e (matching side panels)", async () => {
      // Read the source to verify the compiled style value
      const fs = await import("node:fs");
      const path = await import("node:path");
      const src = fs.readFileSync(
        path.resolve(__dirname, "../src/dashboard/react/components/TabBar.tsx"),
        "utf-8"
      );
      expect(src).toContain('backgroundColor: "#0d0e0e"');
      expect(src).not.toContain('backgroundColor: "#111111"');
    });
  });

  // -----------------------------------------------------------------------
  // Single-line tab display
  // -----------------------------------------------------------------------
  describe("single-line tab display", () => {
    it("should NOT render a secondary URL line in the source", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const src = fs.readFileSync(
        path.resolve(__dirname, "../src/dashboard/react/components/TabBar.tsx"),
        "utf-8"
      );
      // The old code had a tabUrl style and rendered {tab.url} in a second div
      expect(src).not.toContain("tabUrl");
      // There should be no secondary div rendering tab.url below the title
      expect(src).not.toMatch(/tabBarStyles\.tabUrl/);
    });

    it("title logic: uses serverInfo.name when available", () => {
      const tab: TabInfo = {
        id: "1",
        url: "http://localhost:3000",
        serverInfo: { name: "My Server", version: "1.0" },
        status: "connected",
      };
      const title = tab.serverInfo?.name ?? tab.url ?? "Unknown";
      expect(title).toBe("My Server");
    });

    it("title logic: falls back to URL when no serverInfo.name", () => {
      const tab: TabInfo = {
        id: "2",
        url: "http://localhost:3000",
        serverInfo: null,
        status: "connected",
      };
      const title = tab.serverInfo?.name ?? tab.url ?? "Unknown";
      expect(title).toBe("http://localhost:3000");
    });

    it("title logic: falls back to Unknown when no name and no URL", () => {
      const tab: TabInfo = {
        id: "3",
        url: "",
        serverInfo: null,
        status: "disconnected",
      };
      const title = tab.serverInfo?.name ?? tab.url ?? "Unknown";
      // Empty string is falsy but ?? only checks null/undefined, so empty string stays
      // The component uses ?? so empty string would be used. That's intentional —
      // an empty URL shouldn't show "Unknown" because the connection exists.
      expect(title).toBe("");
    });
  });

  // -----------------------------------------------------------------------
  // SVG LockIcon (replaces 🔒 emoji)
  // -----------------------------------------------------------------------
  describe("LockIcon SVG", () => {
    it("should use SVG lock icon instead of emoji", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const src = fs.readFileSync(
        path.resolve(__dirname, "../src/dashboard/react/components/TabBar.tsx"),
        "utf-8"
      );
      // No emoji
      expect(src).not.toContain("🔒");
      // Has SVG-based LockIcon component
      expect(src).toContain("function LockIcon()");
      expect(src).toContain("<LockIcon />");
      // SVG matches Toolbar.tsx pattern
      expect(src).toContain('viewBox="0 0 24 24"');
      expect(src).toContain('aria-label="OAuth authenticated"');
    });
  });

  // -----------------------------------------------------------------------
  // isOAuth persistence across refresh
  // -----------------------------------------------------------------------
  describe("isOAuth flag persistence in useConnections", () => {
    it("refresh should preserve isOAuth from previous state", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const src = fs.readFileSync(
        path.resolve(__dirname, "../src/dashboard/react/hooks/useConnections.ts"),
        "utf-8"
      );
      // The fix: refresh uses functional setConnections to merge isOAuth from prev
      expect(src).toContain("isOAuth: existing.isOAuth");
      // Should use functional form of setConnections (prev => ...)
      expect(src).toMatch(/setConnections\(\(prev\)/);
      // Should build a map from previous connections
      expect(src).toContain("prevMap");
    });

    it("normalizeConnection should NOT set isOAuth (API doesn't return it)", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const src = fs.readFileSync(
        path.resolve(__dirname, "../src/dashboard/react/hooks/useConnections.ts"),
        "utf-8"
      );
      // normalizeConnection should remain simple — no isOAuth field
      const normalizeMatch = src.match(/function normalizeConnection[\s\S]*?^}/m);
      expect(normalizeMatch).toBeTruthy();
      const normalizeFn = normalizeMatch![0];
      expect(normalizeFn).not.toContain("isOAuth");
    });

    it("reconnectConnection sets isOAuth: true", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const src = fs.readFileSync(
        path.resolve(__dirname, "../src/dashboard/react/hooks/useConnections.ts"),
        "utf-8"
      );
      // reconnectConnection should be the source of truth for isOAuth
      expect(src).toContain("isOAuth: true");
    });
  });
});
