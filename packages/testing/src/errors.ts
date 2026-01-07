/**
 * Error types for @mcp-apps-kit/testing
 *
 * Custom error classes for testing-specific error scenarios.
 */

// =============================================================================
// BASE ERROR CLASS
// =============================================================================

/**
 * Base error class for all testing errors
 */
export class TestingError extends Error {
  /**
   * Error code for programmatic handling
   */
  public readonly code: string;

  constructor(code: string, message: string, public readonly cause?: Error) {
    super(message);
    this.name = "TestingError";
    this.code = code;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TestingError);
    }
  }

  /**
   * Convert to JSON for logging/serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      stack: this.stack,
      cause: this.cause ? String(this.cause) : undefined,
    };
  }
}

// =============================================================================
// CONNECTION ERRORS
// =============================================================================

/**
 * Error when unable to connect to MCP server
 */
export class ConnectionError extends TestingError {
  constructor(
    public readonly url: string,
    message?: string,
    cause?: Error
  ) {
    super("CONNECTION_ERROR", message ?? `Failed to connect to ${url}`, cause);
    this.name = "ConnectionError";
  }
}

/**
 * Error when a request times out
 */
export class TimeoutError extends TestingError {
  constructor(
    public readonly timeout: number,
    message?: string,
    cause?: Error
  ) {
    super(
      "TIMEOUT_ERROR",
      message ?? `Operation timed out after ${timeout}ms`,
      cause
    );
    this.name = "TimeoutError";
  }
}

// =============================================================================
// SERVER ERRORS
// =============================================================================

/**
 * Error when server fails to start
 */
export class ServerStartupError extends TestingError {
  constructor(
    public readonly command?: string,
    public readonly timeout?: number,
    public readonly stderr?: string,
    message?: string,
    cause?: Error
  ) {
    super(
      "SERVER_STARTUP_ERROR",
      message ??
        `Server failed to start${command ? `: ${command}` : ""}${timeout ? ` (timeout: ${timeout}ms)` : ""}`,
      cause
    );
    this.name = "ServerStartupError";
  }
}

// =============================================================================
// ASSERTION ERRORS
// =============================================================================

/**
 * Error when an assertion fails
 */
export class AssertionError extends TestingError {
  constructor(
    public readonly actual: unknown,
    public readonly expected: unknown,
    message?: string
  ) {
    super(
      "ASSERTION_ERROR",
      message ?? "Assertion failed",
      undefined
    );
    this.name = "AssertionError";
  }
}

// =============================================================================
// PROPERTY TESTING ERRORS
// =============================================================================

/**
 * Error when a property test fails
 */
export class PropertyFailureError extends TestingError {
  constructor(
    public readonly failingInput: unknown,
    public readonly shrunkInput: unknown,
    message?: string
  ) {
    super(
      "PROPERTY_FAILURE",
      message ?? "Property test failed",
      undefined
    );
    this.name = "PropertyFailureError";
  }
}

// =============================================================================
// CONFIGURATION ERRORS
// =============================================================================

/**
 * Error when configuration is invalid or missing
 */
export class ConfigurationError extends TestingError {
  constructor(
    public readonly missing: string,
    message?: string
  ) {
    super(
      "CONFIGURATION_ERROR",
      message ?? `Missing required configuration: ${missing}`,
      undefined
    );
    this.name = "ConfigurationError";
  }
}
