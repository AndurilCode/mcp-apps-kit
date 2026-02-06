/**
 * TASK-020: Testing Status Badge
 *
 * Tests that verify:
 * - New statusDotTesting style with white pulsing dot
 * - Pulse keyframe in keyframes.css (scale 1→1.5→1, opacity, 1.5s infinite)
 * - Testing status activates when agentEvents array length increases
 * - 60-second idle timer transitions back to Connected
 * - New agent events reset the 60-second timer
 * - No streaming gradient wrapper when testing
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { styles } from "../src/dashboard/react/styles";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read a source file relative to the inspector package root */
function readSource(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "..", relPath), "utf-8");
}

// ==========================================================================
// AC-1: statusDotTesting style — white pulsing dot
// ==========================================================================

describe("AC: statusDotTesting style", () => {
  it("exists in the styles export", () => {
    expect(styles.statusDotTesting).toBeDefined();
  });

  it("has white (#ffffff) background color", () => {
    expect(styles.statusDotTesting.backgroundColor).toBe("#ffffff");
  });

  it("uses pulse animation at 1.5s infinite", () => {
    const animation = styles.statusDotTesting.animation as string;
    expect(animation).toContain("pulse");
    expect(animation).toContain("1.5s");
    expect(animation).toContain("infinite");
  });

  it("does NOT have a boxShadow (unlike streaming dot)", () => {
    expect(styles.statusDotTesting.boxShadow).toBeUndefined();
  });
});

// ==========================================================================
// AC: Pulse keyframe in keyframes.css
// ==========================================================================

describe("AC: pulse keyframe in keyframes.css", () => {
  const css = readSource("src/dashboard/react/keyframes.css");

  it("defines @keyframes pulse", () => {
    expect(css).toContain("@keyframes pulse");
  });

  it("has scale(1) at 0% and 100%", () => {
    // Match the start/end frames
    expect(css).toMatch(/0%[\s\S]*transform:\s*scale\(1\)/);
    expect(css).toMatch(/100%[\s\S]*transform:\s*scale\(1\)/);
  });

  it("has scale(1.5) at 50%", () => {
    expect(css).toMatch(/50%[\s\S]*transform:\s*scale\(1\.5\)/);
  });

  it("has opacity: 1 at start/end", () => {
    // The 0%,100% block should have opacity: 1
    const pulseBlock = css.slice(
      css.indexOf("@keyframes pulse"),
      css.indexOf("}", css.indexOf("}", css.indexOf("@keyframes pulse")) + 1) + 1
    );
    expect(pulseBlock).toContain("opacity: 1");
  });

  it("has reduced opacity at 50%", () => {
    // The 50% block should have opacity less than 1
    const pulseBlock = css.slice(css.indexOf("@keyframes pulse"));
    const fiftyBlock = pulseBlock.slice(
      pulseBlock.indexOf("50%"),
      pulseBlock.indexOf("}", pulseBlock.indexOf("50%")) + 1
    );
    expect(fiftyBlock).toMatch(/opacity:\s*0\.\d/);
  });
});

// ==========================================================================
// AC: InspectorDashboard — Testing status logic
// ==========================================================================

describe("AC: InspectorDashboard testing status integration", () => {
  const dashboardSrc = readSource("src/dashboard/react/InspectorDashboard.tsx");

  it("declares isTesting state", () => {
    expect(dashboardSrc).toContain("useState(false)");
    expect(dashboardSrc).toMatch(/const\s+\[isTesting,\s+setIsTesting\]/);
  });

  it("tracks previous agentEvents length via ref", () => {
    expect(dashboardSrc).toContain("prevAgentEventsLengthRef");
    expect(dashboardSrc).toMatch(/useRef\s*<?\s*\(?\s*0\s*\)?/);
  });

  it("stores testing timer in a ref for cleanup", () => {
    expect(dashboardSrc).toContain("testingTimerRef");
  });

  it("activates testing when agentEvents length increases", () => {
    // Should check curLen > prevLen
    expect(dashboardSrc).toContain("curLen > prevLen");
    expect(dashboardSrc).toContain("setIsTesting(true)");
  });

  it("uses 60-second (60000ms) idle timer", () => {
    expect(dashboardSrc).toContain("60_000");
    // Timer sets isTesting to false
    expect(dashboardSrc).toMatch(/setTimeout\(\s*\(\)\s*=>\s*\{[^}]*setIsTesting\(false\)/);
  });

  it("resets timer on each new agent event", () => {
    // Should clearTimeout before setting a new one
    expect(dashboardSrc).toMatch(
      /clearTimeout\(testingTimerRef\.current\)[\s\S]*?testingTimerRef\.current\s*=\s*setTimeout/
    );
  });

  it("resets testing state when activeConnectionId changes", () => {
    // Should reset isTesting, prevLength ref, and clear timer on connection change
    // Use individual checks since the useEffect body spans multiple braces
    expect(dashboardSrc).toContain("setIsTesting(false)");
    expect(dashboardSrc).toContain("prevAgentEventsLengthRef.current = 0");
    // The reset effect depends on activeConnectionId
    expect(dashboardSrc).toMatch(/setIsTesting\(false\)[\s\S]*?\[activeConnectionId\]/);
  });

  it("cleans up timer on unmount", () => {
    // Should have a cleanup effect that clears the timer
    expect(dashboardSrc).toMatch(
      /useEffect\(\(\)\s*=>\s*\{\s*return\s*\(\)\s*=>\s*\{[^}]*clearTimeout\(testingTimerRef\.current\)/s
    );
  });
});

// ==========================================================================
// AC: Status badge renders Testing label with correct dot style
// ==========================================================================

describe("AC: Status badge rendering", () => {
  const dashboardSrc = readSource("src/dashboard/react/InspectorDashboard.tsx");

  it("computes isTestingActive from isTesting and connection status", () => {
    expect(dashboardSrc).toContain("isTestingActive");
    expect(dashboardSrc).toMatch(/isTesting\s*&&\s*activeConnection\?\.status\s*===\s*"connected"/);
  });

  it("renders 'Testing' label when isTestingActive", () => {
    expect(dashboardSrc).toMatch(/isTestingActive\s*\?\s*"Testing"/);
  });

  it("applies statusDotTesting style when isTestingActive", () => {
    expect(dashboardSrc).toMatch(/isTestingActive\s*\?\s*styles\.statusDotTesting/);
  });

  it("suppresses streaming gradient wrapper when testing is active", () => {
    // The wrapper should NOT apply statusWrapperStreaming when testing
    expect(dashboardSrc).toMatch(
      /isStreaming\s*&&\s*!isTestingActive\s*\?\s*styles\.statusWrapperStreaming/
    );
  });

  it("Testing takes priority over Streaming label", () => {
    // In the label ternary, isTestingActive comes first
    const labelMatch = dashboardSrc.match(
      /\{isTestingActive\s*\?\s*"Testing"\s*:\s*status\s*===\s*"streaming"\s*\?\s*"Streaming"/
    );
    expect(labelMatch).not.toBeNull();
  });

  it("Testing dot takes priority over streaming dot", () => {
    // In the dot style ternary, isTestingActive comes first
    const dotMatch = dashboardSrc.match(
      /isTestingActive\s*\?\s*styles\.statusDotTesting\s*:\s*status\s*===\s*"streaming"/
    );
    expect(dotMatch).not.toBeNull();
  });
});

// ==========================================================================
// AC: Timer behavior (unit test with fake timers)
// ==========================================================================

describe("AC: 60-second idle timer behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("60_000ms timer fires and calls the callback", () => {
    const callback = vi.fn();
    const timer = setTimeout(callback, 60_000);

    // Not yet
    vi.advanceTimersByTime(59_999);
    expect(callback).not.toHaveBeenCalled();

    // Now
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);

    clearTimeout(timer);
  });

  it("clearTimeout prevents the callback from firing", () => {
    const callback = vi.fn();
    const timer = setTimeout(callback, 60_000);
    clearTimeout(timer);

    vi.advanceTimersByTime(120_000);
    expect(callback).not.toHaveBeenCalled();
  });

  it("resetting the timer extends the deadline", () => {
    const callback = vi.fn();
    let timer = setTimeout(callback, 60_000);

    // Advance 30s, then reset
    vi.advanceTimersByTime(30_000);
    expect(callback).not.toHaveBeenCalled();

    clearTimeout(timer);
    timer = setTimeout(callback, 60_000);

    // Another 30s (60s total from start, but only 30s from reset)
    vi.advanceTimersByTime(30_000);
    expect(callback).not.toHaveBeenCalled();

    // Complete the remaining 30s
    vi.advanceTimersByTime(30_000);
    expect(callback).toHaveBeenCalledTimes(1);

    clearTimeout(timer);
  });

  it("multiple rapid resets keep deferring the callback", () => {
    const callback = vi.fn();
    let timer = setTimeout(callback, 60_000);

    // Simulate 5 rapid events, each 10s apart — each resets the 60s timer
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(10_000);
      clearTimeout(timer);
      timer = setTimeout(callback, 60_000);
    }

    // 50s elapsed from start, but timer was last reset at t=50s
    // So at t=109s it should NOT have fired
    vi.advanceTimersByTime(59_000);
    expect(callback).not.toHaveBeenCalled();

    // At t=110s (60s after last reset at t=50s) it fires
    vi.advanceTimersByTime(1_000);
    expect(callback).toHaveBeenCalledTimes(1);

    clearTimeout(timer);
  });
});

// ==========================================================================
// Edge cases: source-level verification of guards and cleanup
// ==========================================================================

describe("Edge: testing activation guards and cleanup", () => {
  const dashboardSrc = readSource("src/dashboard/react/InspectorDashboard.tsx");

  it("requires curLen > 0 to prevent activation on empty arrays", () => {
    // The condition is `curLen > prevLen && curLen > 0`
    // This prevents false activation when both are 0 (initial mount)
    expect(dashboardSrc).toContain("curLen > prevLen && curLen > 0");
  });

  it("uses agentEvents.length as the useEffect dependency", () => {
    // The effect watching for new events depends on agentEvents.length
    expect(dashboardSrc).toMatch(/\}, \[agentEvents\.length\]\);/);
  });

  it("timer callback nullifies the ref after firing", () => {
    // After setIsTesting(false), the callback also sets ref to null
    expect(dashboardSrc).toMatch(/setIsTesting\(false\);\s*\n\s*testingTimerRef\.current = null;/);
  });

  it("connection reset effect nullifies the timer ref", () => {
    // When activeConnectionId changes, timer ref is set to null
    expect(dashboardSrc).toMatch(
      /clearTimeout\(testingTimerRef\.current\);\s*\n\s*testingTimerRef\.current = null;\s*\n\s*\}\s*\n\s*\}, \[activeConnectionId\]\)/
    );
  });

  it("isTestingActive requires both isTesting AND connected status", () => {
    // Verify the exact boolean expression
    expect(dashboardSrc).toMatch(
      /const isTestingActive = isTesting && activeConnection\?\.status === "connected"/
    );
  });
});

// ==========================================================================
// Edge: statusDotTesting animation includes ease-in-out timing
// ==========================================================================

describe("Edge: statusDotTesting animation timing function", () => {
  it("uses ease-in-out timing function", () => {
    const animation = styles.statusDotTesting.animation as string;
    expect(animation).toContain("ease-in-out");
  });

  it("full animation shorthand is correct", () => {
    const animation = styles.statusDotTesting.animation as string;
    expect(animation).toBe("pulse 1.5s ease-in-out infinite");
  });
});
