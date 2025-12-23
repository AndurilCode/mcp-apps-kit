/**
 * Error handling utilities for @mcp-apps-kit/core
 *
 * Provides custom error classes and error formatting utilities.
 */

import type { ZodError } from "zod";
import type { $ZodIssue } from "zod/v4/core";

// =============================================================================
// ERROR CODES
// =============================================================================

/**
 * Standard error codes for the SDK
 */
export const ErrorCode = {
  // Validation errors
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_INPUT: "INVALID_INPUT",
  INVALID_OUTPUT: "INVALID_OUTPUT",
  SCHEMA_ERROR: "SCHEMA_ERROR",

  // Tool errors
  TOOL_NOT_FOUND: "TOOL_NOT_FOUND",
  TOOL_EXECUTION_ERROR: "TOOL_EXECUTION_ERROR",
  TOOL_TIMEOUT: "TOOL_TIMEOUT",

  // Configuration errors
  CONFIG_ERROR: "CONFIG_ERROR",
  INVALID_CONFIG: "INVALID_CONFIG",
  MISSING_CONFIG: "MISSING_CONFIG",

  // Transport errors
  TRANSPORT_ERROR: "TRANSPORT_ERROR",
  CONNECTION_ERROR: "CONNECTION_ERROR",

  // Platform errors
  UNSUPPORTED_PLATFORM: "UNSUPPORTED_PLATFORM",
  PLATFORM_ERROR: "PLATFORM_ERROR",

  // General errors
  INTERNAL_ERROR: "INTERNAL_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

// =============================================================================
// APP ERROR CLASS
// =============================================================================

/**
 * Custom error class for the SDK
 *
 * Provides structured error information that can be formatted
 * for different protocols (MCP Apps, ChatGPT).
 *
 * @example
 * ```typescript
 * throw new AppError(
 *   ErrorCode.VALIDATION_ERROR,
 *   "Invalid input: name is required",
 *   { field: "name", type: "required" }
 * );
 * ```
 */
export class AppError extends Error {
  /**
   * Create a new AppError
   *
   * @param code - Error code from ErrorCode enum
   * @param message - Human-readable error message
   * @param details - Optional additional error details
   * @param cause - Optional underlying error
   */
  constructor(
    public readonly code: ErrorCodeType,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "AppError";

    // Maintain proper stack trace in Node.js
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /**
   * Format error for MCP protocol response
   *
   * @returns MCP-compatible error response
   */
  toMcpResponse(): { content: Array<{ type: "text"; text: string }>; isError: true } {
    return {
      content: [{ type: "text", text: this.formatMessage() }],
      isError: true,
    };
  }

  /**
   * Format error for OpenAI protocol response
   *
   * @returns OpenAI-compatible error response
   */
  toOpenAIResponse(): { content: Array<{ type: "text"; text: string }>; isError: true } {
    return {
      content: [{ type: "text", text: this.formatMessage() }],
      isError: true,
    };
  }

  /**
   * Format the error message with details
   *
   * @returns Formatted error message
   */
  private formatMessage(): string {
    let message = this.message;

    if (this.details && Object.keys(this.details).length > 0) {
      const detailsStr = Object.entries(this.details)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join(", ");
      message += ` (${detailsStr})`;
    }

    return message;
  }

  /**
   * Convert to JSON for logging/serialization
   *
   * @returns JSON representation of the error
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      stack: this.stack,
    };
  }
}

// =============================================================================
// ZOD ERROR FORMATTING
// =============================================================================

/**
 * Format a single Zod issue into a human-readable message
 *
 * Updated for Zod v4 issue format with comprehensive error code coverage.
 *
 * @param issue - Zod validation issue
 * @returns Formatted error message
 */
function formatZodIssue(issue: $ZodIssue): string {
  const path = issue.path.length > 0 ? issue.path.join(".") : "input";

  // Use type assertion for accessing optional properties
  const issueAny = issue as unknown as Record<string, unknown>;

  switch (issue.code) {
    case "invalid_type": {
      const expectedVal = issueAny.expected;
      const receivedVal = issueAny.received;

      let expected = "unknown";
      if (expectedVal !== null && expectedVal !== undefined) {
        if (typeof expectedVal === "object") {
          expected = JSON.stringify(expectedVal);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string -- typeof check ensures this is a primitive
          expected = String(expectedVal);
        }
      }

      let received = "unknown";
      if (receivedVal !== null && receivedVal !== undefined) {
        if (typeof receivedVal === "object") {
          received = JSON.stringify(receivedVal);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string -- typeof check ensures this is a primitive
          received = String(receivedVal);
        }
      }

      return `${path}: expected ${expected}, received ${received}`;
    }

    case "unrecognized_keys": {
      const keys = Array.isArray(issueAny.keys)
        ? (issueAny.keys as string[]).join(", ")
        : "unknown";
      return `${path}: unrecognized keys: ${keys}`;
    }

    case "invalid_union":
      return `${path}: invalid value for union type`;

    case "invalid_value": {
      // Handles enums and literal values in Zod v4
      if (Array.isArray(issueAny.values) && issueAny.values.length > 0) {
        const values = (issueAny.values as unknown[]).map((v) => JSON.stringify(v)).join(", ");
        return `${path}: expected one of ${values}`;
      }
      return `${path}: invalid value`;
    }

    case "invalid_format": {
      // Handles string format validations in Zod v4
      const format = issueAny.format;
      if (format === "email") return `${path}: invalid email address`;
      if (format === "url") return `${path}: invalid URL`;
      if (format === "uuid") return `${path}: invalid UUID`;
      if (format === "cuid") return `${path}: invalid CUID`;
      if (format === "cuid2") return `${path}: invalid CUID2`;
      if (format === "ulid") return `${path}: invalid ULID`;
      if (format === "datetime") return `${path}: invalid datetime format`;
      if (format === "ip") return `${path}: invalid IP address`;
      return `${path}: invalid ${typeof format === "string" ? format : "format"}`;
    }

    case "too_small": {
      const origin = issueAny.origin as string | undefined;
      const minimum = issueAny.minimum as number | undefined;
      const inclusive = issueAny.inclusive !== false;

      if (minimum === undefined) {
        return `${path}: value too small`;
      }

      if (origin === "string") {
        return `${path}: must be at least ${minimum} character${minimum !== 1 ? "s" : ""}`;
      }
      if (origin === "number") {
        return `${path}: must be ${inclusive ? "at least" : "greater than"} ${minimum}`;
      }
      if (origin === "array") {
        return `${path}: must have at least ${minimum} item${minimum !== 1 ? "s" : ""}`;
      }
      if (origin === "set") {
        return `${path}: must have at least ${minimum} item${minimum !== 1 ? "s" : ""}`;
      }
      if (origin === "date") {
        try {
          const dateStr = new Date(minimum).toISOString();
          return `${path}: date must be ${inclusive ? "on or after" : "after"} ${dateStr}`;
        } catch {
          return `${path}: date must be ${inclusive ? "on or after" : "after"} ${minimum}`;
        }
      }
      return `${path}: value too small (minimum: ${minimum})`;
    }

    case "too_big": {
      const origin = issueAny.origin as string | undefined;
      const maximum = issueAny.maximum as number | undefined;
      const inclusive = issueAny.inclusive !== false;

      if (maximum === undefined) {
        return `${path}: value too large`;
      }

      if (origin === "string") {
        return `${path}: must be at most ${maximum} character${maximum !== 1 ? "s" : ""}`;
      }
      if (origin === "number") {
        return `${path}: must be ${inclusive ? "at most" : "less than"} ${maximum}`;
      }
      if (origin === "array") {
        return `${path}: must have at most ${maximum} item${maximum !== 1 ? "s" : ""}`;
      }
      if (origin === "set") {
        return `${path}: must have at most ${maximum} item${maximum !== 1 ? "s" : ""}`;
      }
      if (origin === "date") {
        try {
          const dateStr = new Date(maximum).toISOString();
          return `${path}: date must be ${inclusive ? "on or before" : "before"} ${dateStr}`;
        } catch {
          return `${path}: date must be ${inclusive ? "on or before" : "before"} ${maximum}`;
        }
      }
      return `${path}: value too large (maximum: ${maximum})`;
    }

    case "not_multiple_of": {
      const multipleOfVal = issueAny.multipleOf;
      let multipleOf = "unknown";
      if (multipleOfVal !== null && multipleOfVal !== undefined) {
        if (typeof multipleOfVal === "object") {
          multipleOf = JSON.stringify(multipleOfVal);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string -- typeof check ensures this is a primitive
          multipleOf = String(multipleOfVal);
        }
      }
      return `${path}: must be a multiple of ${multipleOf}`;
    }

    case "custom":
      return `${path}: ${issue.message}`;

    default:
      // Fallback for any unmapped error codes
      return `${path}: ${issue.message || "validation error"}`;
  }
}

/**
 * Format a Zod error into a user-friendly AppError
 *
 * Converts raw Zod validation errors into readable messages.
 *
 * @param error - Zod validation error
 * @returns AppError with formatted message
 *
 * @example
 * ```typescript
 * const result = schema.safeParse(input);
 * if (!result.success) {
 *   throw formatZodError(result.error);
 * }
 * ```
 */
export function formatZodError(error: ZodError): AppError {
  const issues = error.issues.map(formatZodIssue);

  const message =
    issues.length === 1
      ? `Validation error: ${issues[0]}`
      : `Validation errors:\n${issues.map((i) => `  - ${i}`).join("\n")}`;

  return new AppError(ErrorCode.VALIDATION_ERROR, message, {
    issues: error.issues.map((issue) => ({
      path: issue.path,
      message: issue.message,
      code: issue.code,
    })),
  });
}

/**
 * Wrap an unknown error into an AppError
 *
 * Useful for catch blocks to ensure consistent error handling.
 *
 * @param error - Unknown error value
 * @param code - Error code to use (defaults to INTERNAL_ERROR)
 * @returns AppError instance
 *
 * @example
 * ```typescript
 * try {
 *   await doSomething();
 * } catch (error) {
 *   throw wrapError(error, ErrorCode.TOOL_EXECUTION_ERROR);
 * }
 * ```
 */
export function wrapError(
  error: unknown,
  code: ErrorCodeType = ErrorCode.INTERNAL_ERROR
): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(code, error.message, undefined, error);
  }

  return new AppError(code, String(error));
}
