/**
 * Fluent tool builder entry point.
 */

import type { ToolBuilderInitial } from "./tool-builder";
import { ToolBuilderImpl } from "./tool-builder-impl";

export function tool<TName extends string>(name: TName): ToolBuilderInitial<TName> {
  return new ToolBuilderImpl(name);
}

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
