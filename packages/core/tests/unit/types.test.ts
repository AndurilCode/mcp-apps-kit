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
import { createApp, defineTool } from "../../src/index.js";

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
});
