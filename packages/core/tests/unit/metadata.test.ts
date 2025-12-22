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
    it("should map 'model' to ['model'] array", () => {
      const result = mapVisibilityToMcp("model");
      expect(result).toEqual(["model"]);
    });

    it("should map 'app' to ['app'] array", () => {
      const result = mapVisibilityToMcp("app");
      expect(result).toEqual(["app"]);
    });

    it("should map 'both' to ['model', 'app'] array", () => {
      const result = mapVisibilityToMcp("both");
      expect(result).toEqual(["model", "app"]);
    });

    it("should default to ['model', 'app'] when visibility is undefined", () => {
      const result = mapVisibilityToMcp(undefined);
      expect(result).toEqual(["model", "app"]);
    });
  });

  describe("mapVisibilityToOpenAI", () => {
    it("should map 'model' to public visibility without widget access", () => {
      const result = mapVisibilityToOpenAI("model");
      expect(result).toEqual({ "openai/visibility": "public", "openai/widgetAccessible": false });
    });

    it("should map 'app' to private visibility with widget access", () => {
      const result = mapVisibilityToOpenAI("app");
      expect(result).toEqual({ "openai/visibility": "private", "openai/widgetAccessible": true });
    });

    it("should map 'both' to public visibility with widget access", () => {
      const result = mapVisibilityToOpenAI("both");
      expect(result).toEqual({ "openai/visibility": "public", "openai/widgetAccessible": true });
    });

    it("should default to 'both' when visibility is undefined", () => {
      const result = mapVisibilityToOpenAI(undefined);
      expect(result).toEqual({ "openai/visibility": "public", "openai/widgetAccessible": true });
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
        visibility: ["model"],
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
