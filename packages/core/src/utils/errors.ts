/**
 * Error handling utilities for @mcp-apps-kit/core
 *
 * Provides custom error classes and error formatting utilities.
 */

import { z, type ZodError } from "zod";

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
 * Format a Zod error into a user-friendly AppError
 *
 * Uses Zod's built-in prettifyError for consistent, human-readable error messages.
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
 *
 * @internal
 */
export function formatZodError(error: ZodError): AppError {
  // Use Zod's built-in prettifyError for human-readable formatting
  const message = z.prettifyError(error);

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
 *
 * @internal
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
