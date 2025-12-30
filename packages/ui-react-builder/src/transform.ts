/**
 * Transform utilities for converting ReactUIDef to standard UIDef
 *
 * After building React UIs, this module helps convert them to the
 * standard UIDef format that @mcp-apps-kit/core understands.
 */

import type { UIDef } from "@mcp-apps-kit/core";
import type { ReactUIDef, BuildResult } from "./types";
import { isReactUIDef } from "./define";

/**
 * Transform React UI definitions to standard core UIDefs.
 *
 * This function takes a mix of React UIs and standard UIs, and converts
 * all React UIs to standard UIDefs using the build result. Standard UIDefs
 * pass through unchanged.
 *
 * Use this after calling `buildReactUIs` to get definitions that can be
 * passed directly to `createApp`.
 *
 * @param defs - Record of UI keys to ReactUIDef or UIDef
 * @param buildResult - Result from buildReactUIs containing compiled HTML
 * @returns Record of UI keys to standard UIDefs
 *
 * @example
 * ```typescript
 * import { buildReactUIs, transformToCoreDefs, defineReactUI } from "@mcp-apps-kit/ui-react-builder";
 * import { defineUI, createApp, defineTool } from "@mcp-apps-kit/core";
 * import { MyWidget } from "./widgets/MyWidget";
 *
 * // Define a mix of React and standard UIs
 * const uis = {
 *   "react-widget": defineReactUI({
 *     component: MyWidget,
 *     name: "My Widget",
 *   }),
 *   "html-widget": defineUI({
 *     html: "./widget.html",
 *     name: "HTML Widget",
 *   }),
 * };
 *
 * // Build React UIs
 * const buildResult = await buildReactUIs({
 *   "react-widget": uis["react-widget"] as ReactUIDef,
 * });
 *
 * // Transform all to core format
 * const coreDefs = transformToCoreDefs(uis, buildResult);
 *
 * // Now use with createApp
 * const app = createApp({
 *   name: "my-app",
 *   version: "1.0.0",
 *   tools: {
 *     myTool: defineTool({
 *       // ... tool definition
 *       ui: coreDefs["react-widget"],
 *     }),
 *   },
 * });
 * ```
 */
export function transformToCoreDefs(
  defs: Record<string, ReactUIDef | UIDef>,
  buildResult: BuildResult
): Record<string, UIDef> {
  const result: Record<string, UIDef> = {};

  for (const [key, def] of Object.entries(defs)) {
    if (isReactUIDef(def)) {
      // Get compiled HTML from build result
      const html = buildResult.outputs.get(key);
      if (!html) {
        // Check if there was a build error
        const error = buildResult.errors.find((e) => e.key === key);
        if (error) {
          throw new Error(`Build failed for React UI "${key}": ${error.message}`);
        }
        throw new Error(
          `No build output found for React UI "${key}". Did you forget to include it in buildReactUIs()?`
        );
      }

      // Transform ReactUIDef to UIDef with inline HTML
      result[key] = {
        html, // Inline the compiled HTML
        name: def.name,
        description: def.description,
        widgetDescription: def.widgetDescription,
        csp: def.csp,
        prefersBorder: def.prefersBorder,
        domain: def.domain,
      };
    } else {
      // Pass through standard UIDef unchanged
      result[key] = def;
    }
  }

  return result;
}

/**
 * Transform a single React UI definition to a standard UIDef.
 *
 * @param def - React UI definition
 * @param html - Compiled HTML string from build
 * @returns Standard UIDef with inline HTML
 *
 * @example
 * ```typescript
 * const html = await buildReactUI("my-widget", reactDef);
 * const coreDef = transformSingleToCoreDef(reactDef, html);
 * ```
 */
export function transformSingleToCoreDef(def: ReactUIDef, html: string): UIDef {
  return {
    html,
    name: def.name,
    description: def.description,
    widgetDescription: def.widgetDescription,
    csp: def.csp,
    prefersBorder: def.prefersBorder,
    domain: def.domain,
  };
}

/**
 * Extract React UI definitions from a mixed record.
 *
 * Use this to separate React UIs (that need building) from standard UIs
 * (that are already HTML).
 *
 * @param defs - Record of UI keys to ReactUIDef or UIDef
 * @returns Object with separated React and standard UIs
 *
 * @example
 * ```typescript
 * const { reactUIs, standardUIs } = extractReactUIs(allUIs);
 *
 * // Build only the React UIs
 * const buildResult = await buildReactUIs(reactUIs);
 *
 * // Combine back together
 * const allCoreDefs = {
 *   ...standardUIs,
 *   ...transformToCoreDefs(reactUIs, buildResult),
 * };
 * ```
 */
export function extractReactUIs(defs: Record<string, ReactUIDef | UIDef>): {
  reactUIs: Record<string, ReactUIDef>;
  standardUIs: Record<string, UIDef>;
} {
  const reactUIs: Record<string, ReactUIDef> = {};
  const standardUIs: Record<string, UIDef> = {};

  for (const [key, def] of Object.entries(defs)) {
    if (isReactUIDef(def)) {
      reactUIs[key] = def;
    } else {
      standardUIs[key] = def;
    }
  }

  return { reactUIs, standardUIs };
}

/**
 * Convenience function to build and transform React UIs in one step.
 *
 * This combines `buildReactUIs` and `transformToCoreDefs` for simpler usage.
 *
 * @param defs - Record of UI keys to ReactUIDef or UIDef
 * @param options - Build options (passed to buildReactUIs)
 * @returns Promise resolving to standard UIDefs
 *
 * @example
 * ```typescript
 * import { buildAndTransform, defineReactUI } from "@mcp-apps-kit/ui-react-builder";
 * import { defineUI, createApp } from "@mcp-apps-kit/core";
 *
 * const uis = await buildAndTransform({
 *   "react-widget": defineReactUI({ component: MyWidget }),
 *   "html-widget": defineUI({ html: "./widget.html" }),
 * });
 *
 * // All are now standard UIDefs
 * console.log(uis["react-widget"].html.startsWith("<!DOCTYPE html>")); // true
 * console.log(uis["html-widget"].html); // "./widget.html"
 * ```
 */
export async function buildAndTransform(
  defs: Record<string, ReactUIDef | UIDef>,
  options?: Parameters<typeof import("./build").buildReactUIs>[1]
): Promise<Record<string, UIDef>> {
  // Dynamically import build to avoid circular dependencies
  const { buildReactUIs } = await import("./build");

  // Separate React UIs from standard UIs
  const { reactUIs, standardUIs } = extractReactUIs(defs);

  // If no React UIs, just return standard UIs
  if (Object.keys(reactUIs).length === 0) {
    return standardUIs;
  }

  // Build React UIs
  const buildResult = await buildReactUIs(reactUIs, options);

  // Check for errors
  if (buildResult.errors.length > 0) {
    const errorMessages = buildResult.errors.map((e) => `  - ${e.key}: ${e.message}`).join("\n");
    throw new Error(`Failed to build some React UIs:\n${errorMessages}`);
  }

  // Transform and combine
  return {
    ...standardUIs,
    ...transformToCoreDefs(reactUIs, buildResult),
  };
}
