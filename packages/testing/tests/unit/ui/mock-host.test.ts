/**
 * Unit tests for mock host
 */

import { describe, it, expect } from "vitest";
import { createMockHost } from "../../../src/ui/mock-host";

describe("createMockHost", () => {
  it("should create a mock host with default options", () => {
    // This test requires @mcp-apps-kit/ui to be installed
    try {
      const host = createMockHost();
      expect(host).toBeDefined();
      expect(typeof host.emitToolResult).toBe("function");
      expect(typeof host.getToolCallHistory).toBe("function");
    } catch (error) {
      // Skip test if @mcp-apps-kit/ui is not available
      if (error instanceof Error && error.message.includes("@mcp-apps-kit/ui")) {
        // Test skipped - dependency not available
        return;
      }
      throw error;
    }
  });

  it("should track tool call history", () => {
    // This test requires @mcp-apps-kit/ui to be installed
    try {
      const host = createMockHost();
      const history = host.getToolCallHistory();
      expect(Array.isArray(history)).toBe(true);
    } catch (error) {
      if (error instanceof Error && error.message.includes("@mcp-apps-kit/ui")) {
        return;
      }
      throw error;
    }
  });

  it("should clear history", () => {
    // This test requires @mcp-apps-kit/ui to be installed
    try {
      const host = createMockHost();
      host.clearHistory();
      expect(host.getToolCallHistory()).toHaveLength(0);
    } catch (error) {
      if (error instanceof Error && error.message.includes("@mcp-apps-kit/ui")) {
        return;
      }
      throw error;
    }
  });
});
