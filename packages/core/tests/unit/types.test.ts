/**
 * Unit tests for type inference utilities
 *
 * These tests verify that TypeScript type inference works correctly
 * for tool definitions using Zod schemas.
 */

import { describe, it, expect, expectTypeOf } from "vitest";
import { z } from "zod";
import type { ToolDefs, InferToolInputs, InferToolOutputs } from "../../src/types/tools";

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
});
