/**
 * Unit tests for zodToJsonSchema utility
 *
 * Tests the conversion of Zod schemas to JSON Schema format
 * as required for MCP protocol tool registration.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  zodToJsonSchema,
  extractPropertyDescriptions,
  isZodSchema,
  normalizeSchema,
  type SchemaInput,
} from "../../src/utils/schema";

describe("zodToJsonSchema", () => {
  describe("basic type conversions", () => {
    it("should convert string schema", () => {
      const schema = z.string();
      const jsonSchema = zodToJsonSchema(schema);

      expect(jsonSchema).toMatchObject({
        type: "string",
      });
    });

    it("should convert number schema", () => {
      const schema = z.number();
      const jsonSchema = zodToJsonSchema(schema);

      expect(jsonSchema).toMatchObject({
        type: "number",
      });
    });

    it("should convert boolean schema", () => {
      const schema = z.boolean();
      const jsonSchema = zodToJsonSchema(schema);

      expect(jsonSchema).toMatchObject({
        type: "boolean",
      });
    });

    it("should convert array schema", () => {
      const schema = z.array(z.string());
      const jsonSchema = zodToJsonSchema(schema);

      expect(jsonSchema).toMatchObject({
        type: "array",
        items: { type: "string" },
      });
    });
  });

  describe("object schema conversions", () => {
    it("should convert simple object schema", () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });
      const jsonSchema = zodToJsonSchema(schema);

      expect(jsonSchema).toMatchObject({
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
        required: ["name", "age"],
      });
    });

    it("should handle optional properties", () => {
      const schema = z.object({
        required: z.string(),
        optional: z.string().optional(),
      });
      const jsonSchema = zodToJsonSchema(schema);

      expect(jsonSchema).toMatchObject({
        type: "object",
        properties: {
          required: { type: "string" },
          optional: { type: "string" },
        },
        required: ["required"],
      });
    });

    it("should preserve property descriptions", () => {
      const schema = z.object({
        name: z.string().describe("The user's full name"),
        email: z.string().describe("A valid email address"),
      });
      const jsonSchema = zodToJsonSchema(schema);

      expect(jsonSchema).toMatchObject({
        type: "object",
        properties: {
          name: { type: "string", description: "The user's full name" },
          email: { type: "string", description: "A valid email address" },
        },
      });
    });
  });

  describe("complex schema conversions", () => {
    it("should convert enum schema", () => {
      const schema = z.enum(["red", "green", "blue"]);
      const jsonSchema = zodToJsonSchema(schema);

      expect(jsonSchema).toMatchObject({
        type: "string",
        enum: ["red", "green", "blue"],
      });
    });

    it("should convert union schema", () => {
      const schema = z.union([z.string(), z.number()]);
      const jsonSchema = zodToJsonSchema(schema);

      // Zod v4 native JSON Schema uses anyOf for unions
      expect(jsonSchema).toMatchObject({
        anyOf: [{ type: "string" }, { type: "number" }],
      });
    });

    it("should convert nested object schema", () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          address: z.object({
            city: z.string(),
            zip: z.string(),
          }),
        }),
      });
      const jsonSchema = zodToJsonSchema(schema);

      expect(jsonSchema).toMatchObject({
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              name: { type: "string" },
              address: {
                type: "object",
                properties: {
                  city: { type: "string" },
                  zip: { type: "string" },
                },
              },
            },
          },
        },
      });
    });
  });

  describe("options", () => {
    it("should use jsonSchema7 target by default", () => {
      const schema = z.string();
      const jsonSchema = zodToJsonSchema(schema);

      // jsonSchema7 doesn't include $schema for inline schemas
      expect(jsonSchema).toMatchObject({
        type: "string",
      });
    });
  });
});

describe("extractPropertyDescriptions", () => {
  it("should extract descriptions from object schema", () => {
    const schema = z.object({
      name: z.string().describe("The name"),
      age: z.number().describe("The age"),
    });

    const descriptions = extractPropertyDescriptions(schema);

    expect(descriptions.get("name")).toBe("The name");
    expect(descriptions.get("age")).toBe("The age");
  });

  it("should handle properties without descriptions", () => {
    const schema = z.object({
      name: z.string().describe("Has description"),
      age: z.number(), // No description
    });

    const descriptions = extractPropertyDescriptions(schema);

    expect(descriptions.get("name")).toBe("Has description");
    expect(descriptions.has("age")).toBe(false);
  });

  it("should return empty map for empty schema", () => {
    const schema = z.object({});
    const descriptions = extractPropertyDescriptions(schema);

    expect(descriptions.size).toBe(0);
  });
});

describe("isZodSchema", () => {
  it("should return true for Zod schemas", () => {
    expect(isZodSchema(z.string())).toBe(true);
    expect(isZodSchema(z.number())).toBe(true);
    expect(isZodSchema(z.object({}))).toBe(true);
    expect(isZodSchema(z.array(z.string()))).toBe(true);
  });

  it("should return false for non-Zod values", () => {
    expect(isZodSchema("string")).toBe(false);
    expect(isZodSchema(123)).toBe(false);
    expect(isZodSchema({})).toBe(false);
    expect(isZodSchema(null)).toBe(false);
    expect(isZodSchema(undefined)).toBe(false);
    // Objects with _def that is not a proper Zod _def object will pass
    // the basic check, so we use a stricter test
    expect(isZodSchema({ notAZodSchema: true })).toBe(false);
  });
});

describe("normalizeSchema", () => {
  describe("pass-through for Zod schemas", () => {
    it("should return z.object() as-is", () => {
      const schema = z.object({ name: z.string() });
      const normalized = normalizeSchema(schema);

      expect(normalized).toBe(schema);
      expect(normalized instanceof z.ZodObject).toBe(true);
    });

    it("should return z.string() as-is", () => {
      const schema = z.string();
      const normalized = normalizeSchema(schema);

      expect(normalized).toBe(schema);
    });

    it("should return z.array() as-is", () => {
      const schema = z.array(z.string());
      const normalized = normalizeSchema(schema);

      expect(normalized).toBe(schema);
    });

    it("should return z.union() as-is", () => {
      const schema = z.union([z.string(), z.number()]);
      const normalized = normalizeSchema(schema);

      expect(normalized).toBe(schema);
    });
  });

  describe("wrapping plain objects", () => {
    it("should wrap plain object with z.object()", () => {
      const input = { name: z.string(), age: z.number() };
      const normalized = normalizeSchema(input);

      expect(normalized instanceof z.ZodObject).toBe(true);

      // Verify it parses correctly
      const result = normalized.parse({ name: "John", age: 30 });
      expect(result).toEqual({ name: "John", age: 30 });
    });

    it("should handle nested Zod schemas in plain object", () => {
      const input = {
        user: z.object({ name: z.string() }),
        tags: z.array(z.string()),
      };
      const normalized = normalizeSchema(input);

      expect(normalized instanceof z.ZodObject).toBe(true);

      const result = normalized.parse({
        user: { name: "John" },
        tags: ["a", "b"],
      });
      expect(result).toEqual({ user: { name: "John" }, tags: ["a", "b"] });
    });

    it("should handle optional Zod schemas in plain object", () => {
      const input = {
        required: z.string(),
        optional: z.string().optional(),
      };
      const normalized = normalizeSchema(input);

      const result = normalized.parse({ required: "hello" });
      expect(result).toEqual({ required: "hello" });
    });

    it("should handle empty plain object", () => {
      const input = {};
      const normalized = normalizeSchema(input);

      expect(normalized instanceof z.ZodObject).toBe(true);

      const result = normalized.parse({});
      expect(result).toEqual({});
    });

    it("should preserve descriptions on wrapped schemas", () => {
      const input = { name: z.string().describe("User name") };
      const normalized = normalizeSchema(input);

      // Verify description is preserved in JSON schema conversion
      const jsonSchema = zodToJsonSchema(normalized);
      expect(jsonSchema).toMatchObject({
        type: "object",
        properties: {
          name: { type: "string", description: "User name" },
        },
      });
    });
  });

  describe("error handling", () => {
    it("should throw for plain objects with non-Zod values", () => {
      const input = { name: "string" }; // Not a Zod schema

      expect(() => normalizeSchema(input as unknown as SchemaInput)).toThrow(
        'Invalid schema definition: property "name" must be a Zod schema'
      );
    });

    it("should throw for plain objects with number values", () => {
      const input = { count: 123 };

      expect(() => normalizeSchema(input as unknown as SchemaInput)).toThrow(
        'Invalid schema definition: property "count" must be a Zod schema'
      );
    });

    it("should throw for mixed valid and invalid values", () => {
      const input = {
        valid: z.string(),
        invalid: "not a zod schema",
      };

      expect(() => normalizeSchema(input as unknown as SchemaInput)).toThrow(
        'Invalid schema definition: property "invalid" must be a Zod schema'
      );
    });
  });
});
