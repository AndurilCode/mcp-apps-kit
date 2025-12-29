/**
 * Helper functions for defining React-based UIs
 */

import type { ReactUIInput, ReactUIDef } from "./types";

/**
 * Convert component name to kebab-case for filename.
 * @internal
 */
function toKebabCase(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Define a UI using a React component.
 *
 * This helper creates a UIDef with an auto-generated HTML path based on
 * the component name. The Vite plugin discovers these definitions and
 * builds the React components into self-contained HTML files.
 *
 * @param definition - React UI input with component and metadata
 * @returns A UIDef with auto-generated html path and React metadata
 *
 * @example Basic usage
 * ```typescript
 * import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
 * import { MyWidget } from "./widgets/MyWidget";
 *
 * const widgetUI = defineReactUI({
 *   component: MyWidget,
 *   name: "My Widget",
 *   prefersBorder: true,
 * });
 * // Returns: { html: "./src/ui/dist/my-widget.html", name: "My Widget", ... }
 * ```
 *
 * @example With tool definition
 * ```typescript
 * import { createApp, defineTool } from "@mcp-apps-kit/core";
 * import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
 * import { RestaurantList } from "./widgets/RestaurantList";
 *
 * const app = createApp({
 *   name: "restaurant-finder",
 *   version: "1.0.0",
 *   tools: {
 *     search: defineTool({
 *       description: "Search for restaurants",
 *       input: z.object({ query: z.string() }),
 *       output: z.object({ restaurants: z.array(RestaurantSchema) }),
 *       ui: defineReactUI({
 *         component: RestaurantList,
 *         name: "Restaurant List",
 *       }),
 *       handler: async (input) => {
 *         // ... search logic
 *       },
 *     }),
 *   },
 * });
 * ```
 *
 * @example Custom output directory
 * ```typescript
 * const widgetUI = defineReactUI({
 *   component: ConfigurableWidget,
 *   name: "Configurable Widget",
 *   outDir: "./dist/ui",
 * });
 * // Returns: { html: "./dist/ui/configurable-widget.html", ... }
 * ```
 */
export function defineReactUI(definition: ReactUIInput): ReactUIDef {
  const { component, defaultProps, outDir, ...rest } = definition;

  // Generate the output path from component name
  const componentName = component.name ?? "component";
  const key = toKebabCase(componentName);
  const outputDir = outDir ?? "./src/ui/dist";
  const htmlPath = `${outputDir}/${key}.html`;

  return {
    ...rest,
    html: htmlPath,
    __reactUI: true,
    __component: component,
    __defaultProps: defaultProps,
  };
}

/**
 * Check if a value is a React UI definition.
 *
 * This type guard is used by the build system to identify
 * React UIs that need to be compiled to HTML.
 *
 * @param value - Value to check
 * @returns True if the value is a ReactUIDef
 *
 * @example
 * ```typescript
 * import { isReactUIDef } from "@mcp-apps-kit/ui-react-builder";
 *
 * const ui = someUnknownUI;
 * if (isReactUIDef(ui)) {
 *   // ui.__component is available here
 *   console.log("React UI:", ui.__component.name);
 * }
 * ```
 */
export function isReactUIDef(value: unknown): value is ReactUIDef {
  return (
    typeof value === "object" &&
    value !== null &&
    "__reactUI" in value &&
    (value as ReactUIDef).__reactUI
  );
}
