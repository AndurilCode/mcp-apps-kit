/**
 * Error handling utilities for @mcp-apps-kit/ui
 *
 * Client-side error types for UI adapter error handling.
 */

// =============================================================================
// ERROR CODES
// =============================================================================

/**
 * Error codes for UI client operations
 */
export const UIErrorCode = {
  // Connection errors
  CONNECTION_FAILED: "CONNECTION_FAILED",
  CONNECTION_TIMEOUT: "CONNECTION_TIMEOUT",
  NOT_CONNECTED: "NOT_CONNECTED",

  // Protocol errors
  PROTOCOL_ERROR: "PROTOCOL_ERROR",
  UNSUPPORTED_OPERATION: "UNSUPPORTED_OPERATION",

  // Tool errors
  TOOL_CALL_FAILED: "TOOL_CALL_FAILED",
  TOOL_NOT_FOUND: "TOOL_NOT_FOUND",

  // State errors
  STATE_ERROR: "STATE_ERROR",

  // General errors
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type UIErrorCodeType = (typeof UIErrorCode)[keyof typeof UIErrorCode];

// =============================================================================
// UI ERROR CLASS
// =============================================================================

/**
 * Custom error class for UI client operations
 *
 * Provides structured error information for client-side error handling.
 */
export class UIError extends Error {
  /**
   * Create a new UIError
   *
   * @param code - Error code from UIErrorCode enum
   * @param message - Human-readable error message
   * @param details - Optional additional error details
   * @param cause - Optional underlying error
   */
  constructor(
    public readonly code: UIErrorCodeType,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "UIError";
  }

  /**
   * Format error message with code and details
   */
  formatMessage(): string {
    let msg = `[${this.code}] ${this.message}`;
    if (this.details) {
      msg += ` ${JSON.stringify(this.details)}`;
    }
    return msg;
  }
}
