/**
 * Unit tests for protocol detection
 *
 * Tests the detectProtocol() function that auto-detects
 * whether the UI is running in Claude Desktop, ChatGPT, or development mode.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { detectProtocol } from "../../src/index";

describe("detectProtocol", () => {
  const originalWindow = global.window;

  beforeEach(() => {
    // Reset window for each test
    vi.stubGlobal("window", undefined);
  });

  afterEach(() => {
    // Restore original window
    if (originalWindow !== undefined) {
      vi.stubGlobal("window", originalWindow);
    } else {
      vi.unstubAllGlobals();
    }
  });

  describe("server-side (no window)", () => {
    it("should return 'mock' when window is undefined", () => {
      vi.stubGlobal("window", undefined);
      expect(detectProtocol()).toBe("mock");
    });
  });

  describe("ChatGPT detection", () => {
    it("should return 'openai' when window.openai exists", () => {
      const mockWindow = {
        openai: {},
        parent: {},
      };
      vi.stubGlobal("window", mockWindow);
      Object.defineProperty(mockWindow, "parent", { value: mockWindow });

      expect(detectProtocol()).toBe("openai");
    });

    it("should prefer 'openai' over iframe detection", () => {
      const parentWindow = {};
      const mockWindow = {
        openai: {},
        parent: parentWindow, // Different parent (iframe)
      };
      vi.stubGlobal("window", mockWindow);

      expect(detectProtocol()).toBe("openai");
    });
  });

  describe("MCP Apps detection", () => {
    it("should return 'mcp' when in an iframe (parent !== window)", () => {
      const parentWindow = {};
      const mockWindow = {
        parent: parentWindow,
        location: { href: "http://localhost:3000" },
      };
      vi.stubGlobal("window", mockWindow);
      vi.stubGlobal("document", { referrer: "" });

      expect(detectProtocol()).toBe("mcp");
    });
  });

  describe("development/mock mode", () => {
    it("should return 'mock' when not in iframe and no openai object", () => {
      const mockWindow = {
        location: { href: "http://localhost:3000" },
      };
      Object.defineProperty(mockWindow, "parent", { value: mockWindow });
      vi.stubGlobal("window", mockWindow);
      vi.stubGlobal("document", { referrer: "" });

      expect(detectProtocol()).toBe("mock");
    });
  });
});
