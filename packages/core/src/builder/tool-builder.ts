/**
 * Fluent tool builder interfaces for @mcp-apps-kit/core.
 */

import type { z } from "zod";
import type { ToolContext, ToolDef, Visibility } from "../types/tools";
import type { UIDef } from "../types/ui";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Input schema accepted by the builder.
 */
export type SchemaInput = z.ZodType | z.ZodRawShape;

/**
 * Normalize raw Zod shapes into Zod objects.
 */
export type NormalizedSchema<T extends SchemaInput> = T extends z.ZodType
  ? T
  : T extends z.ZodRawShape
    ? z.ZodObject<T>
    : never;

/**
 * Visibility values accepted by the builder.
 */
export type ToolVisibilityInput = Visibility | "mcp" | "chatgpt";

/**
 * UI options supported by the builder.
 */
export type UIOptions = Omit<UIDef, "html">;

/**
 * Reserved metadata keys that are always allowed in tool handler output.
 */
type ToolOutputMeta = {
  _meta?: Record<string, unknown>;
  _text?: string;
  _closeWidget?: boolean;
};

/**
 * Keys that are reserved for metadata in tool output.
 */
type MetaKeys = keyof ToolOutputMeta;

/**
 * Enforces strict return type checking for tool handlers.
 */
type StrictToolOutput<TOutput, TActual> = TActual extends TOutput & ToolOutputMeta
  ? Exclude<keyof TActual, keyof TOutput | MetaKeys> extends never
    ? TActual
    : TOutput & ToolOutputMeta & { [K in Exclude<keyof TActual, keyof TOutput | MetaKeys>]: never }
  : TOutput & ToolOutputMeta;

// =============================================================================
// BUILDER INTERFACES
// =============================================================================

/**
 * Step 1: Initial - requires description.
 */
export interface ToolBuilderInitial<TName extends string> {
  /**
   * Set the tool description (required).
   */
  describe(description: string): ToolBuilderWithDescription<TName>;
}

/**
 * Step 2: Has description - requires input.
 */
export interface ToolBuilderWithDescription<TName extends string> {
  /**
   * Set an optional title (defaults to tool name).
   */
  title(title: string): ToolBuilderWithDescription<TName>;

  /**
   * Set the input schema (required).
   */
  input<TInput extends SchemaInput>(
    schema: TInput
  ): ToolBuilderWithInput<TName, NormalizedSchema<TInput>>;
}

/**
 * Options available once input is set.
 */
export interface ToolBuilderConfigurable {
  /**
   * Set tool visibility (model/app/both).
   */
  visibility(value: ToolVisibilityInput): this;

  /**
   * Mark this tool as read-only.
   */
  readOnly(): this;

  /**
   * Mark this tool as potentially destructive.
   */
  destructive(): this;

  /**
   * Mark this tool as idempotent (safe to retry).
   */
  idempotent(): this;

  /**
   * Mark this tool as expensive or open-world.
   */
  expensive(): this;

  /**
   * Attach UI by HTML path, inline HTML, or a UI key reference.
   *
   * Strings that look like paths or HTML are treated as UI definitions.
   * Use uiRef() to explicitly reference a UI key.
   */
  ui(path: string, options?: UIOptions): this;

  /**
   * Attach a pre-defined UI definition.
   */
  ui(definition: UIDef): this;

  /**
   * Reference a UI definition key from app config.
   */
  uiRef(key: string): this;

  /**
   * Explicitly control widget accessibility (ChatGPT only).
   */
  widgetAccessible(value: boolean): this;

  /**
   * Set the invoking message shown while executing (ChatGPT only).
   */
  invokingMessage(message: string): this;

  /**
   * Set the invoked message shown after completion (ChatGPT only).
   */
  invokedMessage(message: string): this;

  /**
   * Set file parameter names accepted by this tool (ChatGPT only).
   */
  fileParams(params: string[]): this;
}

/**
 * Step 3: Has input - can add output or handler.
 */
export interface ToolBuilderWithInput<
  TName extends string,
  TInput extends z.ZodType,
> extends ToolBuilderConfigurable {
  /**
   * Set the output schema.
   */
  output<TOutput extends SchemaInput>(
    schema: TOutput
  ): ToolBuilderWithOutput<TName, TInput, NormalizedSchema<TOutput>>;

  /**
   * Set the handler without an output schema.
   */
  handle<TReturn>(
    handler: (input: z.infer<TInput>, context: ToolContext) => Promise<TReturn>
  ): ToolBuilderComplete<TName, TInput, z.ZodType>;
}

/**
 * Step 4: Has output - can configure more or add handler.
 */
export interface ToolBuilderWithOutput<
  TName extends string,
  TInput extends z.ZodType,
  TOutput extends z.ZodType,
> extends ToolBuilderConfigurable {
  /**
   * Set the handler (return type must match output schema).
   */
  handle<TActual extends z.infer<TOutput> & ToolOutputMeta = z.infer<TOutput> & ToolOutputMeta>(
    handler: (
      input: z.infer<TInput>,
      context: ToolContext
    ) => Promise<StrictToolOutput<z.infer<TOutput>, TActual>>
  ): ToolBuilderComplete<TName, TInput, TOutput>;
}

/**
 * Final: Ready to build.
 */
export interface ToolBuilderComplete<
  _TName extends string,
  TInput extends z.ZodType,
  TOutput extends z.ZodType,
> {
  /**
   * Build the tool definition.
   */
  build(): ToolDef<TInput, TOutput>;

  /**
   * Set the tool name if not already set.
   * Used internally by codegen for filename-based name inference.
   * @internal
   */
  _setName(name: string): this;

  /**
   * Set the UI binding if not already set.
   * Used internally by codegen for convention-based UI binding.
   * @internal
   */
  _setUi(uiDef: UIDef): this;
}
