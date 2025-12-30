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
