/**
 * Unit tests for utility functions
 *
 * Tests the theme and style utility functions.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  applyDocumentTheme,
  getDocumentTheme,
  applyHostStyleVariables,
  applyHostFonts,
  removeHostFonts,
  clearHostStyleVariables,
} from "../../src/utils";

describe("theme utilities", () => {
  beforeEach(() => {
    // Reset document state
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.removeAttribute("data-theme");
  });

  describe("applyDocumentTheme", () => {
    it("should apply light theme", () => {
      applyDocumentTheme("light");

      expect(document.documentElement.classList.contains("light")).toBe(true);
      expect(document.documentElement.classList.contains("dark")).toBe(false);
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });

    it("should apply dark theme", () => {
      applyDocumentTheme("dark");

      expect(document.documentElement.classList.contains("dark")).toBe(true);
      expect(document.documentElement.classList.contains("light")).toBe(false);
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("should remove previous theme class when switching", () => {
      applyDocumentTheme("light");
      applyDocumentTheme("dark");

      expect(document.documentElement.classList.contains("dark")).toBe(true);
      expect(document.documentElement.classList.contains("light")).toBe(false);
    });

    it("should handle os theme based on system preference", () => {
      // Mock matchMedia for JSDOM
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: query === "(prefers-color-scheme: dark)" ? false : true,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      applyDocumentTheme("os");

      // Should resolve to light since our mock doesn't match dark mode
      expect(document.documentElement.classList.contains("light")).toBe(true);
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
  });

  describe("getDocumentTheme", () => {
    it("should return light when no theme is set", () => {
      expect(getDocumentTheme()).toBe("light");
    });

    it("should return the theme from data-theme attribute", () => {
      document.documentElement.setAttribute("data-theme", "dark");
      expect(getDocumentTheme()).toBe("dark");

      document.documentElement.setAttribute("data-theme", "light");
      expect(getDocumentTheme()).toBe("light");
    });

    it("should return the theme from class if no data-theme attribute", () => {
      document.documentElement.classList.add("dark");
      expect(getDocumentTheme()).toBe("dark");
    });

    it("should prefer data-theme over class", () => {
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-theme", "light");

      expect(getDocumentTheme()).toBe("light");
    });
  });
});

describe("style utilities", () => {
  const FONT_STYLE_ID = "mcp-apps-host-fonts";

  beforeEach(() => {
    // Reset document state
    const fontStyle = document.getElementById(FONT_STYLE_ID);
    if (fontStyle) {
      fontStyle.remove();
    }
    // Clear any custom properties
    document.documentElement.style.cssText = "";
  });

  afterEach(() => {
    // Cleanup
    const fontStyle = document.getElementById(FONT_STYLE_ID);
    if (fontStyle) {
      fontStyle.remove();
    }
    document.documentElement.style.cssText = "";
  });

  describe("applyHostStyleVariables", () => {
    it("should apply CSS custom properties to document root", () => {
      const variables = {
        "--primary-color": "#007bff",
        "--secondary-color": "#6c757d",
      };

      applyHostStyleVariables(variables);

      expect(document.documentElement.style.getPropertyValue("--primary-color")).toBe("#007bff");
      expect(document.documentElement.style.getPropertyValue("--secondary-color")).toBe("#6c757d");
    });

    it("should add -- prefix if not present", () => {
      const variables = {
        "font-size": "16px",
      };

      applyHostStyleVariables(variables);

      expect(document.documentElement.style.getPropertyValue("--font-size")).toBe("16px");
    });

    it("should handle empty variables object", () => {
      expect(() => applyHostStyleVariables({})).not.toThrow();
    });
  });

  describe("clearHostStyleVariables", () => {
    it("should remove specified CSS custom properties", () => {
      // First set some variables
      applyHostStyleVariables({
        "--primary-color": "#007bff",
        "--secondary-color": "#6c757d",
      });

      // Then clear them
      clearHostStyleVariables({
        "--primary-color": "#007bff",
      });

      expect(document.documentElement.style.getPropertyValue("--primary-color")).toBe("");
      expect(document.documentElement.style.getPropertyValue("--secondary-color")).toBe("#6c757d");
    });
  });

  describe("applyHostFonts", () => {
    it("should create a style element with the provided CSS", () => {
      const fontCss = "@font-face { font-family: 'Custom'; src: url('font.woff2'); }";

      applyHostFonts(fontCss);

      const styleEl = document.getElementById(FONT_STYLE_ID);
      expect(styleEl).not.toBeNull();
      expect(styleEl?.tagName).toBe("STYLE");
      expect(styleEl?.textContent).toBe(fontCss);
    });

    it("should update existing style element on subsequent calls", () => {
      applyHostFonts("first css");
      applyHostFonts("second css");

      const styleElements = document.querySelectorAll(`#${FONT_STYLE_ID}`);
      expect(styleElements.length).toBe(1);
      expect(styleElements[0].textContent).toBe("second css");
    });
  });

  describe("removeHostFonts", () => {
    it("should remove the host fonts style element", () => {
      applyHostFonts("some css");
      expect(document.getElementById(FONT_STYLE_ID)).not.toBeNull();

      removeHostFonts();
      expect(document.getElementById(FONT_STYLE_ID)).toBeNull();
    });

    it("should not throw if no style element exists", () => {
      expect(() => removeHostFonts()).not.toThrow();
    });
  });
});
