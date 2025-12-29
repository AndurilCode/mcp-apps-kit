/**
 * @mcp-apps-kit/ui-react-builder
 *
 * Build tool for React-based MCP application UIs.
 *
 * This package allows you to define UI resources using React components
 * instead of pre-built HTML files. The framework handles bundling React,
 * ReactDOM, and @mcp-apps-kit/ui-react into self-contained HTML that works
 * with both MCP Apps (Claude Desktop) and ChatGPT.
 *
 * @example Basic usage
 * ```typescript
 * import { defineReactUI, buildReactUIs } from "@mcp-apps-kit/ui-react-builder";
 * import { MyWidget } from "./widgets/MyWidget";
 *
 * // Define your UI with a React component
 * const widgetUI = defineReactUI({
 *   component: MyWidget,
 *   name: "My Widget",
 *   prefersBorder: true,
 * });
 *
 * // Build to HTML
 * const result = await buildReactUIs({
 *   "my-widget": widgetUI,
 * }, {
 *   outDir: "./dist/ui",
 * });
 *
 * console.log(`Built ${result.outputs.size} UIs in ${result.duration}ms`);
 * ```
 *
 * @example With tool definition
 * ```typescript
 * import { createApp, defineTool } from "@mcp-apps-kit/core";
 * import { defineReactUI, buildAndTransform } from "@mcp-apps-kit/ui-react-builder";
 * import { RestaurantList } from "./widgets/RestaurantList";
 * import { z } from "zod";
 *
 * // Build and transform in one step
 * const uis = await buildAndTransform({
 *   "restaurant-list": defineReactUI({
 *     component: RestaurantList,
 *     name: "Restaurant List",
 *   }),
 * });
 *
 * const app = createApp({
 *   name: "restaurant-finder",
 *   version: "1.0.0",
 *   tools: {
 *     search: defineTool({
 *       description: "Search for restaurants",
 *       input: z.object({ query: z.string() }),
 *       output: z.object({ restaurants: z.array(z.unknown()) }),
 *       ui: uis["restaurant-list"],
 *       handler: async (input) => {
 *         // ... search logic
 *         return { restaurants: [] };
 *       },
 *     }),
 *   },
 * });
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type {
  ReactUIInput,
  ReactUIDef,
  BuildOptions,
  BuildResult,
  BuildError,
  TemplateOptions,
  DevServerOptions,
} from "./types";

// =============================================================================
// DEFINITION HELPERS
// =============================================================================

export { defineReactUI, isReactUIDef } from "./define";

// =============================================================================
// BUILD FUNCTIONS
// =============================================================================

export { buildReactUIs, buildReactUI } from "./build";

// =============================================================================
// TRANSFORM UTILITIES
// =============================================================================

export {
  transformToCoreDefs,
  transformSingleToCoreDef,
  extractReactUIs,
  buildAndTransform,
} from "./transform";

// =============================================================================
// HTML UTILITIES
// =============================================================================

export type { EntryPointOptions } from "./html";
export { generateHTML, generateEntryPoint } from "./html";
