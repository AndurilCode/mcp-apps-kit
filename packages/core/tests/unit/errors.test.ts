/**
 * Unit tests for error handling utilities
 *
 * Tests the AppError class, formatZodError function, and all Zod v4 error code handling.
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
      const error = new AppError(ErrorCode.INTERNAL_ERROR, "Something went wrong", undefined, cause);

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
      const error = new AppError(
        ErrorCode.INVALID_INPUT,
        "Validation failed",
        { field: "email", reason: "invalid format" }
      );
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
      const error = new AppError(
        ErrorCode.VALIDATION_ERROR,
        "Test error",
        { key: "value" }
      );
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
  describe("invalid_type errors", () => {
    it("should format type mismatch for string", () => {
      const schema = z.string();
      const result = schema.safeParse(123);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
        expect(error.message).toContain("expected string, received number");
      }
    });

    it("should format type mismatch for number", () => {
      const schema = z.number();
      const result = schema.safeParse("not a number");

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.message).toContain("expected number, received string");
      }
    });

    it("should format type mismatch with field path", () => {
      const schema = z.object({ age: z.number() });
      const result = schema.safeParse({ age: "twenty" });

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.message).toContain("age:");
        expect(error.message).toContain("expected number, received string");
      }
    });
  });

  describe("invalid_value errors (enums)", () => {
    it("should format invalid enum value", () => {
      const schema = z.enum(["red", "green", "blue"]);
      const result = schema.safeParse("yellow");

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.message).toContain("expected one of");
        expect(error.message).toMatch(/"red"|"green"|"blue"/);
      }
    });

    it("should format invalid literal value", () => {
      const schema = z.literal("exact");
      const result = schema.safeParse("wrong");

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.message).toContain("input:");
      }
    });
  });

  describe("invalid_format errors (string validation)", () => {
    it("should format invalid email", () => {
      const schema = z.string().email();
      const result = schema.safeParse("not-an-email");

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.message).toContain("invalid email address");
      }
    });

    it("should format invalid URL", () => {
      const schema = z.string().url();
      const result = schema.safeParse("not-a-url");

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.message).toContain("invalid URL");
      }
    });

    it("should format invalid UUID", () => {
      const schema = z.string().uuid();
      const result = schema.safeParse("not-a-uuid");

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.message).toContain("invalid UUID");
      }
    });
  });

  describe("too_small errors", () => {
    it("should format string minimum length", () => {
      const schema = z.string().min(5);
      const result = schema.safeParse("abc");

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.message).toContain("must be at least 5 characters");
      }
    });

    it("should format number minimum", () => {
      const schema = z.number().min(10);
      const result = schema.safeParse(5);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.message).toContain("must be at least 10");
      }
    });

    it("should format number greater than (exclusive)", () => {
      const schema = z.number().gt(10);
      const result = schema.safeParse(10);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.message).toContain("must be greater than 10");
      }
    });

    it("should format array minimum length", () => {
      const schema = z.array(z.string()).min(3);
      const result = schema.safeParse(["one", "two"]);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.message).toContain("must have at least 3 items");
      }
    });

    it("should handle singular vs plural in array messages", () => {
      const schema = z.array(z.string()).min(1);
      const result = schema.safeParse([]);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        // Should use singular "item" not "items"
        expect(error.message).toContain("must have at least 1 item");
        expect(error.message).not.toContain("1 items");
      }
    });

    it("should format date minimum", () => {
      const minDate = new Date("2024-01-01");
      const schema = z.date().min(minDate);
      const result = schema.safeParse(new Date("2023-12-31"));

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.message).toContain("date must be on or after");
        expect(error.message).toContain("2024-01-01");
      }
    });
  });

  describe("too_big errors", () => {
    it("should format string maximum length", () => {
      const schema = z.string().max(5);
      const result = schema.safeParse("toolong");

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.message).toContain("must be at most 5 characters");
      }
    });

    it("should format number maximum", () => {
      const schema = z.number().max(10);
      const result = schema.safeParse(15);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.message).toContain("must be at most 10");
      }
    });

    it("should format number less than (exclusive)", () => {
      const schema = z.number().lt(10);
      const result = schema.safeParse(10);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.message).toContain("must be less than 10");
      }
    });

    it("should format array maximum length", () => {
      const schema = z.array(z.string()).max(2);
      const result = schema.safeParse(["one", "two", "three"]);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.message).toContain("must have at most 2 items");
      }
    });

    it("should format date maximum", () => {
      const maxDate = new Date("2024-12-31");
      const schema = z.date().max(maxDate);
      const result = schema.safeParse(new Date("2025-01-01"));

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.message).toContain("date must be on or before");
        expect(error.message).toContain("2024-12-31");
      }
    });
  });

  describe("not_multiple_of errors", () => {
    it("should format not multiple of error", () => {
      const schema = z.number().multipleOf(5);
      const result = schema.safeParse(13);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.message).toContain("must be a multiple of 5");
      }
    });
  });

  describe("unrecognized_keys errors", () => {
    it("should format unrecognized keys error", () => {
      const schema = z.object({ name: z.string() }).strict();
      const result = schema.safeParse({ name: "test", extra: "field" });

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.message).toContain("unrecognized keys");
        expect(error.message).toContain("extra");
      }
    });
  });

  describe("invalid_union errors", () => {
    it("should format invalid union error", () => {
      const schema = z.union([z.string(), z.number()]);
      const result = schema.safeParse(true);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.message).toContain("invalid");
      }
    });
  });

  describe("custom errors", () => {
    it("should format custom error message", () => {
      const schema = z.string().refine((val) => val.includes("test"), {
        message: "Must contain 'test'",
      });
      const result = schema.safeParse("hello");

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.message).toContain("Must contain 'test'");
      }
    });
  });

  describe("multiple validation errors", () => {
    it("should format multiple errors with bullet points", () => {
      const schema = z.object({
        name: z.string().min(3),
        email: z.string().email(),
        age: z.number().min(18),
      });
      const result = schema.safeParse({
        name: "ab",
        email: "invalid",
        age: 10,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.message).toContain("Validation errors:");
        expect(error.message).toContain("name:");
        expect(error.message).toContain("email:");
        expect(error.message).toContain("age:");
        // Should use bullet points for multiple errors
        expect(error.message).toMatch(/\n\s+-\s+/);
      }
    });

    it("should format single error without bullet points", () => {
      const schema = z.object({ name: z.string().min(3) });
      const result = schema.safeParse({ name: "ab" });

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.message).toContain("Validation error:");
        expect(error.message).not.toContain("Validation errors:");
        // Should not use bullet points for single error
        expect(error.message).not.toMatch(/\n\s+-\s+/);
      }
    });
  });

  describe("edge cases", () => {
    it("should handle missing minimum/maximum values", () => {
      // This tests the fallback when minimum/maximum is undefined
      const schema = z.string();
      const error = new z.ZodError([
        {
          code: "too_small",
          path: ["test"],
          message: "Too small",
        } as any,
      ]);

      const appError = formatZodError(error);
      expect(appError.message).toContain("value too small");
    });

    it("should include error details in AppError", () => {
      const schema = z.string();
      const result = schema.safeParse(123);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = formatZodError(result.error);
        expect(error.details).toBeDefined();
        expect(error.details?.issues).toBeDefined();
        expect(Array.isArray(error.details?.issues)).toBe(true);
      }
    });
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
