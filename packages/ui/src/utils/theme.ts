/**
 * Theme utility functions for MCP Apps
 *
 * Standalone functions for applying and detecting document themes.
 * These can be used without React or the full client SDK.
 */

/**
 * Theme value type
 */
export type Theme = "light" | "dark" | "os";

/**
 * Apply a theme to the document
 *
 * Sets the appropriate class and data attribute on the document element.
 * When "os" is specified, the system preference is detected and applied.
 *
 * @param theme - The theme to apply ("light", "dark", or "os")
 */
export function applyDocumentTheme(theme: Theme): void {
  if (typeof document === "undefined") {
    return;
  }

  const resolvedTheme =
    theme === "os"
      ? typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;

  // Remove existing theme classes
  document.documentElement.classList.remove("light", "dark");

  // Add the new theme class
  document.documentElement.classList.add(resolvedTheme);

  // Also set as a data attribute for CSS selectors like [data-theme="dark"]
  document.documentElement.setAttribute("data-theme", resolvedTheme);
}

/**
 * Get the current document theme
 *
 * Detects the theme by checking the document element's class or data attribute.
 *
 * @returns The current theme ("light" or "dark")
 */
export function getDocumentTheme(): "light" | "dark" {
  if (typeof document === "undefined") {
    return "light";
  }

  // Check data attribute first
  const dataTheme = document.documentElement.getAttribute("data-theme");
  if (dataTheme === "dark" || dataTheme === "light") {
    return dataTheme;
  }

  // Check class
  if (document.documentElement.classList.contains("dark")) {
    return "dark";
  }

  // Default to light
  return "light";
}
