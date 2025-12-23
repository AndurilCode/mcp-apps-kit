/**
 * Error handling utilities for @mcp-apps-kit/core
 *
 * Provides custom error classes and error formatting utilities.
 */

import type { ZodError, ZodIssue } from "zod";

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
 * @param issue - Zod validation issue
 * @returns Formatted error message
 */
function formatZodIssue(issue: ZodIssue): string {
  const path = issue.path.length > 0 ? issue.path.join(".") : "input";

  // Zod v4 tightened issue unions and changed some issue shapes.
  // Use small runtime checks for optional fields to keep this formatter stable across Zod versions.
  const issueAny = issue as unknown as Record<string, unknown>;

  switch (issue.code) {
    case "invalid_type":
      return `${path}: expected ${String(issueAny.expected ?? "<unknown>")}, got ${String(
        issueAny.received ?? issueAny.input ?? "<unknown>"
      )}`;
    case "unrecognized_keys":
      if (Array.isArray(issueAny.keys)) {
        return `${path}: unrecognized keys: ${(issueAny.keys as unknown[]).map(String).join(", ")}`;
      }
      return `${path}: unrecognized keys`;
    case "invalid_union":
      return `${path}: invalid value for union type`;
    case "invalid_format": {
      const format = issueAny.format;
      if (format === "email") return `${path}: invalid email address`;
      if (format === "url") return `${path}: invalid URL`;
      if (format === "uuid") return `${path}: invalid UUID`;
      if (typeof format === "string") return `${path}: invalid ${format} format`;
      return `${path}: invalid format`;
    }
    case "too_small":
      if (issueAny.origin === "string")
        return `${path}: must be at least ${String(issueAny.minimum ?? "")} characters`;
      if (issueAny.origin === "number")
        return `${path}: must be at least ${String(issueAny.minimum ?? "")}`;
      if (issueAny.origin === "array")
        return `${path}: must have at least ${String(issueAny.minimum ?? "")} items`;
      return `${path}: value too small`;
    case "too_big":
      if (issueAny.origin === "string")
        return `${path}: must be at most ${String(issueAny.maximum ?? "")} characters`;
      if (issueAny.origin === "number")
        return `${path}: must be at most ${String(issueAny.maximum ?? "")}`;
      if (issueAny.origin === "array")
        return `${path}: must have at most ${String(issueAny.maximum ?? "")} items`;
      return `${path}: value too large`;
    case "not_multiple_of":
      return `${path}: must be a multiple of ${String(issueAny.multipleOf ?? issueAny.divisor ?? "")}`;
    case "invalid_key":
      return `${path}: invalid key`;
    case "invalid_element":
      return `${path}: invalid element`;
    case "invalid_value":
      return `${path}: ${String(issueAny.message ?? issue.message)}`;
    case "custom":
      return `${path}: ${String(issueAny.message ?? issue.message)}`;
    default:
      return `${path}: ${String(issueAny.message ?? "")}`;
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
