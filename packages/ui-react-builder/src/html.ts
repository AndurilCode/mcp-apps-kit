/**
 * HTML template generation for React UIs
 */

import type { TemplateOptions } from "./types";

/**
 * Default base CSS reset for all UIs.
 * Provides a consistent starting point across platforms.
 */
const DEFAULT_BASE_CSS = `
  *,
  *::before,
  *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html {
    font-size: 16px;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
      Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
    line-height: 1.5;
    color: #1a1a1a;
    background-color: transparent;
  }

  @media (prefers-color-scheme: dark) {
    body {
      color: #f5f5f5;
    }
  }

  #root {
    min-height: 100%;
  }
`;

/**
 * Generate a self-contained HTML document for a React UI.
 *
 * The generated HTML includes:
 * - DOCTYPE and valid HTML5 structure
 * - Meta tags for responsive design
 * - Inlined CSS (base reset + optional custom CSS)
 * - Inlined JavaScript bundle with React app
 *
 * @param options - Template options with key, name, script, and optional CSS
 * @returns Complete HTML document as a string
 *
 * @example
 * ```typescript
 * const html = generateHTML({
 *   key: "restaurant-list",
 *   name: "Restaurant List Widget",
 *   script: bundledJavaScript,
 *   css: customStyles,
 * });
 * ```
 */
export function generateHTML(options: TemplateOptions): string {
  const { key, name, script, css } = options;

  // Combine base CSS with any custom CSS
  const combinedCss = css ? `${DEFAULT_BASE_CSS}\n${css}` : DEFAULT_BASE_CSS;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="mcp-ui-key" content="${escapeHtml(key)}">
  <title>${escapeHtml(name)}</title>
  <style>${combinedCss}</style>
</head>
<body>
  <div id="root"></div>
  <script type="module">${script.replace(/<\/script>/gi, "</scr" + "ipt>")}</script>
</body>
</html>`;
}

/**
 * Options for generating the React entry point.
 */
export interface EntryPointOptions {
  /**
   * Path to the component file.
   */
  componentPath: string;

  /**
   * Name of the export to use.
   * Use "default" for default exports, or the actual name for named exports.
   * @default "default"
   */
  componentExport?: string;

  /**
   * Default props to pass to the component.
   */
  defaultProps?: Record<string, unknown>;
}

/**
 * Generate the React entry point code that will be bundled.
 *
 * This creates a small JavaScript module that:
 * 1. Imports React and ReactDOM
 * 2. Imports the user's component
 * 3. Imports AppsProvider from @mcp-apps-kit/ui-react
 * 4. Renders the component wrapped in providers
 *
 * @param componentPath - Path to the React component file (for backward compatibility)
 * @param defaultProps - Optional default props to pass to the component
 * @returns JavaScript/TypeScript source code for the entry point
 *
 * @example
 * ```typescript
 * // Default export
 * const entryCode = generateEntryPoint(
 *   "./src/widgets/MyWidget.tsx",
 *   { theme: "dark" }
 * );
 *
 * // Named export
 * const entryCode = generateEntryPoint({
 *   componentPath: "./src/widgets/MyWidget.tsx",
 *   componentExport: "MyWidget",
 * });
 * ```
 */
export function generateEntryPoint(
  componentPathOrOptions: string | EntryPointOptions,
  defaultProps?: Record<string, unknown>
): string {
  // Handle backward compatibility with string-only signature
  const options: EntryPointOptions =
    typeof componentPathOrOptions === "string"
      ? { componentPath: componentPathOrOptions, defaultProps }
      : componentPathOrOptions;

  const { componentPath, componentExport = "default", defaultProps: props } = options;
  const propsJson = props ? JSON.stringify(props) : "{}";

  // Generate appropriate import statement based on export type
  const importStatement =
    componentExport === "default"
      ? `import Component from "${componentPath}";`
      : `import { ${componentExport} as Component } from "${componentPath}";`;

  return `
import React from "react";
import { createRoot } from "react-dom/client";
import { AppsProvider } from "@mcp-apps-kit/ui-react";
${importStatement}

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <AppsProvider>
        <Component {...${propsJson}} />
      </AppsProvider>
    </React.StrictMode>
  );
}
`;
}

/**
 * Escape HTML special characters to prevent XSS.
 *
 * @param text - Text to escape
 * @returns Escaped text safe for HTML insertion
 */
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] ?? char);
}

/**
 * Extract CSS from a string that may contain both JS and CSS.
 * Used when esbuild bundles CSS as JavaScript that injects styles.
 *
 * @param code - Bundled code that may contain CSS injection
 * @returns Extracted CSS string or undefined
 */
export function extractInlineCSS(code: string): string | undefined {
  // esbuild injects CSS as: document.head.appendChild(...).textContent = "css content"
  const cssMatch = code.match(/\.textContent\s*=\s*["'`]([\s\S]*?)["'`]\s*[;,)]/);
  if (cssMatch?.[1]) {
    // Unescape the CSS string
    return cssMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return undefined;
}
