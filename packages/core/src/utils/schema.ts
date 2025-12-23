/**
 * Schema utilities for @mcp-apps-kit/core
 *
 * Provides Zod to JSON Schema conversion and related utilities.
 */

import { zodToJsonSchema as zodToJsonSchemaLib } from "zod-to-json-schema";
import type { z } from "zod";

// =============================================================================
// TYPES
// =============================================================================

/**
 * JSON Schema 7 compatible type
 * Using a more flexible type to accommodate zod-to-json-schema output
 */
export type JSONSchema = Record<string, unknown>;

/**
 * A Zod schema accepted by this package.
 *
 * Zod v4 provides a built-in `toJSONSchema()` method, which we prefer.
 * We keep a fallback path via `zod-to-json-schema` for older/foreign schema objects.
 */
export type ZodSchema = z.ZodType;

/**
 * Options for zodToJsonSchema conversion
 */
export interface ZodToJsonSchemaOptions {
  /**
   * Name for the schema (used in $ref strategy)
   */
  name?: string;

  /**
   * How to handle recursive types
   * - "root": Use $ref from root
   * - "none": Inline all schemas
   */
  refStrategy?: "root" | "none";

  /**
   * Target schema format
   * - "jsonSchema7": Standard JSON Schema draft-07
   * - "openApi3": OpenAPI 3.0 compatible
   */
  target?: "jsonSchema7" | "openApi3";
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
 */
export function zodToJsonSchema(
  schema: ZodSchema,
  options: ZodToJsonSchemaOptions = {}
): JSONSchema {
  const { name, refStrategy = "none", target = "jsonSchema7" } = options;

  // Zod v4: use the built-in JSON Schema generator.
  const schemaAny = schema as unknown as { toJSONSchema?: (params?: unknown) => unknown };
  if (typeof schemaAny.toJSONSchema === "function") {
    const json = schemaAny.toJSONSchema({
      target: target === "openApi3" ? "openapi-3.0" : "draft-07",
      // Prefer inlining by default to match prior behavior.
      reused: refStrategy === "root" ? "ref" : "inline",
      // Cycles can't be inlined safely; use refs.
      cycles: "ref",
      // Keep behavior tolerant for edge/unrepresentable cases.
      unrepresentable: "any",
    });

    // `name` previously affected `$ref` extraction with `zod-to-json-schema`.
    // With Zod v4's generator, we treat `name` as a no-op to keep the API stable.
    void name;

    return json as JSONSchema;
  }

  // Fallback: legacy path for schema objects without `toJSONSchema`.
  const result = zodToJsonSchemaLib(schema as unknown as never, {
    name,
    $refStrategy: refStrategy,
    target,
  }) as JSONSchema;

  // If a name was provided, the schema is wrapped in definitions
  // We need to extract just the schema for MCP tools
  if (name && typeof result === "object" && result !== null) {
    const definitions = result["definitions"] as Record<string, JSONSchema> | undefined;
    const ref = result["$ref"] as string | undefined;
    if (definitions && ref) {
      const defName = ref.replace("#/definitions/", "");
      const extracted = definitions[defName];
      if (extracted) {
        return extracted;
      }
    }
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
 */
export function isZodSchema(value: unknown): value is ZodSchema {
  return (
    typeof value === "object" &&
    value !== null &&
    "_def" in value &&
    typeof (value as { _def: unknown })._def === "object"
  );
}
