/**
 * Type definitions for @mcp-apps-kit/ui-react-builder
 *
 * Provides interfaces for defining React-based UIs and build configuration.
 */

import type { ComponentType } from "react";
import type { UIDef } from "@mcp-apps-kit/core";

// =============================================================================
// REACT UI INPUT (what the user provides)
// =============================================================================

/**
 * Input for defining a React component UI.
 *
 * This is what you pass to `defineReactUI()`. The function returns a standard
 * `UIDef` with an auto-generated `html` path that the Vite plugin will build.
 *
 * @example
 * ```typescript
 * import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
 * import { MyWidget } from "./widgets/MyWidget";
 *
 * const widgetUI = defineReactUI({
 *   component: MyWidget,
 *   name: "My Widget",
 *   description: "A beautiful widget",
 *   prefersBorder: true,
 * });
 * ```
 */
export interface ReactUIInput extends Omit<UIDef, "html"> {
  /**
   * React component to render as the UI.
   *
   * Must be a function component or class component.
   * The component will be wrapped in AppsProvider from @mcp-apps-kit/ui-react,
   * giving it access to hooks like useToolResult, useAppsClient, etc.
   *
   * The component's name is used to generate the output HTML filename.
   * For example, a component named `GreetingWidget` will output to
   * `greeting-widget.html`.
   */
  component: ComponentType<Record<string, unknown>>;

  /**
   * Optional default props to pass to the component.
   *
   * These props are baked into the HTML at build time.
   * For runtime data, use hooks like useToolResult instead.
   */
  defaultProps?: Record<string, unknown>;

  /**
   * Output directory for the built HTML file.
   * Defaults to "./src/ui/dist" if not specified.
   *
   * @example "./dist/ui"
   */
  outDir?: string;
}

// =============================================================================
// REACT UI DEFINITION (internal, extends UIDef)
// =============================================================================

/**
 * Internal React UI definition that extends UIDef.
 *
 * This is what `defineReactUI()` returns. It's a valid `UIDef` with
 * additional metadata for the Vite plugin to discover and build.
 *
 * @internal
 */
export interface ReactUIDef extends UIDef {
  /**
   * Internal marker used by the build system to identify React UIs.
   * @internal
   */
  __reactUI: true;

  /**
   * The React component reference (for type checking and discovery).
   * @internal
   */
  __component: ComponentType<Record<string, unknown>>;

  /**
   * Optional default props for the component.
   * @internal
   */
  __defaultProps?: Record<string, unknown>;
}

// =============================================================================
// BUILD CONFIGURATION
// =============================================================================

/**
 * Options for the React UI build process.
 */
export interface BuildOptions {
  /**
   * Output directory for compiled HTML files.
   * If not specified, HTML is only returned in memory.
   *
   * @example "./dist/ui"
   */
  outDir?: string;

  /**
   * Minify the output JavaScript and CSS.
   *
   * @default true in production, false in development
   */
  minify?: boolean;

  /**
   * Include source maps in the output.
   * Useful for debugging but increases bundle size.
   *
   * @default false
   */
  sourcemap?: boolean;

  /**
   * External packages to exclude from the bundle.
   * These packages must be available at runtime.
   *
   * Note: React, ReactDOM, and @mcp-apps-kit/ui-react are always bundled
   * to ensure the HTML is self-contained.
   */
  external?: string[];

  /**
   * Working directory for resolving component paths.
   *
   * @default process.cwd()
   */
  cwd?: string;

  /**
   * Path to a CSS file to inject into all UIs.
   * Useful for global styles or CSS reset.
   */
  globalCss?: string;

  /**
   * Custom HTML template function.
   * If not provided, a default template is used.
   */
  template?: (options: TemplateOptions) => string;
}

/**
 * Options passed to the HTML template function.
 */
export interface TemplateOptions {
  /**
   * UI definition key (e.g., "restaurant-list")
   */
  key: string;

  /**
   * Display name for the UI
   */
  name: string;

  /**
   * Bundled JavaScript code (minified)
   */
  script: string;

  /**
   * Optional bundled CSS code
   */
  css?: string;
}

// =============================================================================
// BUILD RESULT
// =============================================================================

/**
 * Result of building React UIs.
 */
export interface BuildResult {
  /**
   * Map of UI keys to their compiled HTML content.
   * Keys match the input record keys.
   */
  outputs: Map<string, string>;

  /**
   * Map of UI keys to their output file paths.
   * Only populated if outDir was specified.
   */
  files: Map<string, string>;

  /**
   * Total build duration in milliseconds.
   */
  duration: number;

  /**
   * Any warnings generated during the build.
   */
  warnings: string[];

  /**
   * Any errors that occurred during the build.
   * If non-empty, some UIs may not have been built successfully.
   */
  errors: BuildError[];
}

/**
 * Error that occurred during building a specific UI.
 */
export interface BuildError {
  /**
   * UI key that failed to build
   */
  key: string;

  /**
   * Error message
   */
  message: string;

  /**
   * Optional stack trace
   */
  stack?: string;
}

// =============================================================================
// DEVELOPMENT SERVER
// =============================================================================

/**
 * Options for the development server.
 * Reserved for future implementation.
 */
export interface DevServerOptions {
  /**
   * Port for the dev server.
   * @default 5173
   */
  port?: number;

  /**
   * Enable Hot Module Replacement.
   * @default true
   */
  hmr?: boolean;

  /**
   * Watch for file changes.
   * @default true
   */
  watch?: boolean;

  /**
   * Open browser on start.
   * @default false
   */
  open?: boolean;
}
