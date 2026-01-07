/**
 * Unit tests for behavior matchers
 */

import { describe, it, expect } from "vitest";
import { expectToolResult } from "../../../src/eval/behavior";
import { AssertionError } from "../../../src/errors";
import type { ToolResult } from "../../../src/types";

describe("expectToolResult", () => {
  describe("toMatchObject", () => {
    it("should pass when result matches expected object", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: '{"message":"Hello, Alice!"}' }],
        isError: false,
      };
      expect(() => {
        expectToolResult(result).toMatchObject({ message: "Hello, Alice!" });
      }).not.toThrow();
    });

    it("should throw when result doesn't match", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: '{"message":"Hello, Bob!"}' }],
        isError: false,
      };
      expect(() => {
        expectToolResult(result).toMatchObject({ message: "Hello, Alice!" });
      }).toThrow(AssertionError);
    });

    it("should handle partial matches", () => {
      const result: ToolResult = {
        content: [
          { type: "text", text: '{"message":"Hello, Alice!","timestamp":"2024-01-01"}' },
        ],
        isError: false,
      };
      expect(() => {
        expectToolResult(result).toMatchObject({ message: "Hello, Alice!" });
      }).not.toThrow();
    });
  });

  describe("toHaveNoError", () => {
    it("should pass when result has no error", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: "Success" }],
        isError: false,
      };
      expect(() => {
        expectToolResult(result).toHaveNoError();
      }).not.toThrow();
    });

    it("should throw when result has error", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: "Error occurred" }],
        isError: true,
      };
      expect(() => {
        expectToolResult(result).toHaveNoError();
      }).toThrow(AssertionError);
    });
  });

  describe("toHaveError", () => {
    it("should pass when result has error", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: "VALIDATION_ERROR: Invalid input" }],
        isError: true,
      };
      expect(() => {
        expectToolResult(result).toHaveError();
      }).not.toThrow();
    });

    it("should throw when result has no error", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: "Success" }],
        isError: false,
      };
      expect(() => {
        expectToolResult(result).toHaveError();
      }).toThrow(AssertionError);
    });

    it("should check error code when provided", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: "VALIDATION_ERROR: Invalid input" }],
        isError: true,
      };
      expect(() => {
        expectToolResult(result).toHaveError("VALIDATION_ERROR");
      }).not.toThrow();
    });
  });

  describe("toContainText", () => {
    it("should pass when result contains text", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: "Hello, Alice!" }],
        isError: false,
      };
      expect(() => {
        expectToolResult(result).toContainText("Alice");
      }).not.toThrow();
    });

    it("should throw when result doesn't contain text", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: "Hello, Bob!" }],
        isError: false,
      };
      expect(() => {
        expectToolResult(result).toContainText("Alice");
      }).toThrow(AssertionError);
    });
  });

  describe("toMatchSchema", () => {
    it("should pass when result matches schema", async () => {
      const { z } = await import("zod");
      const result: ToolResult = {
        content: [{ type: "text", text: '{"message":"Hello","count":5}' }],
        isError: false,
      };
      const schema = z.object({
        message: z.string(),
        count: z.number(),
      });
      expect(() => {
        expectToolResult(result).toMatchSchema(schema);
      }).not.toThrow();
    });

    it("should throw when result doesn't match schema", async () => {
      const { z } = await import("zod");
      const result: ToolResult = {
        content: [{ type: "text", text: '{"message":"Hello"}' }],
        isError: false,
      };
      const schema = z.object({
        message: z.string(),
        count: z.number(),
      });
      expect(() => {
        expectToolResult(result).toMatchSchema(schema);
      }).toThrow(AssertionError);
    });
  });
});
