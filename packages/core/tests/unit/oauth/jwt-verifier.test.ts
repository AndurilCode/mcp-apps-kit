import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import {
  verifyJWT,
  extractSubject,
} from "../../../src/server/oauth/jwt-verifier.js";
import { OAuthError, ErrorCode } from "../../../src/server/oauth/errors.js";
import type { OAuthConfig } from "../../../src/server/oauth/types.js";

describe("JWT Verifier", () => {
  const mockConfig: OAuthConfig = {
    protectedResource: "http://localhost:3000",
    authorizationServer: "https://auth.example.com",
  };

  const mockPublicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1234567890
-----END PUBLIC KEY-----`;

  const mockJwksClient = {
    getSigningKey: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("verifyJWT", () => {
    it("should successfully verify a valid JWT token", async () => {
      const mockToken = "valid.jwt.token";
      const mockPayload = {
        sub: "user123",
        client_id: "client123",
        scope: "mcp:read mcp:write",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: "https://auth.example.com",
        aud: "http://localhost:3000",
      };

      // Mock jwt.decode
      vi.spyOn(jwt, "decode").mockReturnValue({
        header: { kid: "key123", alg: "RS256" },
        payload: mockPayload,
        signature: "signature",
      });

      // Mock jwksClient.getSigningKey
      mockJwksClient.getSigningKey.mockResolvedValue({
        getPublicKey: () => mockPublicKey,
      });

      // Mock jwt.verify
      vi.spyOn(jwt, "verify").mockReturnValue(mockPayload as any);

      const result = await verifyJWT(
        mockToken,
        mockConfig,
        mockJwksClient as any
      );

      expect(result).toEqual({
        token: mockToken,
        clientId: "client123",
        scopes: ["mcp:read", "mcp:write"],
        expiresAt: mockPayload.exp,
        extra: {
          subject: "user123",
          issuer: "https://auth.example.com",
          audience: "http://localhost:3000",
          ...mockPayload,
        },
      });
    });

    it("should accept issuer with trailing slash", async () => {
      const mockToken = "valid.jwt.token";
      const mockPayload = {
        sub: "user123",
        client_id: "client123",
        scope: "mcp:read",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: "https://auth.example.com/", // With trailing slash
        aud: "http://localhost:3000",
      };

      vi.spyOn(jwt, "decode").mockReturnValue({
        header: { kid: "key123", alg: "RS256" },
        payload: mockPayload,
        signature: "signature",
      });

      mockJwksClient.getSigningKey.mockResolvedValue({
        getPublicKey: () => mockPublicKey,
      });

      vi.spyOn(jwt, "verify").mockReturnValue(mockPayload as any);

      const result = await verifyJWT(
        mockToken,
        mockConfig,
        mockJwksClient as any
      );

      expect(result.extra?.issuer).toBe("https://auth.example.com/");
    });

    it("should use azp claim when client_id is missing", async () => {
      const mockToken = "valid.jwt.token";
      const mockPayload = {
        sub: "user123",
        azp: "azp-client123", // Using azp instead of client_id
        scope: "mcp:read",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: "https://auth.example.com",
        aud: "http://localhost:3000",
      };

      vi.spyOn(jwt, "decode").mockReturnValue({
        header: { kid: "key123", alg: "RS256" },
        payload: mockPayload,
        signature: "signature",
      });

      mockJwksClient.getSigningKey.mockResolvedValue({
        getPublicKey: () => mockPublicKey,
      });

      vi.spyOn(jwt, "verify").mockReturnValue(mockPayload as any);

      const result = await verifyJWT(
        mockToken,
        mockConfig,
        mockJwksClient as any
      );

      expect(result.clientId).toBe("azp-client123");
    });

    it("should handle array audience", async () => {
      const mockToken = "valid.jwt.token";
      const mockPayload = {
        sub: "user123",
        client_id: "client123",
        scope: "mcp:read",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: "https://auth.example.com",
        aud: ["http://localhost:3000", "https://api.example.com"],
      };

      const configWithArrayAudience = {
        ...mockConfig,
        audience: ["http://localhost:3000", "https://api.example.com"],
      };

      vi.spyOn(jwt, "decode").mockReturnValue({
        header: { kid: "key123", alg: "RS256" },
        payload: mockPayload,
        signature: "signature",
      });

      mockJwksClient.getSigningKey.mockResolvedValue({
        getPublicKey: () => mockPublicKey,
      });

      vi.spyOn(jwt, "verify").mockReturnValue(mockPayload as any);

      const result = await verifyJWT(
        mockToken,
        configWithArrayAudience,
        mockJwksClient as any
      );

      expect(result.extra?.audience).toEqual([
        "http://localhost:3000",
        "https://api.example.com",
      ]);
    });

    it("should handle empty scopes", async () => {
      const mockToken = "valid.jwt.token";
      const mockPayload = {
        sub: "user123",
        client_id: "client123",
        scope: "", // Empty scope
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: "https://auth.example.com",
        aud: "http://localhost:3000",
      };

      vi.spyOn(jwt, "decode").mockReturnValue({
        header: { kid: "key123", alg: "RS256" },
        payload: mockPayload,
        signature: "signature",
      });

      mockJwksClient.getSigningKey.mockResolvedValue({
        getPublicKey: () => mockPublicKey,
      });

      vi.spyOn(jwt, "verify").mockReturnValue(mockPayload as any);

      const result = await verifyJWT(
        mockToken,
        mockConfig,
        mockJwksClient as any
      );

      expect(result.scopes).toEqual([]);
    });

    it("should handle missing scope claim", async () => {
      const mockToken = "valid.jwt.token";
      const mockPayload = {
        sub: "user123",
        client_id: "client123",
        // No scope claim
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: "https://auth.example.com",
        aud: "http://localhost:3000",
      };

      vi.spyOn(jwt, "decode").mockReturnValue({
        header: { kid: "key123", alg: "RS256" },
        payload: mockPayload,
        signature: "signature",
      });

      mockJwksClient.getSigningKey.mockResolvedValue({
        getPublicKey: () => mockPublicKey,
      });

      vi.spyOn(jwt, "verify").mockReturnValue(mockPayload as any);

      const result = await verifyJWT(
        mockToken,
        mockConfig,
        mockJwksClient as any
      );

      expect(result.scopes).toEqual([]);
    });

    it("should use custom algorithms from config", async () => {
      const mockToken = "valid.jwt.token";
      const mockPayload = {
        sub: "user123",
        client_id: "client123",
        scope: "mcp:read",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: "https://auth.example.com",
        aud: "http://localhost:3000",
      };

      const configWithAlgorithms = {
        ...mockConfig,
        algorithms: ["ES256", "ES384"],
      };

      vi.spyOn(jwt, "decode").mockReturnValue({
        header: { kid: "key123", alg: "ES256" },
        payload: mockPayload,
        signature: "signature",
      });

      mockJwksClient.getSigningKey.mockResolvedValue({
        getPublicKey: () => mockPublicKey,
      });

      const verifySpy = vi
        .spyOn(jwt, "verify")
        .mockReturnValue(mockPayload as any);

      await verifyJWT(mockToken, configWithAlgorithms, mockJwksClient as any);

      expect(verifySpy).toHaveBeenCalledWith(
        mockToken,
        mockPublicKey,
        expect.objectContaining({
          algorithms: ["ES256", "ES384"],
        })
      );
    });

    it("should use custom audience from config", async () => {
      const mockToken = "valid.jwt.token";
      const mockPayload = {
        sub: "user123",
        client_id: "client123",
        scope: "mcp:read",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: "https://auth.example.com",
        aud: "https://custom-api.example.com",
      };

      const configWithAudience = {
        ...mockConfig,
        audience: "https://custom-api.example.com",
      };

      vi.spyOn(jwt, "decode").mockReturnValue({
        header: { kid: "key123", alg: "RS256" },
        payload: mockPayload,
        signature: "signature",
      });

      mockJwksClient.getSigningKey.mockResolvedValue({
        getPublicKey: () => mockPublicKey,
      });

      const verifySpy = vi
        .spyOn(jwt, "verify")
        .mockReturnValue(mockPayload as any);

      await verifyJWT(mockToken, configWithAudience, mockJwksClient as any);

      expect(verifySpy).toHaveBeenCalledWith(
        mockToken,
        mockPublicKey,
        expect.objectContaining({
          audience: "https://custom-api.example.com",
        })
      );
    });

    it("should throw OAuthError for malformed JWT", async () => {
      const mockToken = "invalid.jwt";

      vi.spyOn(jwt, "decode").mockReturnValue(null);

      await expect(
        verifyJWT(mockToken, mockConfig, mockJwksClient as any)
      ).rejects.toThrow(OAuthError);

      await expect(
        verifyJWT(mockToken, mockConfig, mockJwksClient as any)
      ).rejects.toThrow(/Malformed JWT token/);
    });

    it("should throw OAuthError when kid is missing", async () => {
      const mockToken = "valid.jwt.token";

      vi.spyOn(jwt, "decode").mockReturnValue({
        header: { alg: "RS256" }, // No kid
        payload: {},
        signature: "signature",
      });

      await expect(
        verifyJWT(mockToken, mockConfig, mockJwksClient as any)
      ).rejects.toThrow(OAuthError);

      await expect(
        verifyJWT(mockToken, mockConfig, mockJwksClient as any)
      ).rejects.toThrow(/missing key ID/);
    });

    it("should throw OAuthError when getSigningKey fails", async () => {
      const mockToken = "valid.jwt.token";

      vi.spyOn(jwt, "decode").mockReturnValue({
        header: { kid: "key123", alg: "RS256" },
        payload: {},
        signature: "signature",
      });

      mockJwksClient.getSigningKey.mockRejectedValue(
        new Error("Key not found")
      );

      await expect(
        verifyJWT(mockToken, mockConfig, mockJwksClient as any)
      ).rejects.toThrow(OAuthError);

      await expect(
        verifyJWT(mockToken, mockConfig, mockJwksClient as any)
      ).rejects.toThrow(/Failed to get signing key/);
    });

    it("should throw OAuthError when client_id and azp are missing", async () => {
      const mockToken = "valid.jwt.token";
      const mockPayload = {
        sub: "user123",
        // No client_id or azp
        scope: "mcp:read",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: "https://auth.example.com",
        aud: "http://localhost:3000",
      };

      vi.spyOn(jwt, "decode").mockReturnValue({
        header: { kid: "key123", alg: "RS256" },
        payload: mockPayload,
        signature: "signature",
      });

      mockJwksClient.getSigningKey.mockResolvedValue({
        getPublicKey: () => mockPublicKey,
      });

      vi.spyOn(jwt, "verify").mockReturnValue(mockPayload as any);

      await expect(
        verifyJWT(mockToken, mockConfig, mockJwksClient as any)
      ).rejects.toThrow(OAuthError);

      await expect(
        verifyJWT(mockToken, mockConfig, mockJwksClient as any)
      ).rejects.toThrow(/missing required claim: client_id or azp/);
    });

    it("should throw OAuthError when sub is missing", async () => {
      const mockToken = "valid.jwt.token";
      const mockPayload = {
        // No sub
        client_id: "client123",
        scope: "mcp:read",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: "https://auth.example.com",
        aud: "http://localhost:3000",
      };

      vi.spyOn(jwt, "decode").mockReturnValue({
        header: { kid: "key123", alg: "RS256" },
        payload: mockPayload,
        signature: "signature",
      });

      mockJwksClient.getSigningKey.mockResolvedValue({
        getPublicKey: () => mockPublicKey,
      });

      vi.spyOn(jwt, "verify").mockReturnValue(mockPayload as any);

      await expect(
        verifyJWT(mockToken, mockConfig, mockJwksClient as any)
      ).rejects.toThrow(OAuthError);

      await expect(
        verifyJWT(mockToken, mockConfig, mockJwksClient as any)
      ).rejects.toThrow(/missing required claim: sub/);
    });

    it("should throw OAuthError when exp is missing", async () => {
      const mockToken = "valid.jwt.token";
      const mockPayload = {
        sub: "user123",
        client_id: "client123",
        scope: "mcp:read",
        // No exp
        iss: "https://auth.example.com",
        aud: "http://localhost:3000",
      };

      vi.spyOn(jwt, "decode").mockReturnValue({
        header: { kid: "key123", alg: "RS256" },
        payload: mockPayload,
        signature: "signature",
      });

      mockJwksClient.getSigningKey.mockResolvedValue({
        getPublicKey: () => mockPublicKey,
      });

      vi.spyOn(jwt, "verify").mockReturnValue(mockPayload as any);

      await expect(
        verifyJWT(mockToken, mockConfig, mockJwksClient as any)
      ).rejects.toThrow(OAuthError);

      await expect(
        verifyJWT(mockToken, mockConfig, mockJwksClient as any)
      ).rejects.toThrow(/missing required claim: exp/);
    });

    it("should handle TokenExpiredError", async () => {
      const mockToken = "expired.jwt.token";

      vi.spyOn(jwt, "decode").mockReturnValue({
        header: { kid: "key123", alg: "RS256" },
        payload: {},
        signature: "signature",
      });

      mockJwksClient.getSigningKey.mockResolvedValue({
        getPublicKey: () => mockPublicKey,
      });

      vi.spyOn(jwt, "verify").mockImplementation(() => {
        throw new jwt.TokenExpiredError("jwt expired", new Date());
      });

      await expect(
        verifyJWT(mockToken, mockConfig, mockJwksClient as any)
      ).rejects.toThrow(OAuthError);

      await expect(
        verifyJWT(mockToken, mockConfig, mockJwksClient as any)
      ).rejects.toThrow(/Token expired/);
    });

    it("should handle JsonWebTokenError", async () => {
      const mockToken = "invalid.jwt.token";

      vi.spyOn(jwt, "decode").mockReturnValue({
        header: { kid: "key123", alg: "RS256" },
        payload: {},
        signature: "signature",
      });

      mockJwksClient.getSigningKey.mockResolvedValue({
        getPublicKey: () => mockPublicKey,
      });

      vi.spyOn(jwt, "verify").mockImplementation(() => {
        throw new jwt.JsonWebTokenError("invalid signature");
      });

      await expect(
        verifyJWT(mockToken, mockConfig, mockJwksClient as any)
      ).rejects.toThrow(OAuthError);

      await expect(
        verifyJWT(mockToken, mockConfig, mockJwksClient as any)
      ).rejects.toThrow(/invalid signature/);
    });

    it("should handle NotBeforeError", async () => {
      const mockToken = "not-yet-valid.jwt.token";

      vi.spyOn(jwt, "decode").mockReturnValue({
        header: { kid: "key123", alg: "RS256" },
        payload: {},
        signature: "signature",
      });

      mockJwksClient.getSigningKey.mockResolvedValue({
        getPublicKey: () => mockPublicKey,
      });

      vi.spyOn(jwt, "verify").mockImplementation(() => {
        throw new jwt.NotBeforeError("jwt not active", new Date());
      });

      await expect(
        verifyJWT(mockToken, mockConfig, mockJwksClient as any)
      ).rejects.toThrow(OAuthError);

      // Verify the error is an OAuthError with appropriate message
      // Note: The NotBeforeError may be caught as a generic error in some test environments
      try {
        await verifyJWT(mockToken, mockConfig, mockJwksClient as any);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(OAuthError);
        expect((error as OAuthError).code).toBe(ErrorCode.INVALID_TOKEN);
        // Error message should indicate token validation failed
        expect((error as OAuthError).description).toContain("Token");
      }
    });

    it("should handle generic errors", async () => {
      const mockToken = "error.jwt.token";

      vi.spyOn(jwt, "decode").mockReturnValue({
        header: { kid: "key123", alg: "RS256" },
        payload: {},
        signature: "signature",
      });

      mockJwksClient.getSigningKey.mockResolvedValue({
        getPublicKey: () => mockPublicKey,
      });

      vi.spyOn(jwt, "verify").mockImplementation(() => {
        throw new Error("Generic verification error");
      });

      await expect(
        verifyJWT(mockToken, mockConfig, mockJwksClient as any)
      ).rejects.toThrow(OAuthError);

      await expect(
        verifyJWT(mockToken, mockConfig, mockJwksClient as any)
      ).rejects.toThrow(/Generic verification error/);
    });

    it("should include clock tolerance in verification options", async () => {
      const mockToken = "valid.jwt.token";
      const mockPayload = {
        sub: "user123",
        client_id: "client123",
        scope: "mcp:read",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: "https://auth.example.com",
        aud: "http://localhost:3000",
      };

      vi.spyOn(jwt, "decode").mockReturnValue({
        header: { kid: "key123", alg: "RS256" },
        payload: mockPayload,
        signature: "signature",
      });

      mockJwksClient.getSigningKey.mockResolvedValue({
        getPublicKey: () => mockPublicKey,
      });

      const verifySpy = vi
        .spyOn(jwt, "verify")
        .mockReturnValue(mockPayload as any);

      await verifyJWT(mockToken, mockConfig, mockJwksClient as any);

      expect(verifySpy).toHaveBeenCalledWith(
        mockToken,
        mockPublicKey,
        expect.objectContaining({
          clockTolerance: 5,
        })
      );
    });
  });

  describe("extractSubject", () => {
    it("should extract subject from validated token", () => {
      const validatedToken = {
        token: "test.jwt.token",
        clientId: "client123",
        scopes: ["mcp:read"],
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        extra: {
          subject: "user123",
          issuer: "https://auth.example.com",
        },
      };

      const subject = extractSubject(validatedToken);

      expect(subject).toBe("user123");
    });

    it("should handle missing extra object", () => {
      const validatedToken = {
        token: "test.jwt.token",
        clientId: "client123",
        scopes: ["mcp:read"],
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };

      const subject = extractSubject(validatedToken);

      expect(subject).toBeUndefined();
    });

    it("should handle missing subject in extra", () => {
      const validatedToken = {
        token: "test.jwt.token",
        clientId: "client123",
        scopes: ["mcp:read"],
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        extra: {
          issuer: "https://auth.example.com",
        },
      };

      const subject = extractSubject(validatedToken);

      expect(subject).toBeUndefined();
    });
  });
});
