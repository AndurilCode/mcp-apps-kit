/**
 * OAuth-specific error type with RFC 6750 compliance.
 * Represents authentication and authorization errors in OAuth 2.0 Bearer Token Usage.
 *
 * @internal
 */
export class OAuthError extends Error {
  /**
   * RFC 6750 error code.
   * @example "invalid_token"
   * @example "insufficient_scope"
   * @example "invalid_request"
   */
  code: string;

  /**
   * Human-readable error description.
   * MUST NOT contain sensitive data (tokens, signatures, etc.).
   */
  description: string;

  /**
   * HTTP status code for error response.
   * - 400: invalid_request
   * - 401: invalid_token
   * - 403: insufficient_scope
   */
  statusCode: number;

  /**
   * Optional: WWW-Authenticate header parameters.
   * Used to construct RFC 6750-compliant error responses.
   */
  wwwAuthenticateParams?: Record<string, string>;

  /**
   * Create a new OAuthError.
   *
   * @param code - RFC 6750 error code
   * @param description - Human-readable error description
   * @param statusCode - HTTP status code (defaults based on error code)
   */
  constructor(code: string, description: string, statusCode?: number) {
    super(description);
    this.name = "OAuthError";
    this.code = code;
    this.description = description;

    // Default status codes based on RFC 6750 error codes
    if (statusCode !== undefined) {
      this.statusCode = statusCode;
    } else {
      switch (code) {
        case "invalid_request":
          this.statusCode = 400;
          break;
        case "invalid_token":
          this.statusCode = 401;
          break;
        case "insufficient_scope":
          this.statusCode = 403;
          break;
        default:
          this.statusCode = 401;
      }
    }

    // Ensure proper prototype chain
    Object.setPrototypeOf(this, OAuthError.prototype);
  }

  /**
   * Generate WWW-Authenticate header value per RFC 6750.
   *
   * @param realm - Protected resource identifier
   * @returns WWW-Authenticate header value
   *
   * @example
   * ```typescript
   * const error = new OAuthError('invalid_token', 'Token expired')
   * error.toWWWAuthenticateHeader('http://localhost:3000')
   * // Returns: 'Bearer realm="http://localhost:3000", error="invalid_token", error_description="Token expired"'
   * ```
   */
  toWWWAuthenticateHeader(realm: string): string {
    const params: string[] = [`realm="${this.escapeQuotedString(realm)}"`];

    if (this.code !== "invalid_request") {
      params.push(`error="${this.code}"`);
      params.push(`error_description="${this.escapeQuotedString(this.description)}"`);
    }

    if (this.wwwAuthenticateParams) {
      for (const [key, value] of Object.entries(this.wwwAuthenticateParams)) {
        params.push(`${key}="${this.escapeQuotedString(value)}"`);
      }
    }

    return `Bearer ${params.join(", ")}`;
  }

  /**
   * Escape a string for use in a quoted-string per RFC 7230.
   * Escapes backslashes and double quotes to prevent header injection.
   *
   * @param value - String to escape
   * @returns Escaped string safe for use in quoted header values
   */
  private escapeQuotedString(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  /**
   * Convert error to JSON response body.
   * Used for consistent error responses across the framework.
   */
  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.description,
        ...(this.wwwAuthenticateParams && {
          details: this.wwwAuthenticateParams,
        }),
      },
    };
  }
}

/**
 * Standard RFC 6750 error codes.
 */
export const ErrorCode = {
  /**
   * The request is missing a required parameter, includes an
   * unsupported parameter or parameter value, or is otherwise malformed.
   */
  INVALID_REQUEST: "invalid_request",

  /**
   * The access token provided is expired, revoked, malformed, or
   * invalid for other reasons.
   */
  INVALID_TOKEN: "invalid_token",

  /**
   * The request requires higher privileges than provided by the
   * access token.
   */
  INSUFFICIENT_SCOPE: "insufficient_scope",
} as const;
