/**
 * Style utility functions for MCP Apps
 *
 * Standalone functions for applying host-provided styles.
 * These can be used without React or the full client SDK.
 */

/**
 * Apply host-provided CSS variables to the document
 *
 * Sets CSS custom properties on the document root element.
 * Variable names are normalized to include the `--` prefix if missing.
 *
 * @param variables - Record of variable names to values
 *
 * @example
 * ```ts
 * applyHostStyleVariables({
 *   "primary-color": "#007bff",
 *   "--secondary-color": "#6c757d",
 *   "font-size-base": "16px",
 * });
 * ```
 */
export function applyHostStyleVariables(variables: Record<string, string>): void {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;

  for (const [key, value] of Object.entries(variables)) {
    // Normalize variable name to include -- prefix
    const propertyName = key.startsWith("--") ? key : `--${key}`;
    root.style.setProperty(propertyName, value);
  }
}

/**
 * Apply host-provided font CSS
 *
 * Injects or updates a style element with font-related CSS.
 * The style element is identified by a specific ID so it can be updated.
 *
 * @param css - CSS string containing @font-face rules or other font styles
 *
 * @example
 * ```ts
 * applyHostFonts(`
 *   @font-face {
 *     font-family: 'CustomFont';
 *     src: url('...') format('woff2');
 *   }
 *   body {
 *     font-family: 'CustomFont', sans-serif;
 *   }
 * `);
 * ```
 */
export function applyHostFonts(css: string): void {
  if (typeof document === "undefined") {
    return;
  }

  const STYLE_ID = "mcp-apps-host-fonts";

  let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;

  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = css;
}

/**
 * Remove host-provided font CSS
 *
 * Removes the style element containing host fonts if it exists.
 */
export function removeHostFonts(): void {
  if (typeof document === "undefined") {
    return;
  }

  const STYLE_ID = "mcp-apps-host-fonts";
  const styleEl = document.getElementById(STYLE_ID);

  if (styleEl) {
    styleEl.remove();
  }
}

/**
 * Clear all host-provided CSS variables
 *
 * Removes all CSS custom properties that were set on the document root.
 * Note: This removes ALL custom properties, not just those set by applyHostStyleVariables.
 *
 * @param variables - Record of variable names to clear (same format as applyHostStyleVariables)
 */
export function clearHostStyleVariables(variables: Record<string, string>): void {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;

  for (const key of Object.keys(variables)) {
    const propertyName = key.startsWith("--") ? key : `--${key}`;
    root.style.removeProperty(propertyName);
  }
}
