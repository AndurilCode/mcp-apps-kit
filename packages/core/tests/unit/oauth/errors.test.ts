import { describe, it, expect } from "vitest";
import { OAuthError, ErrorCode } from "../../../src/server/oauth/errors.js";

describe("OAuthError", () => {
  describe("constructor", () => {
    it("should create an error with required properties", () => {
      const error = new OAuthError(ErrorCode.INVALID_TOKEN, "Token expired");

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("OAuthError");
      expect(error.code).toBe(ErrorCode.INVALID_TOKEN);
      expect(error.description).toBe("Token expired");
      expect(error.message).toBe("Token expired");
    });

    it("should default statusCode to 400 for invalid_request", () => {
      const error = new OAuthError(ErrorCode.INVALID_REQUEST, "Bad request");

      expect(error.statusCode).toBe(400);
    });

    it("should default statusCode to 401 for invalid_token", () => {
      const error = new OAuthError(ErrorCode.INVALID_TOKEN, "Token invalid");

      expect(error.statusCode).toBe(401);
    });

    it("should default statusCode to 403 for insufficient_scope", () => {
      const error = new OAuthError(ErrorCode.INSUFFICIENT_SCOPE, "Insufficient permissions");

      expect(error.statusCode).toBe(403);
    });

    it("should default statusCode to 401 for unknown error codes", () => {
      const error = new OAuthError("custom_error", "Custom error");

      expect(error.statusCode).toBe(401);
    });

    it("should use provided statusCode when specified", () => {
      const error = new OAuthError(ErrorCode.INVALID_TOKEN, "Server error", 500);

      expect(error.statusCode).toBe(500);
    });

    it("should maintain proper prototype chain", () => {
      const error = new OAuthError(ErrorCode.INVALID_TOKEN, "Test error");

      expect(error instanceof OAuthError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe("toWWWAuthenticateHeader", () => {
    it("should generate proper header for invalid_token", () => {
      const error = new OAuthError(ErrorCode.INVALID_TOKEN, "Token expired");

      const header = error.toWWWAuthenticateHeader("http://localhost:3000");

      expect(header).toBe(
        'Bearer realm="http://localhost:3000", error="invalid_token", error_description="Token expired"'
      );
    });

    it("should generate proper header for insufficient_scope", () => {
      const error = new OAuthError(ErrorCode.INSUFFICIENT_SCOPE, "Missing required scopes");

      const header = error.toWWWAuthenticateHeader("https://api.example.com");

      expect(header).toBe(
        'Bearer realm="https://api.example.com", error="insufficient_scope", error_description="Missing required scopes"'
      );
    });

    it("should omit error details for invalid_request", () => {
      const error = new OAuthError(ErrorCode.INVALID_REQUEST, "Bad request");

      const header = error.toWWWAuthenticateHeader("http://localhost:3000");

      expect(header).toBe('Bearer realm="http://localhost:3000"');
    });

    it("should include additional WWW-Authenticate parameters", () => {
      const error = new OAuthError(ErrorCode.INSUFFICIENT_SCOPE, "Missing scopes");
      error.wwwAuthenticateParams = {
        scope: "mcp:read mcp:write",
      };

      const header = error.toWWWAuthenticateHeader("http://localhost:3000");

      expect(header).toBe(
        'Bearer realm="http://localhost:3000", error="insufficient_scope", error_description="Missing scopes", scope="mcp:read mcp:write"'
      );
    });

    it("should include multiple additional parameters", () => {
      const error = new OAuthError(ErrorCode.INVALID_TOKEN, "Token invalid");
      error.wwwAuthenticateParams = {
        scope: "mcp:read",
        custom: "value",
      };

      const header = error.toWWWAuthenticateHeader("http://localhost:3000");

      expect(header).toContain('scope="mcp:read"');
      expect(header).toContain('custom="value"');
    });
  });

  describe("toJSON", () => {
    it("should serialize error to JSON without additional params", () => {
      const error = new OAuthError(ErrorCode.INVALID_TOKEN, "Token expired");

      const json = error.toJSON();

      expect(json).toEqual({
        error: {
          code: "invalid_token",
          message: "Token expired",
        },
      });
    });

    it("should include wwwAuthenticateParams in details", () => {
      const error = new OAuthError(ErrorCode.INSUFFICIENT_SCOPE, "Missing scopes");
      error.wwwAuthenticateParams = {
        scope: "mcp:read mcp:write",
      };

      const json = error.toJSON();

      expect(json).toEqual({
        error: {
          code: "insufficient_scope",
          message: "Missing scopes",
          details: {
            scope: "mcp:read mcp:write",
          },
        },
      });
    });

    it("should serialize all error types correctly", () => {
      const errors = [
        new OAuthError(ErrorCode.INVALID_REQUEST, "Bad request"),
        new OAuthError(ErrorCode.INVALID_TOKEN, "Token invalid"),
        new OAuthError(ErrorCode.INSUFFICIENT_SCOPE, "Missing scopes"),
      ];

      errors.forEach((error) => {
        const json = error.toJSON();
        expect(json).toHaveProperty("error");
        expect(json.error).toHaveProperty("code");
        expect(json.error).toHaveProperty("message");
      });
    });
  });

  describe("ErrorCode constants", () => {
    it("should have correct error code values", () => {
      expect(ErrorCode.INVALID_REQUEST).toBe("invalid_request");
      expect(ErrorCode.INVALID_TOKEN).toBe("invalid_token");
      expect(ErrorCode.INSUFFICIENT_SCOPE).toBe("insufficient_scope");
    });
  });
});
