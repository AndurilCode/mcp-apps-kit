/**
 * Fluent tool builder entry point.
 */

import type { ToolBuilderInitial, ToolBuilderWithDescription } from "./tool-builder";
import { ToolBuilderImpl, TOOL_BUILDER_SYMBOL } from "./tool-builder-impl";

// =============================================================================
// TOOL FACTORY
// =============================================================================

/**
 * Create a new tool builder.
 *
 * The argument is treated as the tool name.
 *
 * For auto-detected descriptions or explicit control, use:
 * - `tool.named(name)` - Explicit name (same as `tool(name)`)
 * - `tool.describe(description)` - Start with description, name inferred from filename
 *
 * @example
 * ```typescript
 * // Provide explicit name
 * tool("getCurrentWeather")
 *   .describe("Get the current weather")
 *   .input({ location: z.string() })
 *   .handle(async ({ location }) => weatherService.get(location));
 *
 * // Name inferred from filename (e.g., get-current-weather.ts → "getCurrentWeather")
 * tool.describe("Get the current weather for a location")
 *   .input({ location: z.string() })
 *   .handle(async ({ location }) => weatherService.get(location));
 * ```
 */
export function tool<TName extends string>(name: TName): ToolBuilderInitial<TName> {
  return new ToolBuilderImpl<TName>(name);
}

/**
 * Create a tool builder with an explicit name.
 *
 * @example
 * ```typescript
 * tool.named("getCurrentWeather")
 *   .describe("Get the current weather")
 *   .input({ location: z.string() })
 *   .handle(async ({ location }) => weatherService.get(location));
 * ```
 */
tool.named = <TName extends string>(name: TName): ToolBuilderInitial<TName> => {
  return new ToolBuilderImpl<TName>(name);
};

/**
 * Create a tool builder with an explicit description (name will be inferred from filename).
 *
 * @example
 * ```typescript
 * // In file: get-current-weather.ts
 * export default tool.describe("Get the current weather for a location")
 *   .input({ location: z.string() })
 *   .handle(async ({ location }) => weatherService.get(location));
 * // Tool name will be inferred as "getCurrentWeather"
 * ```
 */
tool.describe = <TName extends string>(description: string): ToolBuilderWithDescription<TName> => {
  return new ToolBuilderImpl<TName>().describe(description);
};

// Re-export the symbol for external use
export { TOOL_BUILDER_SYMBOL };

export type {
  NormalizedSchema,
  SchemaInput,
  ToolBuilderComplete,
  ToolBuilderInitial,
  ToolBuilderWithDescription,
  ToolBuilderWithInput,
  ToolBuilderWithOutput,
  ToolVisibilityInput,
  UIOptions,
} from "./tool-builder";
