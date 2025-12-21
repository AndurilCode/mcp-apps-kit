/**
 * Unit tests for metadata utilities
 *
 * Tests visibility mapping and metadata generation utilities.
 */

import { describe, it, expect } from "vitest";
import {
  mapVisibilityToMcp,
  mapVisibilityToOpenAI,
  generateToolMetadata,
} from "../../src/utils/metadata";
import { z } from "zod";

describe("Visibility Mapping", () => {
  describe("mapVisibilityToMcp", () => {
    it("should map 'model' to readOnlyHint: true", () => {
      const result = mapVisibilityToMcp("model");
      expect(result).toEqual({ readOnlyHint: true });
    });

    it("should map 'app' to annotation for app-only tools", () => {
      const result = mapVisibilityToMcp("app");
      expect(result).toEqual({ readOnlyHint: false, appOnly: true });
    });

    it("should map 'both' to default (no restrictions)", () => {
      const result = mapVisibilityToMcp("both");
      expect(result).toEqual({ readOnlyHint: false });
    });

    it("should default to 'both' when visibility is undefined", () => {
      const result = mapVisibilityToMcp(undefined);
      expect(result).toEqual({ readOnlyHint: false });
    });
  });

  describe("mapVisibilityToOpenAI", () => {
    it("should map 'model' to invokable by AI only", () => {
      const result = mapVisibilityToOpenAI("model");
      expect(result).toEqual({ invokableByAI: true, invokableByApp: false });
    });

    it("should map 'app' to invokable by app only", () => {
      const result = mapVisibilityToOpenAI("app");
      expect(result).toEqual({ invokableByAI: false, invokableByApp: true });
    });

    it("should map 'both' to invokable by both", () => {
      const result = mapVisibilityToOpenAI("both");
      expect(result).toEqual({ invokableByAI: true, invokableByApp: true });
    });

    it("should default to 'both' when visibility is undefined", () => {
      const result = mapVisibilityToOpenAI(undefined);
      expect(result).toEqual({ invokableByAI: true, invokableByApp: true });
    });
  });
});

describe("generateToolMetadata", () => {
  const sampleToolDef = {
    description: "Greets a user by name",
    input: z.object({ name: z.string() }),
    output: z.object({ message: z.string() }),
    handler: async (input: { name: string }) => ({ message: `Hello, ${input.name}!` }),
  };

  describe("for MCP protocol", () => {
    it("should generate basic tool metadata", () => {
      const metadata = generateToolMetadata("greet", sampleToolDef, "mcp");
      expect(metadata).toMatchObject({
        name: "greet",
        description: "Greets a user by name",
        inputSchema: expect.any(Object),
      });
    });

    it("should include UI binding when ui is specified", () => {
      const toolWithUI = { ...sampleToolDef, ui: "greeting-widget" };
      const metadata = generateToolMetadata("greet", toolWithUI, "mcp");
      expect(metadata).toMatchObject({
        annotations: expect.objectContaining({
          ui: "greeting-widget",
        }),
      });
    });

    it("should include visibility annotations", () => {
      const toolWithVisibility = { ...sampleToolDef, visibility: "model" as const };
      const metadata = generateToolMetadata("greet", toolWithVisibility, "mcp");
      expect(metadata.annotations).toMatchObject({
        readOnlyHint: true,
      });
    });
  });

  describe("for OpenAI protocol", () => {
    it("should generate OpenAI tool metadata format", () => {
      const metadata = generateToolMetadata("greet", sampleToolDef, "openai");
      expect(metadata).toMatchObject({
        type: "function",
        function: {
          name: "greet",
          description: "Greets a user by name",
          parameters: expect.any(Object),
        },
      });
    });

    it("should include UI binding in output_schema when ui is specified", () => {
      const toolWithUI = { ...sampleToolDef, ui: "greeting-widget" };
      const metadata = generateToolMetadata("greet", toolWithUI, "openai");
      expect(metadata.function).toMatchObject({
        output_schema: expect.objectContaining({
          ui: "greeting-widget",
        }),
      });
    });

    it("should include invoking/invoked messages when specified", () => {
      const toolWithMessages = {
        ...sampleToolDef,
        invokingMessage: "Greeting user...",
        invokedMessage: "User greeted successfully!",
      };
      const metadata = generateToolMetadata("greet", toolWithMessages, "openai");
      expect(metadata.function).toMatchObject({
        invokingMessage: "Greeting user...",
        invokedMessage: "User greeted successfully!",
      });
    });
  });
});
