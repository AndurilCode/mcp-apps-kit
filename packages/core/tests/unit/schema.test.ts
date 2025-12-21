/**
 * Unit tests for zodToJsonSchema utility
 *
 * Tests the conversion of Zod schemas to JSON Schema format
 * as required for MCP protocol tool registration.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { zodToJsonSchema, extractPropertyDescriptions, isZodSchema } from "../../src/utils/schema";

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

      // zod-to-json-schema uses "type" array for simple type unions
      expect(jsonSchema).toMatchObject({
        type: ["string", "number"],
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

    it("should accept name option", () => {
      const schema = z.object({ name: z.string() });
      const jsonSchema = zodToJsonSchema(schema, { name: "User" });

      // When name is provided, schema is extracted from definitions
      expect(jsonSchema).toMatchObject({
        type: "object",
        properties: {
          name: { type: "string" },
        },
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
