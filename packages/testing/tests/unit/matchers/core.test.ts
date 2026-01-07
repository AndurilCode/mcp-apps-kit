/**
 * Unit tests for core matchers
 */

import { describe, it, expect } from "vitest";
import {
  matchesToolSchema,
  isSuccessfulToolResult,
  hasToolError,
  containsToolText,
  matchesToolObject,
} from "../../../src/matchers/core";
import type { ToolResult } from "../../../src/types";

describe("core matchers", () => {
  describe("matchesToolSchema", () => {
    it("should pass when result matches schema", async () => {
      const { z } = await import("zod");
      const result: ToolResult = {
        content: [{ type: "text", text: '{"message":"Hello"}' }],
        isError: false,
      };
      const schema = z.object({ message: z.string() });

      const matcherResult = matchesToolSchema(result, schema);
      expect(matcherResult.pass).toBe(true);
    });

    it("should fail when result doesn't match schema", async () => {
      const { z } = await import("zod");
      const result: ToolResult = {
        content: [{ type: "text", text: '{"message":"Hello"}' }],
        isError: false,
      };
      const schema = z.object({ count: z.number() });

      const matcherResult = matchesToolSchema(result, schema);
      expect(matcherResult.pass).toBe(false);
      expect(matcherResult.message()).toContain("validation failed");
    });
  });

  describe("isSuccessfulToolResult", () => {
    it("should pass when result has no error", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: "Success" }],
        isError: false,
      };

      const matcherResult = isSuccessfulToolResult(result);
      expect(matcherResult.pass).toBe(true);
    });

    it("should fail when result has error", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: "Error" }],
        isError: true,
      };

      const matcherResult = isSuccessfulToolResult(result);
      expect(matcherResult.pass).toBe(false);
    });
  });

  describe("hasToolError", () => {
    it("should pass when result has error", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: "VALIDATION_ERROR: Invalid" }],
        isError: true,
      };

      const matcherResult = hasToolError(result);
      expect(matcherResult.pass).toBe(true);
    });

    it("should fail when result has no error", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: "Success" }],
        isError: false,
      };

      const matcherResult = hasToolError(result);
      expect(matcherResult.pass).toBe(false);
    });

    it("should check error code when provided", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: "VALIDATION_ERROR: Invalid" }],
        isError: true,
      };

      const matcherResult = hasToolError(result, "VALIDATION_ERROR");
      expect(matcherResult.pass).toBe(true);
    });
  });

  describe("containsToolText", () => {
    it("should pass when result contains text", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: "Hello, Alice!" }],
        isError: false,
      };

      const matcherResult = containsToolText(result, "Alice");
      expect(matcherResult.pass).toBe(true);
    });

    it("should fail when result doesn't contain text", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: "Hello, Bob!" }],
        isError: false,
      };

      const matcherResult = containsToolText(result, "Alice");
      expect(matcherResult.pass).toBe(false);
    });
  });

  describe("matchesToolObject", () => {
    it("should pass when result matches object", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: '{"message":"Hello"}' }],
        isError: false,
      };

      const matcherResult = matchesToolObject(result, { message: "Hello" });
      expect(matcherResult.pass).toBe(true);
    });

    it("should fail when result doesn't match object", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: '{"message":"Hello"}' }],
        isError: false,
      };

      const matcherResult = matchesToolObject(result, { message: "Goodbye" });
      expect(matcherResult.pass).toBe(false);
    });
  });
});
