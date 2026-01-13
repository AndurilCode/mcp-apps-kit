/**
 * Schema utilities for @mcp-apps-kit/core
 *
 * Provides Zod to JSON Schema conversion and related utilities.
 * Uses Zod v4's native JSON Schema support.
 */

import { z } from "zod";

// =============================================================================
// TYPES
// =============================================================================

/**
 * JSON Schema 7 compatible type
 * Using a more flexible type to accommodate zod-to-json-schema output
 *
 * @internal
 */
export type JSONSchema = Record<string, unknown>;

/**
 * Options for zodToJsonSchema conversion
 *
 * Note: Zod v4 uses native JSON Schema 2020-12 conversion.
 *
 * @internal
 */
export interface ZodToJsonSchemaOptions {
  /**
   * Whether to include the $schema property in the output
   *
   * When false (default), the $schema property is stripped for MCP compatibility.
   *
   * @default false
   */
  includeSchema?: boolean;
}

/**
 * A plain object where all values are Zod schemas.
 * Used for inline schema syntax in defineTool.
 *
 * @example
 * ```typescript
 * const shape: ZodRawShapeRecord = {
 *   name: z.string(),
 *   age: z.number().optional(),
 * };
 * ```
 */
export type ZodRawShapeRecord = Record<string, z.ZodType>;

/**
 * Helper type that enforces all properties in T are Zod schemas.
 * Returns `never` for any property that is not a Zod schema, which causes
 * TypeScript to error when the type is used in a function parameter.
 *
 * @example
 * ```typescript
 * // Valid - all properties are Zod schemas
 * type Valid = AssertZodShape<{ name: z.ZodString }>; // { name: z.ZodString }
 *
 * // Invalid - 'age' is not a Zod schema
 * type Invalid = AssertZodShape<{ name: z.ZodString; age: number }>; // { name: z.ZodString; age: never }
 * ```
 */
export type AssertZodShape<T> = {
  [K in keyof T]: T[K] extends z.ZodType ? T[K] : never;
};

/**
 * Type that accepts either a Zod schema or a plain object of Zod schemas.
 * The plain object will be auto-wrapped with z.object().
 *
 * @example
 * ```typescript
 * // Explicit Zod schema
 * const explicit: SchemaInput = z.object({ name: z.string() });
 *
 * // Plain object (will be auto-wrapped)
 * const inline: SchemaInput = { name: z.string() };
 * ```
 */
export type SchemaInput = z.ZodType | ZodRawShapeRecord;

/**
 * Infers the TypeScript type from a SchemaInput.
 * - If it's already a ZodType, uses z.infer<T>
 * - If it's a plain object, infers as if wrapped in z.object()
 *
 * @example
 * ```typescript
 * type A = InferFromSchemaInput<z.ZodString>; // string
 * type B = InferFromSchemaInput<{ name: z.ZodString }>; // { name: string }
 * ```
 */
export type InferFromSchemaInput<T extends SchemaInput> = T extends z.ZodType
  ? z.infer<T>
  : T extends ZodRawShapeRecord
    ? { [K in keyof T]: z.infer<T[K]> }
    : never;

/**
 * Normalizes a SchemaInput to a ZodType at the type level.
 * - If already a ZodType, returns as-is
 * - If a plain object, returns the equivalent ZodObject type
 *
 * @example
 * ```typescript
 * type A = NormalizeSchema<z.ZodString>; // z.ZodString
 * type B = NormalizeSchema<{ name: z.ZodString }>; // z.ZodObject<{ name: z.ZodString }>
 * ```
 */
export type NormalizeSchema<T extends SchemaInput> = T extends z.ZodType
  ? T
  : T extends ZodRawShapeRecord
    ? z.ZodObject<{ [K in keyof T]: T[K] }>
    : never;

// =============================================================================
// FUNCTIONS
// =============================================================================

/**
 * Convert a Zod schema to JSON Schema
 *
 * Used for registering tool input/output schemas with the MCP protocol.
 *
 * @param schema - Zod schema to convert
 * @param options - Conversion options
 * @returns JSON Schema object
 *
 * @example
 * ```typescript
 * import { z } from "zod";
 * import { zodToJsonSchema } from "@mcp-apps-kit/core";
 *
 * const inputSchema = z.object({
 *   name: z.string().describe("User's name"),
 *   age: z.number().optional(),
 * });
 *
 * const jsonSchema = zodToJsonSchema(inputSchema);
 * // {
 * //   type: "object",
 * //   properties: {
 * //     name: { type: "string", description: "User's name" },
 * //     age: { type: "number" }
 * //   },
 * //   required: ["name"]
 * // }
 * ```
 *
 * @internal
 */
export function zodToJsonSchema(
  schema: z.ZodType,
  options: ZodToJsonSchemaOptions = {}
): JSONSchema {
  const { includeSchema = false } = options;

  // Use Zod v4's native JSON Schema conversion
  const result = z.toJSONSchema(schema) as JSONSchema;

  // Strip $schema unless explicitly requested (for MCP compatibility)
  if (!includeSchema && "$schema" in result) {
    const { $schema: _, ...rest } = result;
    return rest as JSONSchema;
  }

  return result;
}

/**
 * Extract property descriptions from a Zod object schema
 *
 * Useful for generating help text or documentation.
 *
 * @param schema - Zod object schema
 * @returns Map of property names to descriptions
 *
 * @internal
 */
export function extractPropertyDescriptions(
  schema: z.ZodObject<z.ZodRawShape>
): Map<string, string> {
  const descriptions = new Map<string, string>();
  const jsonSchema = zodToJsonSchema(schema);

  if (
    typeof jsonSchema === "object" &&
    jsonSchema !== null &&
    "properties" in jsonSchema &&
    typeof jsonSchema.properties === "object" &&
    jsonSchema.properties !== null
  ) {
    const properties = jsonSchema.properties as Record<string, unknown>;
    for (const [key, value] of Object.entries(properties)) {
      if (
        typeof value === "object" &&
        value !== null &&
        "description" in value &&
        typeof (value as Record<string, unknown>).description === "string"
      ) {
        descriptions.set(key, (value as Record<string, unknown>).description as string);
      }
    }
  }

  return descriptions;
}

/**
 * Check if a value is a Zod schema
 *
 * @param value - Value to check
 * @returns True if the value is a Zod schema
 *
 * @internal
 */
export function isZodSchema(value: unknown): value is z.ZodType {
  return (
    typeof value === "object" &&
    value !== null &&
    "_def" in value &&
    typeof (value as { _def: unknown })._def === "object"
  );
}

/**
 * Normalize a schema input to a Zod schema.
 *
 * If the input is already a Zod schema, returns it as-is.
 * If the input is a plain object with Zod schema values, wraps it with z.object().
 *
 * @param input - Either a Zod schema or a plain object with Zod schema values
 * @returns A Zod schema
 *
 * @example
 * ```typescript
 * // Already a Zod schema - pass through
 * normalizeSchema(z.object({ name: z.string() }));
 *
 * // Plain object - auto-wrapped
 * normalizeSchema({ name: z.string() }); // Returns z.object({ name: z.string() })
 * ```
 *
 * @internal
 */
export function normalizeSchema<T extends SchemaInput>(input: T): NormalizeSchema<T> {
  // Check if input is already a Zod schema
  if (isZodSchema(input)) {
    return input as NormalizeSchema<T>;
  }

  // Input is a plain object with Zod schema values - wrap with z.object()
  const shape: Record<string, z.ZodType> = {};

  for (const [key, value] of Object.entries(input)) {
    if (!isZodSchema(value)) {
      throw new Error(
        `Invalid schema definition: property "${key}" must be a Zod schema, got ${typeof value}`
      );
    }
    shape[key] = value as z.ZodType;
  }

  return z.object(shape) as NormalizeSchema<T>;
}
