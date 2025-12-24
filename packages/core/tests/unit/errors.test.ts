/**
 * Unit tests for error handling utilities
 *
 * Tests the AppError class, formatZodError function, and wrapError utility.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { AppError, ErrorCode, formatZodError, wrapError } from "../../src/utils/errors";

describe("AppError", () => {
  describe("constructor", () => {
    it("should create error with code and message", () => {
      const error = new AppError(ErrorCode.VALIDATION_ERROR, "Invalid input");

      expect(error.name).toBe("AppError");
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.message).toBe("Invalid input");
      expect(error.details).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });

    it("should create error with details", () => {
      const details = { field: "name", type: "required" };
      const error = new AppError(ErrorCode.INVALID_INPUT, "Name is required", details);

      expect(error.details).toEqual(details);
    });

    it("should create error with cause", () => {
      const cause = new Error("Original error");
      const error = new AppError(
        ErrorCode.INTERNAL_ERROR,
        "Something went wrong",
        undefined,
        cause
      );

      expect(error.cause).toBe(cause);
    });

    it("should maintain stack trace", () => {
      const error = new AppError(ErrorCode.INTERNAL_ERROR, "Test error");

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("AppError");
    });
  });

  describe("toMcpResponse", () => {
    it("should format simple error for MCP", () => {
      const error = new AppError(ErrorCode.VALIDATION_ERROR, "Invalid input");
      const response = error.toMcpResponse();

      expect(response).toEqual({
        content: [{ type: "text", text: "Invalid input" }],
        isError: true,
      });
    });

    it("should include details in message", () => {
      const error = new AppError(ErrorCode.INVALID_INPUT, "Validation failed", {
        field: "email",
        reason: "invalid format",
      });
      const response = error.toMcpResponse();

      expect(response.content[0].text).toContain("Validation failed");
      expect(response.content[0].text).toContain('field: "email"');
      expect(response.content[0].text).toContain('reason: "invalid format"');
    });
  });

  describe("toOpenAIResponse", () => {
    it("should format error for OpenAI", () => {
      const error = new AppError(ErrorCode.TOOL_EXECUTION_ERROR, "Tool failed");
      const response = error.toOpenAIResponse();

      expect(response).toEqual({
        content: [{ type: "text", text: "Tool failed" }],
        isError: true,
      });
    });
  });

  describe("toJSON", () => {
    it("should serialize error to JSON", () => {
      const error = new AppError(ErrorCode.VALIDATION_ERROR, "Test error", { key: "value" });
      const json = error.toJSON();

      expect(json).toMatchObject({
        name: "AppError",
        code: ErrorCode.VALIDATION_ERROR,
        message: "Test error",
        details: { key: "value" },
      });
      expect(json.stack).toBeDefined();
    });
  });
});

describe("formatZodError", () => {
  it("should convert Zod error to AppError with correct code", () => {
    const schema = z.string();
    const result = schema.safeParse(123);

    expect(result.success).toBe(false);
    if (!result.success) {
      const error = formatZodError(result.error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.message).toBeTruthy();
    }
  });

  it("should format validation errors using Zod's prettifyError", () => {
    const schema = z.object({
      name: z.string().min(3),
      email: z.string().email(),
    });
    const result = schema.safeParse({
      name: "ab",
      email: "invalid",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const error = formatZodError(result.error);
      // Zod's prettifyError should produce a formatted message
      expect(error.message).toBeTruthy();
      expect(typeof error.message).toBe("string");
    }
  });

  it("should include error details with issues", () => {
    const schema = z.string();
    const result = schema.safeParse(123);

    expect(result.success).toBe(false);
    if (!result.success) {
      const error = formatZodError(result.error);
      expect(error.details).toBeDefined();
      expect(error.details?.issues).toBeDefined();
      expect(Array.isArray(error.details?.issues)).toBe(true);
      const issues = error.details?.issues as unknown[];
      expect(issues.length).toBeGreaterThan(0);
    }
  });

  it("should preserve issue path, message, and code in details", () => {
    const schema = z.object({ age: z.number() });
    const result = schema.safeParse({ age: "not a number" });

    expect(result.success).toBe(false);
    if (!result.success) {
      const error = formatZodError(result.error);
      const issues = error.details?.issues as Array<{
        path: Array<string | number>;
        message: string;
        code: string;
      }>;
      expect(issues).toBeDefined();
      expect(issues[0].path).toEqual(["age"]);
      expect(issues[0].message).toBeTruthy();
      expect(issues[0].code).toBeTruthy();
    }
  });
});

describe("wrapError", () => {
  it("should return AppError as-is", () => {
    const original = new AppError(ErrorCode.VALIDATION_ERROR, "Test error");
    const wrapped = wrapError(original);

    expect(wrapped).toBe(original);
  });

  it("should wrap Error instances", () => {
    const original = new Error("Original error");
    const wrapped = wrapError(original, ErrorCode.TOOL_EXECUTION_ERROR);

    expect(wrapped).toBeInstanceOf(AppError);
    expect(wrapped.code).toBe(ErrorCode.TOOL_EXECUTION_ERROR);
    expect(wrapped.message).toBe("Original error");
    expect(wrapped.cause).toBe(original);
  });

  it("should wrap unknown errors as strings", () => {
    const wrapped = wrapError("String error", ErrorCode.INTERNAL_ERROR);

    expect(wrapped).toBeInstanceOf(AppError);
    expect(wrapped.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(wrapped.message).toBe("String error");
  });

  it("should use default error code", () => {
    const wrapped = wrapError(new Error("Test"));

    expect(wrapped.code).toBe(ErrorCode.INTERNAL_ERROR);
  });

  it("should handle null and undefined", () => {
    const wrappedNull = wrapError(null);
    const wrappedUndefined = wrapError(undefined);

    expect(wrappedNull.message).toBe("null");
    expect(wrappedUndefined.message).toBe("undefined");
  });
});
