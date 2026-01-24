/**
 * Helper utilities for ensuring tool builders are built.
 *
 * Used by codegen to auto-build tools that omit the .build() call.
 */

import type { ToolDef } from "../types/tools";
import type { ToolBuilderComplete } from "./tool-builder";
import { TOOL_BUILDER_SYMBOL, ToolBuilderImpl } from "./tool-builder-impl";

/**
 * A tool builder that can be auto-built by ensureBuilt().
 * Includes all builder interface types that have _setName and build methods.
 */
type BuildableToolBuilder<
  TInput extends import("zod").ZodType,
  TOutput extends import("zod").ZodType,
> = ToolBuilderImpl<string> | ToolBuilderComplete<string, TInput, TOutput>;

/**
 * Check if a value is a tool builder (not yet built).
 *
 * Uses the TOOL_BUILDER_SYMBOL marker for reliable detection
 * across module boundaries.
 *
 * @param value - The value to check
 * @returns true if the value is a ToolBuilderImpl instance
 */
export function isToolBuilder(value: unknown): value is ToolBuilderImpl<string> {
  return (
    typeof value === "object" &&
    value !== null &&
    TOOL_BUILDER_SYMBOL in value &&
    value[TOOL_BUILDER_SYMBOL] === true
  );
}

/**
 * Ensure a tool-or-builder is a built ToolDef.
 *
 * If the value is a tool builder:
 * 1. Sets the inferred name (if not already set)
 * 2. Calls build() to produce the ToolDef
 *
 * If the value is already a ToolDef, returns it unchanged.
 *
 * Note: The type assertions are necessary due to TypeScript's limitations
 * with conditional types and method constraints on fluent builder interfaces.
 *
 * @param toolOrBuilder - Either a ToolBuilder or a ToolDef
 * @param inferredName - The name to set if not already provided (from filename)
 * @returns A built ToolDef
 *
 * @example
 * ```typescript
 * // In generated manifest:
 * import get_current_weather from "../tools/get-current-weather.js";
 *
 * export const tools = {
 *   getCurrentWeather: ensureBuilt(get_current_weather, "getCurrentWeather"),
 * } as const;
 * ```
 */
export function ensureBuilt<
  TInput extends import("zod").ZodType,
  TOutput extends import("zod").ZodType,
>(
  toolOrBuilder: BuildableToolBuilder<TInput, TOutput> | ToolDef<TInput, TOutput>,
  inferredName: string
): ToolDef<TInput, TOutput> {
  if (isToolBuilder(toolOrBuilder)) {
    // Set the inferred name if not already set, then build
    toolOrBuilder._setName(inferredName);
    // Type assertion needed: build() has complex 'this' constraint that
    // doesn't perfectly align with generic types at this call site
    return toolOrBuilder.build() as unknown as ToolDef<TInput, TOutput>;
  }

  // Already a built tool def - need cast because TypeScript can't narrow
  // the union type automatically even after the type guard above
  return toolOrBuilder as ToolDef<TInput, TOutput>;
}
