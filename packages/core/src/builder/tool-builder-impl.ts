/**
 * Fluent tool builder implementation.
 */

import { z } from "zod";
import type { ToolAnnotations, ToolContext, ToolDef, Visibility } from "../types/tools";
import { defineUI, type UIDef } from "../types/ui";
import { isZodSchema } from "../utils/schema";
import type {
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

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

interface ToolBuilderConfig {
  description?: string;
  title?: string;
  input?: z.ZodType;
  output?: z.ZodType;
  visibility?: Visibility;
  annotations?: ToolAnnotations;
  ui?: string | UIDef;
  widgetAccessible?: boolean;
  invokingMessage?: string;
  invokedMessage?: string;
  fileParams?: string[];
  handler?: (input: unknown, context: ToolContext) => Promise<unknown>;
}

function normalizeSchema<T extends SchemaInput>(schema: T): NormalizedSchema<T> {
  if (isZodSchema(schema)) {
    return schema as NormalizedSchema<T>;
  }

  return z.object(schema) as NormalizedSchema<T>;
}

function normalizeVisibility(value: ToolVisibilityInput): Visibility {
  if (value === "mcp") {
    return "app";
  }

  if (value === "chatgpt") {
    return "model";
  }

  if (value === "model" || value === "app" || value === "both") {
    return value;
  }

  // Fallback for unknown values/defensive programming
  return value as Visibility;
}

// =============================================================================
// BUILDER IMPLEMENTATION
// =============================================================================

export class ToolBuilderImpl<TName extends string> implements ToolBuilderInitial<TName> {
  private config: ToolBuilderConfig = {};

  constructor(private readonly name: TName) {}

  describe(description: string): ToolBuilderWithDescription<TName> {
    this.config.description = description;
    return this as unknown as ToolBuilderWithDescription<TName>;
  }

  title(title: string): ToolBuilderWithDescription<TName> {
    this.config.title = title;
    return this as unknown as ToolBuilderWithDescription<TName>;
  }

  input<TInput extends SchemaInput>(
    schema: TInput
  ): ToolBuilderWithInput<TName, NormalizedSchema<TInput>> {
    this.config.input = normalizeSchema(schema);
    return this as unknown as ToolBuilderWithInput<TName, NormalizedSchema<TInput>>;
  }

  output<TOutput extends SchemaInput, TInput extends z.ZodType>(
    this: ToolBuilderWithInput<TName, TInput>,
    schema: TOutput
  ): ToolBuilderWithOutput<TName, TInput, NormalizedSchema<TOutput>> {
    // Cast to implementation to access config.
    // Necessary due to TypeScript limitations with 'this' types in fluent interfaces.
    const builder = this as unknown as ToolBuilderImpl<TName>;
    builder.config.output = normalizeSchema(schema) as z.ZodType;
    return this as unknown as ToolBuilderWithOutput<TName, TInput, NormalizedSchema<TOutput>>;
  }

  visibility(value: ToolVisibilityInput): this {
    this.config.visibility = normalizeVisibility(value);
    return this;
  }

  readOnly(): this {
    this.config.annotations ??= {};
    this.config.annotations.readOnlyHint = true;
    return this;
  }

  destructive(): this {
    this.config.annotations ??= {};
    this.config.annotations.destructiveHint = true;
    return this;
  }

  idempotent(): this {
    this.config.annotations ??= {};
    this.config.annotations.idempotentHint = true;
    return this;
  }

  expensive(): this {
    this.config.annotations ??= {};
    this.config.annotations.openWorldHint = true;
    return this;
  }

  /**
   * Attach a UI using a string that is heuristically parsed:
   * - Inline HTML if it starts with `<`
   * - File path if it contains `/`, `\`, starts with `.`, or ends with an extension (e.g. `.html`)
   * - Otherwise treated as a UI key (legacy alias for `uiRef`)
   *
   * For explicit keys (e.g. "my.ui" or "section/widget" that might look like paths), use {@link uiRef}.
   * You can also pass a full definition object to matching `ui(definition)`.
   */
  ui(path: string, options?: UIOptions): this;
  ui(definition: UIDef): this;
  ui(pathOrDefinition: string | UIDef, options?: UIOptions): this {
    if (typeof pathOrDefinition === "string") {
      const trimmed = pathOrDefinition.trim();
      const isInlineHtml = trimmed.startsWith("<");
      const hasPathSeparator = pathOrDefinition.includes("/") || pathOrDefinition.includes("\\");
      const hasExtension = /\.[a-zA-Z0-9]+$/.test(pathOrDefinition);
      const looksLikePath = hasPathSeparator || pathOrDefinition.startsWith(".") || hasExtension;

      if (options || isInlineHtml || looksLikePath) {
        this.config.ui = defineUI({ html: pathOrDefinition, ...options });
      } else {
        this.config.ui = pathOrDefinition;
      }

      return this;
    }

    this.config.ui = defineUI(pathOrDefinition);
    return this;
  }

  uiRef(key: string): this {
    this.config.ui = key;
    return this;
  }

  widgetAccessible(value: boolean): this {
    this.config.widgetAccessible = value;
    return this;
  }

  invokingMessage(message: string): this {
    this.config.invokingMessage = message;
    return this;
  }

  invokedMessage(message: string): this {
    this.config.invokedMessage = message;
    return this;
  }

  fileParams(params: string[]): this {
    this.config.fileParams = params;
    return this;
  }

  handle<TInput extends z.ZodType, TReturn>(
    this: ToolBuilderImpl<TName> & ToolBuilderWithInput<TName, TInput>,
    handler: (input: z.infer<TInput>, context: ToolContext) => Promise<TReturn>
  ): ToolBuilderComplete<TName, TInput, z.ZodType>;
  handle<TInput extends z.ZodType, TOutput extends z.ZodType, TActual>(
    this: ToolBuilderImpl<TName> & ToolBuilderWithOutput<TName, TInput, TOutput>,
    handler: (input: z.infer<TInput>, context: ToolContext) => Promise<TActual>
  ): ToolBuilderComplete<TName, TInput, TOutput>;
  handle(
    handler: (input: unknown, context: ToolContext) => Promise<unknown>
  ): ToolBuilderComplete<TName, z.ZodType, z.ZodType> {
    this.config.handler = handler;
    return this as unknown as ToolBuilderComplete<TName, z.ZodType, z.ZodType>;
  }

  build<TInput extends z.ZodType, TOutput extends z.ZodType>(
    this: ToolBuilderComplete<TName, TInput, TOutput>
  ): ToolDef<TInput, TOutput> {
    // Cast to implementation to access config.
    // Necessary due to TypeScript limitations with 'this' types in fluent interfaces.
    const builder = this as unknown as ToolBuilderImpl<TName>;

    if (!builder.config.description) {
      throw new Error("Tool requires description");
    }

    if (!builder.config.input) {
      throw new Error("Tool requires input schema");
    }

    if (!builder.config.handler) {
      throw new Error("Tool requires handler");
    }

    const title = builder.config.title ?? builder.name;

    return {
      description: builder.config.description,
      title,
      input: builder.config.input,
      output: builder.config.output,
      handler: builder.config.handler,
      visibility: builder.config.visibility,
      annotations: builder.config.annotations,
      ui: builder.config.ui,
      widgetAccessible: builder.config.widgetAccessible,
      invokingMessage: builder.config.invokingMessage,
      invokedMessage: builder.config.invokedMessage,
      fileParams: builder.config.fileParams,
    } as ToolDef<TInput, TOutput>;
  }
}
