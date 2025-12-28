import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import {
  extractBearerToken,
  createOAuthMiddleware,
} from "../../../src/server/oauth/middleware.js";
import { OAuthError, ErrorCode } from "../../../src/server/oauth/errors.js";
import type {
  OAuthConfig,
  ValidatedToken,
} from "../../../src/server/oauth/types.js";

describe("OAuth Middleware", () => {
  describe("extractBearerToken", () => {
    it("should extract bearer token from Authorization header", () => {
      const req = {
        headers: {
          authorization: "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
        },
      } as Request;

      const token = extractBearerToken(req);

      expect(token).toBe("eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...");
    });

    it("should throw OAuthError when Authorization header is missing", () => {
      const req = {
        headers: {},
      } as Request;

      expect(() => extractBearerToken(req)).toThrow(OAuthError);
      expect(() => extractBearerToken(req)).toThrow(
        /Missing Authorization header/
      );
    });

    it("should throw OAuthError when Authorization header format is invalid", () => {
      const req = {
        headers: {
          authorization: "Basic dXNlcjpwYXNzd29yZA==",
        },
      } as Request;

      expect(() => extractBearerToken(req)).toThrow(OAuthError);
      expect(() => extractBearerToken(req)).toThrow(
        /Invalid Authorization header format/
      );
    });

    it("should throw OAuthError when bearer token is empty", () => {
      const req = {
        headers: {
          authorization: "Bearer ",
        },
      } as Request;

      expect(() => extractBearerToken(req)).toThrow(OAuthError);
      expect(() => extractBearerToken(req)).toThrow(/Empty bearer token/);
    });

    it("should throw OAuthError when bearer token is only whitespace", () => {
      const req = {
        headers: {
          authorization: "Bearer    ",
        },
      } as Request;

      expect(() => extractBearerToken(req)).toThrow(OAuthError);
      expect(() => extractBearerToken(req)).toThrow(/Empty bearer token/);
    });

    it("should handle case-sensitive Bearer prefix", () => {
      const req = {
        headers: {
          authorization: "bearer token123",
        },
      } as Request;

      // Should fail because "Bearer" must be capitalized
      expect(() => extractBearerToken(req)).toThrow(OAuthError);
    });

    it("should extract token with special characters", () => {
      const req = {
        headers: {
          authorization:
            "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature-with-special_chars",
        },
      } as Request;

      const token = extractBearerToken(req);

      expect(token).toBe(
        "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature-with-special_chars"
      );
    });
  });

  describe("createOAuthMiddleware", () => {
    const mockConfig: OAuthConfig = {
      protectedResource: "http://localhost:3000",
      authorizationServer: "https://auth.example.com",
      scopes: ["mcp:read"],
    };

    const mockJwksClient = {
      getSigningKey: vi.fn(),
    };

    const mockValidatedToken: ValidatedToken = {
      token: "test.jwt.token",
      clientId: "client123",
      scopes: ["mcp:read", "mcp:write"],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      extra: {
        subject: "user123",
        issuer: "https://auth.example.com",
        audience: "http://localhost:3000",
      },
    };

    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
      vi.clearAllMocks();

      mockRequest = {
        headers: {
          authorization: "Bearer valid.jwt.token",
        },
        body: {
          method: "tools/call",
          params: {},
        },
      };

      mockResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        setHeader: vi.fn().mockReturnThis(),
      };

      mockNext = vi.fn();
    });

    it("should validate token and call next() on success", async () => {
      const middleware = createOAuthMiddleware(mockConfig, mockJwksClient as any);

      // Mock verifyJWT to return valid token
      const verifyJWTModule = await import(
        "../../../src/server/oauth/jwt-verifier.js"
      );
      vi.spyOn(verifyJWTModule, "verifyJWT").mockResolvedValue(
        mockValidatedToken
      );

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it("should inject auth context into request metadata", async () => {
      const middleware = createOAuthMiddleware(mockConfig, mockJwksClient as any);

      const verifyJWTModule = await import(
        "../../../src/server/oauth/jwt-verifier.js"
      );
      vi.spyOn(verifyJWTModule, "verifyJWT").mockResolvedValue(
        mockValidatedToken
      );

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.body?.params?._meta).toBeDefined();
      expect(mockRequest.body?.params?._meta?.["openai/subject"]).toBe(
        "user123"
      );
      expect(mockRequest.body?.params?._meta?.["mcp-apps-kit/auth"]).toBeDefined();
    });

    it("should create params object if missing", async () => {
      mockRequest.body = {
        method: "tools/call",
        // No params
      };

      const middleware = createOAuthMiddleware(mockConfig, mockJwksClient as any);

      const verifyJWTModule = await import(
        "../../../src/server/oauth/jwt-verifier.js"
      );
      vi.spyOn(verifyJWTModule, "verifyJWT").mockResolvedValue(
        mockValidatedToken
      );

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.body?.params).toBeDefined();
      expect(mockRequest.body?.params?._meta).toBeDefined();
    });

    it("should create _meta object if missing", async () => {
      mockRequest.body = {
        method: "tools/call",
        params: {},
      };

      const middleware = createOAuthMiddleware(mockConfig, mockJwksClient as any);

      const verifyJWTModule = await import(
        "../../../src/server/oauth/jwt-verifier.js"
      );
      vi.spyOn(verifyJWTModule, "verifyJWT").mockResolvedValue(
        mockValidatedToken
      );

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.body?.params?._meta).toBeDefined();
    });

    it("should use custom token verifier when provided", async () => {
      const mockTokenVerifier = {
        verifyAccessToken: vi.fn().mockResolvedValue(mockValidatedToken),
      };

      const configWithVerifier: OAuthConfig = {
        ...mockConfig,
        tokenVerifier: mockTokenVerifier,
      };

      const middleware = createOAuthMiddleware(configWithVerifier, null);

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockTokenVerifier.verifyAccessToken).toHaveBeenCalledWith(
        "valid.jwt.token"
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it("should throw error when JWKS client is null without custom verifier", async () => {
      const middleware = createOAuthMiddleware(mockConfig, null);

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: ErrorCode.INVALID_REQUEST,
          }),
        })
      );
    });

    it("should validate required scopes", async () => {
      const configWithScopes: OAuthConfig = {
        ...mockConfig,
        scopes: ["mcp:admin"], // Token doesn't have this scope
      };

      const middleware = createOAuthMiddleware(
        configWithScopes,
        mockJwksClient as any
      );

      const verifyJWTModule = await import(
        "../../../src/server/oauth/jwt-verifier.js"
      );
      vi.spyOn(verifyJWTModule, "verifyJWT").mockResolvedValue(
        mockValidatedToken
      );

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "WWW-Authenticate",
        expect.stringContaining("insufficient_scope")
      );
    });

    it("should pass when token has required scopes", async () => {
      const configWithScopes: OAuthConfig = {
        ...mockConfig,
        scopes: ["mcp:read"], // Token has this scope
      };

      const middleware = createOAuthMiddleware(
        configWithScopes,
        mockJwksClient as any
      );

      const verifyJWTModule = await import(
        "../../../src/server/oauth/jwt-verifier.js"
      );
      vi.spyOn(verifyJWTModule, "verifyJWT").mockResolvedValue(
        mockValidatedToken
      );

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it("should handle missing Authorization header", async () => {
      mockRequest.headers = {};

      const middleware = createOAuthMiddleware(mockConfig, mockJwksClient as any);

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "WWW-Authenticate",
        expect.stringContaining("invalid_token")
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should handle token verification errors", async () => {
      const middleware = createOAuthMiddleware(mockConfig, mockJwksClient as any);

      const verifyJWTModule = await import(
        "../../../src/server/oauth/jwt-verifier.js"
      );
      vi.spyOn(verifyJWTModule, "verifyJWT").mockRejectedValue(
        new OAuthError(ErrorCode.INVALID_TOKEN, "Token expired")
      );

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "WWW-Authenticate",
        expect.stringContaining("invalid_token")
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should handle unexpected errors", async () => {
      const middleware = createOAuthMiddleware(mockConfig, mockJwksClient as any);

      const verifyJWTModule = await import(
        "../../../src/server/oauth/jwt-verifier.js"
      );
      vi.spyOn(verifyJWTModule, "verifyJWT").mockRejectedValue(
        new Error("Unexpected error")
      );

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining("Unexpected error"),
          }),
        })
      );
    });

    it("should set WWW-Authenticate header on error", async () => {
      mockRequest.headers = {};

      const middleware = createOAuthMiddleware(mockConfig, mockJwksClient as any);

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "WWW-Authenticate",
        expect.stringContaining(`realm="${mockConfig.protectedResource}"`)
      );
    });

    it("should include scope in WWW-Authenticate for insufficient_scope", async () => {
      const configWithScopes: OAuthConfig = {
        ...mockConfig,
        scopes: ["mcp:admin", "mcp:write"],
      };

      const middleware = createOAuthMiddleware(
        configWithScopes,
        mockJwksClient as any
      );

      const verifyJWTModule = await import(
        "../../../src/server/oauth/jwt-verifier.js"
      );
      vi.spyOn(verifyJWTModule, "verifyJWT").mockResolvedValue(
        mockValidatedToken
      );

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "WWW-Authenticate",
        expect.stringContaining('scope="mcp:admin mcp:write"')
      );
    });

    it("should inject full auth context with all fields", async () => {
      const middleware = createOAuthMiddleware(mockConfig, mockJwksClient as any);

      const verifyJWTModule = await import(
        "../../../src/server/oauth/jwt-verifier.js"
      );
      vi.spyOn(verifyJWTModule, "verifyJWT").mockResolvedValue(
        mockValidatedToken
      );

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const authContext = mockRequest.body?.params?._meta?.["mcp-apps-kit/auth"];
      expect(authContext).toMatchObject({
        subject: "user123",
        scopes: ["mcp:read", "mcp:write"],
        clientId: "client123",
        issuer: "https://auth.example.com",
        audience: "http://localhost:3000",
        token: "test.jwt.token",
      });
    });

    it("should handle array audience in auth context", async () => {
      const tokenWithArrayAudience: ValidatedToken = {
        ...mockValidatedToken,
        extra: {
          ...mockValidatedToken.extra,
          audience: ["http://localhost:3000", "https://api.example.com"],
        },
      };

      const middleware = createOAuthMiddleware(mockConfig, mockJwksClient as any);

      const verifyJWTModule = await import(
        "../../../src/server/oauth/jwt-verifier.js"
      );
      vi.spyOn(verifyJWTModule, "verifyJWT").mockResolvedValue(
        tokenWithArrayAudience
      );

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const authContext = mockRequest.body?.params?._meta?.["mcp-apps-kit/auth"];
      expect(authContext.audience).toEqual([
        "http://localhost:3000",
        "https://api.example.com",
      ]);
    });

    it("should not call next() when error occurs", async () => {
      mockRequest.headers = {};

      const middleware = createOAuthMiddleware(mockConfig, mockJwksClient as any);

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should override client-provided subject in _meta", async () => {
      mockRequest.body = {
        method: "tools/call",
        params: {
          _meta: {
            "openai/subject": "malicious-user",
          },
        },
      };

      const middleware = createOAuthMiddleware(mockConfig, mockJwksClient as any);

      const verifyJWTModule = await import(
        "../../../src/server/oauth/jwt-verifier.js"
      );
      vi.spyOn(verifyJWTModule, "verifyJWT").mockResolvedValue(
        mockValidatedToken
      );

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.body?.params?._meta?.["openai/subject"]).toBe(
        "user123"
      );
    });

    it("should skip scope validation when no scopes required", async () => {
      const configWithoutScopes: OAuthConfig = {
        ...mockConfig,
        scopes: undefined,
      };

      const middleware = createOAuthMiddleware(
        configWithoutScopes,
        mockJwksClient as any
      );

      const verifyJWTModule = await import(
        "../../../src/server/oauth/jwt-verifier.js"
      );
      vi.spyOn(verifyJWTModule, "verifyJWT").mockResolvedValue(
        mockValidatedToken
      );

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
    });

    it("should skip scope validation when scopes array is empty", async () => {
      const configWithEmptyScopes: OAuthConfig = {
        ...mockConfig,
        scopes: [],
      };

      const middleware = createOAuthMiddleware(
        configWithEmptyScopes,
        mockJwksClient as any
      );

      const verifyJWTModule = await import(
        "../../../src/server/oauth/jwt-verifier.js"
      );
      vi.spyOn(verifyJWTModule, "verifyJWT").mockResolvedValue(
        mockValidatedToken
      );

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
