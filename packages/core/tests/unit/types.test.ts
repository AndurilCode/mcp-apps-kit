/**
 * Unit tests for type inference utilities
 *
 * These tests verify that TypeScript type inference works correctly
 * for tool definitions using Zod schemas.
 */

import { describe, it, expect, expectTypeOf } from "vitest";
import { z } from "zod";
import type {
  ToolDefs,
  InferToolInputs,
  InferToolOutputs,
  ClientToolsFromCore,
} from "../../src/types/tools";
import { createApp, defineTool, normalizeSchema, tool } from "../../src/index.js";

describe("type inference utilities", () => {
  describe("InferToolInputs", () => {
    it("should infer input types from Zod schemas", () => {
      const tools = {
        greet: {
          description: "Greet a user",
          input: z.object({ name: z.string() }),
          output: z.object({ message: z.string() }),
          handler: async ({ name }: { name: string }) => ({ message: `Hello, ${name}!` }),
        },
      } satisfies ToolDefs;

      type Inputs = InferToolInputs<typeof tools>;

      // Type-level assertions
      expectTypeOf<Inputs["greet"]>().toEqualTypeOf<{ name: string }>();
    });

    it("should infer complex input types", () => {
      const tools = {
        calculate: {
          description: "Calculate expression",
          input: z.object({
            operation: z.enum(["add", "subtract", "multiply", "divide"]),
            operands: z.array(z.number()),
            precision: z.number().optional(),
          }),
          output: z.object({ result: z.number() }),
          handler: async (input) => ({ result: 0 }),
        },
      } satisfies ToolDefs;

      type Inputs = InferToolInputs<typeof tools>;

      expectTypeOf<Inputs["calculate"]>().toEqualTypeOf<{
        operation: "add" | "subtract" | "multiply" | "divide";
        operands: number[];
        precision?: number;
      }>();
    });

    it("should handle multiple tools", () => {
      const tools = {
        foo: {
          description: "Foo",
          input: z.object({ a: z.string() }),
          output: z.object({ b: z.string() }),
          handler: async ({ a }) => ({ b: a }),
        },
        bar: {
          description: "Bar",
          input: z.object({ x: z.number() }),
          output: z.object({ y: z.number() }),
          handler: async ({ x }) => ({ y: x }),
        },
      } satisfies ToolDefs;

      type Inputs = InferToolInputs<typeof tools>;

      expectTypeOf<Inputs["foo"]>().toEqualTypeOf<{ a: string }>();
      expectTypeOf<Inputs["bar"]>().toEqualTypeOf<{ x: number }>();
    });
  });

  describe("InferToolOutputs", () => {
    it("should infer output types from Zod schemas", () => {
      const tools = {
        greet: {
          description: "Greet a user",
          input: z.object({ name: z.string() }),
          output: z.object({ message: z.string(), timestamp: z.number() }),
          handler: async ({ name }) => ({ message: `Hello, ${name}!`, timestamp: Date.now() }),
        },
      } satisfies ToolDefs;

      type Outputs = InferToolOutputs<typeof tools>;

      expectTypeOf<Outputs["greet"]>().toEqualTypeOf<{ message: string; timestamp: number }>();
    });

    it("should handle optional output fields", () => {
      const tools = {
        search: {
          description: "Search",
          input: z.object({ query: z.string() }),
          output: z.object({
            results: z.array(z.string()),
            nextPage: z.string().optional(),
          }),
          handler: async ({ query }) => ({ results: [query] }),
        },
      } satisfies ToolDefs;

      type Outputs = InferToolOutputs<typeof tools>;

      expectTypeOf<Outputs["search"]>().toEqualTypeOf<{
        results: string[];
        nextPage?: string;
      }>();
    });
  });

  describe("ToolDefs type", () => {
    it("should accept valid tool definitions", () => {
      const validTools: ToolDefs = {
        example: {
          description: "An example tool",
          input: z.object({ param: z.string() }),
          output: z.object({ result: z.string() }),
          handler: async (input) => ({ result: input.param }),
        },
      };

      expect(validTools).toBeDefined();
    });

    it("should accept tools with visibility", () => {
      const toolsWithVisibility: ToolDefs = {
        publicTool: {
          description: "Visible to all",
          visibility: "public",
          input: z.object({}),
          output: z.object({}),
          handler: async () => ({}),
        },
        llmOnly: {
          description: "Only for LLM",
          visibility: "llm-only",
          input: z.object({}),
          output: z.object({}),
          handler: async () => ({}),
        },
      };

      expect(toolsWithVisibility.publicTool.visibility).toBe("public");
      expect(toolsWithVisibility.llmOnly.visibility).toBe("llm-only");
    });

    it("should accept tools with UI references", () => {
      const toolsWithUI: ToolDefs = {
        widget: {
          description: "Renders a widget",
          input: z.object({ data: z.string() }),
          output: z.object({ rendered: z.boolean() }),
          handler: async () => ({ rendered: true }),
          ui: "my-widget",
        },
      };

      expect(toolsWithUI.widget.ui).toBe("my-widget");
    });
  });

  describe("clientTypes property", () => {
    it("should expose clientTypes phantom type on single-version app", () => {
      const greetTool = defineTool({
        title: "Greet",
        description: "Greet user",
        input: z.object({ name: z.string() }),
        output: z.object({ message: z.string() }),
        handler: async (input) => ({ message: `Hello ${input.name}` }),
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: { greet: greetTool },
      });

      type Expected = ClientToolsFromCore<{ greet: typeof greetTool }>;
      expectTypeOf(app.clientTypes).toEqualTypeOf<Expected>();
    });

    it("should expose clientTypes for each version in multi-version app", () => {
      const v1Tool = defineTool({
        title: "Greet V1",
        description: "Greet user v1",
        input: z.object({ name: z.string() }),
        output: z.object({ message: z.string() }),
        handler: async (input) => ({ message: `Hello ${input.name}` }),
      });

      const v2Tool = defineTool({
        title: "Greet V2",
        description: "Greet user v2",
        input: z.object({ name: z.string(), greeting: z.string() }),
        output: z.object({ message: z.string(), timestamp: z.string() }),
        handler: async (input) => ({
          message: `${input.greeting} ${input.name}`,
          timestamp: new Date().toISOString(),
        }),
      });

      const app = createApp({
        name: "test-app",
        versions: {
          v1: { version: "1.0.0", tools: { greet: v1Tool } },
          v2: { version: "2.0.0", tools: { greet: v2Tool } },
        },
      });

      const v1 = app.getVersion("v1")!;
      const v2 = app.getVersion("v2")!;

      type ExpectedV1 = ClientToolsFromCore<{ greet: typeof v1Tool }>;
      type ExpectedV2 = ClientToolsFromCore<{ greet: typeof v2Tool }>;

      expectTypeOf(v1.clientTypes).toEqualTypeOf<ExpectedV1>();
      expectTypeOf(v2.clientTypes).toEqualTypeOf<ExpectedV2>();
    });

    it("should infer correct client input and output types", () => {
      const greetTool = defineTool({
        title: "Greet",
        description: "Greet user",
        input: z.object({
          name: z.string(),
          age: z.number().optional(),
        }),
        output: z.object({
          message: z.string(),
          timestamp: z.date(),
        }),
        handler: async (input) => ({
          message: `Hello ${input.name}`,
          timestamp: new Date(),
        }),
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: { greet: greetTool },
      });

      // Type-level verification (avoid runtime access of phantom property)
      type ActualClientTypes = typeof app.clientTypes;
      type ExpectedClientTypes = {
        greet: {
          input: { name: string; age?: number };
          output: { message: string; timestamp: Date };
        };
      };

      expectTypeOf<ActualClientTypes>().toMatchTypeOf<ExpectedClientTypes>();
    });
  });
});

describe("defineTool with inline schema syntax", () => {
  describe("type inference", () => {
    it("should infer input type from inline object syntax", () => {
      const tool = defineTool({
        description: "Test tool",
        input: { name: z.string(), age: z.number() },
        output: { message: z.string() },
        handler: async (input) => {
          // Type assertion - input should be { name: string; age: number }
          expectTypeOf(input).toEqualTypeOf<{ name: string; age: number }>();
          return { message: `Hello ${input.name}` };
        },
      });

      // Verify the tool's input is a ZodObject
      expect(tool.input instanceof z.ZodObject).toBe(true);
    });

    it("should infer output type from inline object syntax", () => {
      const tool = defineTool({
        description: "Test tool",
        input: { name: z.string() },
        output: { message: z.string(), count: z.number() },
        handler: async (input) => {
          return { message: `Hello ${input.name}`, count: 1 };
        },
      });

      expect(tool.output instanceof z.ZodObject).toBe(true);
    });

    it("should support mixed syntax (explicit input, inline output)", () => {
      const tool = defineTool({
        description: "Test tool",
        input: z.object({ name: z.string() }),
        output: { message: z.string() },
        handler: async (input) => {
          expectTypeOf(input).toEqualTypeOf<{ name: string }>();
          return { message: `Hello ${input.name}` };
        },
      });

      expect(tool.input instanceof z.ZodObject).toBe(true);
      expect(tool.output instanceof z.ZodObject).toBe(true);
    });

    it("should support mixed syntax (inline input, explicit output)", () => {
      const tool = defineTool({
        description: "Test tool",
        input: { name: z.string() },
        output: z.object({ message: z.string() }),
        handler: async (input) => {
          expectTypeOf(input).toEqualTypeOf<{ name: string }>();
          return { message: `Hello ${input.name}` };
        },
      });

      expect(tool.input instanceof z.ZodObject).toBe(true);
      expect(tool.output instanceof z.ZodObject).toBe(true);
    });
  });

  describe("backward compatibility", () => {
    it("should maintain backward compatibility with explicit Zod schemas", () => {
      const tool = defineTool({
        description: "Test tool",
        input: z.object({ name: z.string() }),
        output: z.object({ message: z.string() }),
        handler: async (input) => {
          expectTypeOf(input).toEqualTypeOf<{ name: string }>();
          return { message: `Hello ${input.name}` };
        },
      });

      expect(tool.input instanceof z.ZodObject).toBe(true);
    });

    it("should work with optional output", () => {
      const tool = defineTool({
        description: "Test tool",
        input: { name: z.string() },
        // No output defined
        handler: async (input) => {
          return { _text: `Greeted ${input.name}` };
        },
      });

      expect(tool.input instanceof z.ZodObject).toBe(true);
      expect(tool.output).toBeUndefined();
    });
  });

  describe("runtime normalization", () => {
    it("should normalize inline input to ZodObject", () => {
      const tool = defineTool({
        description: "Test tool",
        input: { name: z.string(), age: z.number() },
        handler: async (input) => ({ _text: "done" }),
      });

      // Verify the normalized schema works for parsing
      const result = tool.input.parse({ name: "John", age: 30 });
      expect(result).toEqual({ name: "John", age: 30 });
    });

    it("should normalize inline output to ZodObject", () => {
      const tool = defineTool({
        description: "Test tool",
        input: {},
        output: { message: z.string(), count: z.number() },
        handler: async () => ({ message: "hello", count: 1 }),
      });

      // Verify the normalized schema works for parsing
      const result = tool.output!.parse({ message: "test", count: 42 });
      expect(result).toEqual({ message: "test", count: 42 });
    });

    it("should preserve schema identity for explicit Zod schemas", () => {
      const inputSchema = z.object({ name: z.string() });
      const outputSchema = z.object({ message: z.string() });

      const tool = defineTool({
        description: "Test tool",
        input: inputSchema,
        output: outputSchema,
        handler: async (input) => ({ message: `Hello ${input.name}` }),
      });

      // The normalized schema should be the same object for explicit schemas
      expect(tool.input).toBe(inputSchema);
      expect(tool.output).toBe(outputSchema);
    });

    it("should handle empty inline input", () => {
      const tool = defineTool({
        description: "Ping tool",
        input: {},
        output: { status: z.literal("ok") },
        handler: async () => ({ status: "ok" as const }),
      });

      expect(tool.input instanceof z.ZodObject).toBe(true);
      const result = tool.input.parse({});
      expect(result).toEqual({});
    });
  });

  describe("complex schemas", () => {
    it("should handle nested Zod schemas in inline syntax", () => {
      const tool = defineTool({
        description: "Test tool",
        input: {
          user: z.object({ name: z.string(), email: z.string() }),
          tags: z.array(z.string()),
        },
        handler: async (input) => {
          expectTypeOf(input.user).toEqualTypeOf<{ name: string; email: string }>();
          expectTypeOf(input.tags).toEqualTypeOf<string[]>();
          return { _text: "done" };
        },
      });

      const result = tool.input.parse({
        user: { name: "John", email: "john@example.com" },
        tags: ["admin", "user"],
      });

      expect(result).toEqual({
        user: { name: "John", email: "john@example.com" },
        tags: ["admin", "user"],
      });
    });

    it("should handle optional fields in inline syntax", () => {
      const tool = defineTool({
        description: "Test tool",
        input: {
          required: z.string(),
          optional: z.number().optional(),
        },
        handler: async (input) => {
          expectTypeOf(input.required).toEqualTypeOf<string>();
          expectTypeOf(input.optional).toEqualTypeOf<number | undefined>();
          return { _text: "done" };
        },
      });

      // Should parse with optional field
      expect(tool.input.parse({ required: "hello", optional: 42 })).toEqual({
        required: "hello",
        optional: 42,
      });

      // Should parse without optional field
      expect(tool.input.parse({ required: "hello" })).toEqual({
        required: "hello",
      });
    });
  });

  describe("edge cases", () => {
    it("should handle deeply nested Zod objects in inline syntax", () => {
      const tool = defineTool({
        description: "Test tool with deeply nested schemas",
        input: {
          level1: z.object({
            level2: z.object({
              level3: z.object({
                value: z.string(),
              }),
            }),
          }),
        },
        handler: async (input) => {
          expectTypeOf(input.level1.level2.level3.value).toEqualTypeOf<string>();
          return { _text: input.level1.level2.level3.value };
        },
      });

      const result = tool.input.parse({
        level1: { level2: { level3: { value: "deep" } } },
      });
      expect(result.level1.level2.level3.value).toBe("deep");
    });

    it("should preserve .describe() on inline schema fields", () => {
      const tool = defineTool({
        description: "Test tool with descriptions",
        input: {
          name: z.string().describe("The user's full name"),
          age: z.number().min(0).max(150).describe("Age in years"),
          email: z.string().email().describe("Valid email address"),
        },
        handler: async (input) => ({ _text: input.name }),
      });

      // Verify schema is a ZodObject with correct shape
      expect(tool.input instanceof z.ZodObject).toBe(true);

      // Parsing should work with valid data
      const result = tool.input.parse({
        name: "John Doe",
        age: 30,
        email: "john@example.com",
      });
      expect(result.name).toBe("John Doe");
    });

    it("should work with Zod transformations in inline syntax", () => {
      const tool = defineTool({
        description: "Test tool with transforms",
        input: {
          date: z.string().transform((s) => new Date(s)),
          count: z.string().transform(Number),
        },
        handler: async (input) => {
          expectTypeOf(input.date).toEqualTypeOf<Date>();
          expectTypeOf(input.count).toEqualTypeOf<number>();
          return { _text: `${input.count}` };
        },
      });

      const result = tool.input.parse({
        date: "2024-01-15",
        count: "42",
      });
      expect(result.date instanceof Date).toBe(true);
      expect(result.count).toBe(42);
    });

    it("should work with Zod refinements in inline syntax", () => {
      const tool = defineTool({
        description: "Test tool with refinements",
        input: {
          password: z
            .string()
            .min(8)
            .refine((p) => /[A-Z]/.test(p), {
              message: "Must contain uppercase",
            }),
          confirmPassword: z.string(),
        },
        handler: async (input) => ({ _text: "valid" }),
      });

      // Valid input
      expect(() =>
        tool.input.parse({ password: "Password1", confirmPassword: "Password1" })
      ).not.toThrow();

      // Invalid input (no uppercase)
      expect(() =>
        tool.input.parse({ password: "password1", confirmPassword: "password1" })
      ).toThrow();
    });

    it("should work with enums in inline syntax", () => {
      const tool = defineTool({
        description: "Test tool with enums",
        input: {
          status: z.enum(["pending", "active", "completed"]),
          priority: z.enum(["low", "medium", "high"]).optional(),
        },
        handler: async (input) => {
          expectTypeOf(input.status).toEqualTypeOf<"pending" | "active" | "completed">();
          expectTypeOf(input.priority).toEqualTypeOf<"low" | "medium" | "high" | undefined>();
          return { _text: input.status };
        },
      });

      const result = tool.input.parse({ status: "active" });
      expect(result.status).toBe("active");
    });

    it("should work with arrays of objects in inline syntax", () => {
      const tool = defineTool({
        description: "Test tool with array of objects",
        input: {
          items: z.array(
            z.object({
              id: z.number(),
              name: z.string(),
            })
          ),
        },
        output: {
          count: z.number(),
          names: z.array(z.string()),
        },
        handler: async (input) => ({
          count: input.items.length,
          names: input.items.map((i) => i.name),
        }),
      });

      const result = tool.input.parse({
        items: [
          { id: 1, name: "Alice" },
          { id: 2, name: "Bob" },
        ],
      });
      expect(result.items).toHaveLength(2);
    });

    it("should work with unions in inline syntax", () => {
      const tool = defineTool({
        description: "Test tool with union types",
        input: {
          value: z.union([z.string(), z.number()]),
          action: z.union([z.literal("create"), z.literal("update"), z.literal("delete")]),
        },
        handler: async (input) => {
          expectTypeOf(input.value).toEqualTypeOf<string | number>();
          expectTypeOf(input.action).toEqualTypeOf<"create" | "update" | "delete">();
          return { _text: String(input.value) };
        },
      });

      expect(tool.input.parse({ value: "test", action: "create" })).toEqual({
        value: "test",
        action: "create",
      });
      expect(tool.input.parse({ value: 123, action: "update" })).toEqual({
        value: 123,
        action: "update",
      });
    });

    it("should handle mixed inline/explicit in complex multi-tool scenario", () => {
      // Tool 1: Fully inline
      const tool1 = defineTool({
        description: "Tool with inline syntax",
        input: { query: z.string() },
        output: { results: z.array(z.string()) },
        handler: async (input) => ({ results: [input.query] }),
      });

      // Tool 2: Fully explicit
      const explicitInput = z.object({ id: z.number() });
      const explicitOutput = z.object({ found: z.boolean() });
      const tool2 = defineTool({
        description: "Tool with explicit syntax",
        input: explicitInput,
        output: explicitOutput,
        handler: async (input) => ({ found: input.id > 0 }),
      });

      // Tool 3: Mixed (inline input, explicit output)
      const mixedOutput = z.object({ message: z.string(), code: z.number() });
      const tool3 = defineTool({
        description: "Tool with mixed syntax",
        input: { action: z.enum(["start", "stop"]) },
        output: mixedOutput,
        handler: async (input) => ({
          message: `Action: ${input.action}`,
          code: input.action === "start" ? 1 : 0,
        }),
      });

      // All tools should have proper ZodObject inputs/outputs
      expect(tool1.input instanceof z.ZodObject).toBe(true);
      expect(tool1.output instanceof z.ZodObject).toBe(true);
      expect(tool2.input).toBe(explicitInput);
      expect(tool2.output).toBe(explicitOutput);
      expect(tool3.input instanceof z.ZodObject).toBe(true);
      expect(tool3.output).toBe(mixedOutput);
    });

    it("should work with default values in inline syntax", () => {
      const tool = defineTool({
        description: "Test tool with defaults",
        input: {
          name: z.string(),
          limit: z.number().default(10),
          active: z.boolean().default(true),
        },
        handler: async (input) => {
          expectTypeOf(input.limit).toEqualTypeOf<number>();
          expectTypeOf(input.active).toEqualTypeOf<boolean>();
          return { _text: `${input.name}: ${input.limit}` };
        },
      });

      const result = tool.input.parse({ name: "test" });
      expect(result).toEqual({ name: "test", limit: 10, active: true });
    });

    it("should work with nullable fields in inline syntax", () => {
      const tool = defineTool({
        description: "Test tool with nullable",
        input: {
          required: z.string(),
          nullable: z.string().nullable(),
          optionalNullable: z.string().nullable().optional(),
        },
        handler: async (input) => {
          expectTypeOf(input.required).toEqualTypeOf<string>();
          expectTypeOf(input.nullable).toEqualTypeOf<string | null>();
          expectTypeOf(input.optionalNullable).toEqualTypeOf<string | null | undefined>();
          return { _text: input.required };
        },
      });

      expect(tool.input.parse({ required: "test", nullable: null })).toEqual({
        required: "test",
        nullable: null,
      });
    });
  });

  describe("AssertZodShape type safety", () => {
    it("should correctly type valid Zod shapes", () => {
      type ValidShape = { name: z.ZodString; age: z.ZodNumber };
      type Asserted = import("../../src/utils/schema").AssertZodShape<ValidShape>;

      // Valid shape should preserve types
      expectTypeOf<Asserted["name"]>().toEqualTypeOf<z.ZodString>();
      expectTypeOf<Asserted["age"]>().toEqualTypeOf<z.ZodNumber>();
    });

    it("should mark invalid properties as never", () => {
      type InvalidShape = { name: z.ZodString; age: number };
      type Asserted = import("../../src/utils/schema").AssertZodShape<InvalidShape>;

      // Valid property preserved
      expectTypeOf<Asserted["name"]>().toEqualTypeOf<z.ZodString>();
      // Invalid property becomes never
      expectTypeOf<Asserted["age"]>().toEqualTypeOf<never>();
    });

    it("should handle mixed valid/invalid properties", () => {
      type MixedShape = {
        valid1: z.ZodString;
        invalid1: string;
        valid2: z.ZodOptional<z.ZodNumber>;
        invalid2: boolean;
      };
      type Asserted = import("../../src/utils/schema").AssertZodShape<MixedShape>;

      expectTypeOf<Asserted["valid1"]>().toEqualTypeOf<z.ZodString>();
      expectTypeOf<Asserted["valid2"]>().toEqualTypeOf<z.ZodOptional<z.ZodNumber>>();
      expectTypeOf<Asserted["invalid1"]>().toEqualTypeOf<never>();
      expectTypeOf<Asserted["invalid2"]>().toEqualTypeOf<never>();
    });

    it("should throw runtime error for non-Zod values in inline syntax", () => {
      // Runtime error for invalid schema
      const invalidSchema = { name: "not a zod schema" };
      expect(() => normalizeSchema(invalidSchema as never)).toThrow(
        'Invalid schema definition: property "name" must be a Zod schema'
      );
    });

    it("should throw runtime error for mixed valid/invalid values", () => {
      const mixedSchema = { valid: z.string(), invalid: 123 };
      expect(() => normalizeSchema(mixedSchema as never)).toThrow(
        'Invalid schema definition: property "invalid" must be a Zod schema'
      );
    });
  });
});

describe("output type inference without explicit schema (PRD-004)", () => {
  describe("inline tool objects", () => {
    it("should infer output type from handler return when output is omitted", () => {
      const tools = {
        greet: {
          description: "Greet a user",
          input: z.object({ name: z.string() }),
          // No output schema
          handler: async ({ name }: { name: string }) => ({
            message: `Hello, ${name}!`,
            timestamp: Date.now(),
          }),
        },
      } satisfies ToolDefs;

      // Type-level: InferToolOutputs should infer from handler return
      type Outputs = InferToolOutputs<typeof tools>;
      expectTypeOf<Outputs["greet"]>().toEqualTypeOf<{ message: string; timestamp: number }>();
    });

    it("should exclude meta keys from inferred output type", () => {
      const tools = {
        test: {
          description: "Test tool",
          input: z.object({}),
          handler: async () => ({
            data: "value",
            _meta: { internal: "data" },
            _text: "narration",
            _closeWidget: true,
          }),
        },
      } satisfies ToolDefs;

      // Meta keys should be stripped from inferred output
      type Outputs = InferToolOutputs<typeof tools>;
      expectTypeOf<Outputs["test"]>().toEqualTypeOf<{ data: string }>();
    });

    it("should work with ClientToolsFromCore for inline tools", () => {
      const tools = {
        search: {
          description: "Search items",
          input: z.object({ query: z.string() }),
          handler: async ({ query }: { query: string }) => ({
            results: [query],
            count: 1,
          }),
        },
      } satisfies ToolDefs;

      type ClientTools = ClientToolsFromCore<typeof tools>;
      expectTypeOf<ClientTools["search"]["output"]>().toEqualTypeOf<{
        results: string[];
        count: number;
      }>();
    });
  });

  describe("defineTool without output", () => {
    it("should infer output type from handler return", () => {
      const myTool = defineTool({
        description: "Get user info",
        input: z.object({ id: z.string() }),
        handler: async (input) => ({
          userId: input.id,
          name: "John Doe",
          verified: true,
        }),
      });

      // Test via ClientToolsFromCore
      type ClientTools = ClientToolsFromCore<{ test: typeof myTool }>;
      expectTypeOf<ClientTools["test"]["output"]>().toEqualTypeOf<{
        userId: string;
        name: string;
        verified: boolean;
      }>();
    });

    it("should exclude meta keys from inferred defineTool output", () => {
      const myTool = defineTool({
        description: "Test tool",
        input: z.object({}),
        handler: async () => ({
          status: "ok",
          _meta: { debug: true },
          _text: "Done",
        }),
      });

      type ClientTools = ClientToolsFromCore<{ test: typeof myTool }>;
      expectTypeOf<ClientTools["test"]["output"]>().toEqualTypeOf<{ status: string }>();
    });

    it("should preserve explicit output schema when provided", () => {
      const myTool = defineTool({
        description: "Test tool",
        input: z.object({}),
        output: z.object({ result: z.string() }),
        handler: async () => ({ result: "test" }),
      });

      type ClientTools = ClientToolsFromCore<{ test: typeof myTool }>;
      expectTypeOf<ClientTools["test"]["output"]>().toEqualTypeOf<{ result: string }>();
    });
  });

  describe("fluent builder without output", () => {
    it("should infer output type from handler return", () => {
      const myTool = tool("getData")
        .describe("Get some data")
        .input(z.object({ key: z.string() }))
        .handle(async (input) => ({
          key: input.key,
          value: "test-value",
          cached: false,
        }))
        .build();

      type ClientTools = ClientToolsFromCore<{ getData: typeof myTool }>;
      expectTypeOf<ClientTools["getData"]["output"]>().toEqualTypeOf<{
        key: string;
        value: string;
        cached: boolean;
      }>();
    });

    it("should exclude meta keys from inferred builder output", () => {
      const builtTool = tool("test")
        .describe("Test")
        .input(z.object({}))
        .handle(async () => ({
          data: 123,
          _meta: { foo: "bar" },
          _closeWidget: true,
        }))
        .build();

      type ClientTools = ClientToolsFromCore<{ test: typeof builtTool }>;
      expectTypeOf<ClientTools["test"]["output"]>().toEqualTypeOf<{ data: number }>();
    });

    it("should preserve explicit output when provided via builder", () => {
      const builtTool = tool("test")
        .describe("Test")
        .input(z.object({}))
        .output(z.object({ result: z.number() }))
        .handle(async () => ({ result: 42 }))
        .build();

      type ClientTools = ClientToolsFromCore<{ test: typeof builtTool }>;
      expectTypeOf<ClientTools["test"]["output"]>().toEqualTypeOf<{ result: number }>();
    });
  });

  describe("complex inference scenarios", () => {
    it("should handle nested objects in inferred output", () => {
      const myTool = defineTool({
        description: "Get user",
        input: z.object({ id: z.string() }),
        handler: async (input) => ({
          user: {
            id: input.id,
            profile: {
              name: "John",
              email: "john@example.com",
            },
          },
          metadata: {
            timestamp: new Date(),
            version: 1,
          },
        }),
      });

      type ClientTools = ClientToolsFromCore<{ getUser: typeof myTool }>;
      expectTypeOf<ClientTools["getUser"]["output"]>().toMatchTypeOf<{
        user: {
          id: string;
          profile: {
            name: string;
            email: string;
          };
        };
        metadata: {
          timestamp: Date;
          version: number;
        };
      }>();
    });

    it("should handle arrays in inferred output", () => {
      const myTool = defineTool({
        description: "Search",
        input: z.object({ query: z.string() }),
        handler: async (input) => ({
          results: [{ id: "1", title: input.query }],
          total: 1,
        }),
      });

      type ClientTools = ClientToolsFromCore<{ search: typeof myTool }>;
      expectTypeOf<ClientTools["search"]["output"]>().toMatchTypeOf<{
        results: Array<{ id: string; title: string }>;
        total: number;
      }>();
    });

    it("should handle optional fields in inferred output", () => {
      const myTool = defineTool({
        description: "Get data",
        input: z.object({}),
        handler: async () => ({
          required: "value",
          optional: Math.random() > 0.5 ? "maybe" : undefined,
        }),
      });

      type ClientTools = ClientToolsFromCore<{ getData: typeof myTool }>;
      expectTypeOf<ClientTools["getData"]["output"]>().toMatchTypeOf<{
        required: string;
        optional?: string;
      }>();
    });
  });
});
