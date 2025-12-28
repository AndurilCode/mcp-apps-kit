import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { discoverAuthServerMetadata, getJwksUri } from "../../../src/server/oauth/discovery.js";
import { OAuthError, ErrorCode } from "../../../src/server/oauth/errors.js";

describe("OAuth Discovery", () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NODE_ENV = originalEnv;
  });

  describe("discoverAuthServerMetadata", () => {
    it("should successfully discover metadata from well-known endpoint", async () => {
      const mockMetadata = {
        issuer: "https://auth.example.com",
        jwks_uri: "https://auth.example.com/.well-known/jwks.json",
        response_types_supported: ["code", "token"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        token_endpoint: "https://auth.example.com/token",
        authorization_endpoint: "https://auth.example.com/authorize",
        scopes_supported: ["openid", "profile", "email"],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockMetadata,
      });

      const result = await discoverAuthServerMetadata("https://auth.example.com");

      expect(global.fetch).toHaveBeenCalledWith(
        "https://auth.example.com/.well-known/oauth-authorization-server",
        expect.objectContaining({
          headers: { Accept: "application/json" },
        })
      );
      expect(result).toEqual(mockMetadata);
    });

    it("should accept issuer with trailing slash", async () => {
      const mockMetadata = {
        issuer: "https://auth.example.com/",
        jwks_uri: "https://auth.example.com/.well-known/jwks.json",
        response_types_supported: ["code"],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockMetadata,
      });

      const result = await discoverAuthServerMetadata("https://auth.example.com");

      expect(result).toEqual(mockMetadata);
    });

    it("should handle authorization server URL with trailing slash", async () => {
      const mockMetadata = {
        issuer: "https://auth.example.com",
        jwks_uri: "https://auth.example.com/.well-known/jwks.json",
        response_types_supported: ["code"],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockMetadata,
      });

      const result = await discoverAuthServerMetadata("https://auth.example.com/");

      expect(result).toEqual(mockMetadata);
    });

    it("should throw OAuthError when HTTP request fails", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(discoverAuthServerMetadata("https://auth.example.com")).rejects.toThrow(
        OAuthError
      );

      await expect(discoverAuthServerMetadata("https://auth.example.com")).rejects.toThrow(
        /HTTP 404 Not Found/
      );
    });

    it("should throw OAuthError when issuer is missing", async () => {
      const mockMetadata = {
        jwks_uri: "https://auth.example.com/.well-known/jwks.json",
        response_types_supported: ["code"],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockMetadata,
      });

      await expect(discoverAuthServerMetadata("https://auth.example.com")).rejects.toThrow(
        OAuthError
      );

      await expect(discoverAuthServerMetadata("https://auth.example.com")).rejects.toThrow(
        /missing required 'issuer' field/
      );
    });

    it("should throw OAuthError when jwks_uri is missing", async () => {
      const mockMetadata = {
        issuer: "https://auth.example.com",
        response_types_supported: ["code"],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockMetadata,
      });

      await expect(discoverAuthServerMetadata("https://auth.example.com")).rejects.toThrow(
        OAuthError
      );

      await expect(discoverAuthServerMetadata("https://auth.example.com")).rejects.toThrow(
        /missing required 'jwks_uri' field/
      );
    });

    it("should throw OAuthError when issuer does not match authorization server", async () => {
      const mockMetadata = {
        issuer: "https://different-auth.example.com",
        jwks_uri: "https://auth.example.com/.well-known/jwks.json",
        response_types_supported: ["code"],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockMetadata,
      });

      await expect(discoverAuthServerMetadata("https://auth.example.com")).rejects.toThrow(
        OAuthError
      );

      await expect(discoverAuthServerMetadata("https://auth.example.com")).rejects.toThrow(
        /Issuer mismatch/
      );
    });

    it("should throw OAuthError when JWKS URI is not HTTPS in production", async () => {
      process.env.NODE_ENV = "production";

      const mockMetadata = {
        issuer: "https://auth.example.com",
        jwks_uri: "http://auth.example.com/.well-known/jwks.json",
        response_types_supported: ["code"],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockMetadata,
      });

      await expect(discoverAuthServerMetadata("https://auth.example.com")).rejects.toThrow(
        OAuthError
      );

      await expect(discoverAuthServerMetadata("https://auth.example.com")).rejects.toThrow(
        /JWKS URI must use HTTPS in production/
      );
    });

    it("should allow HTTP JWKS URI in non-production", async () => {
      process.env.NODE_ENV = "development";

      const mockMetadata = {
        issuer: "http://localhost:8080",
        jwks_uri: "http://localhost:8080/.well-known/jwks.json",
        response_types_supported: ["code"],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockMetadata,
      });

      const result = await discoverAuthServerMetadata("http://localhost:8080");

      expect(result).toEqual(mockMetadata);
    });

    it("should handle fetch timeout", async () => {
      global.fetch = vi.fn().mockImplementation(() => {
        return new Promise((_resolve, reject) => {
          const error = new Error("aborted");
          error.name = "AbortError";
          setTimeout(() => reject(error), 10);
        });
      });

      await expect(discoverAuthServerMetadata("https://auth.example.com", 100)).rejects.toThrow(
        /timed out/
      );
    });

    it("should handle network errors", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      await expect(discoverAuthServerMetadata("https://auth.example.com")).rejects.toThrow(
        OAuthError
      );

      await expect(discoverAuthServerMetadata("https://auth.example.com")).rejects.toThrow(
        /Network error/
      );
    });

    it("should handle unknown errors", async () => {
      global.fetch = vi.fn().mockRejectedValue("Unknown error");

      await expect(discoverAuthServerMetadata("https://auth.example.com")).rejects.toThrow(
        OAuthError
      );

      await expect(discoverAuthServerMetadata("https://auth.example.com")).rejects.toThrow(
        /unknown error/
      );
    });

    it("should use custom timeout value", async () => {
      const mockMetadata = {
        issuer: "https://auth.example.com",
        jwks_uri: "https://auth.example.com/.well-known/jwks.json",
        response_types_supported: ["code"],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockMetadata,
      });

      await discoverAuthServerMetadata("https://auth.example.com", 10000);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    it("should handle error code correctly", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      try {
        await discoverAuthServerMetadata("https://auth.example.com");
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(OAuthError);
        expect((error as OAuthError).code).toBe(ErrorCode.INVALID_REQUEST);
        expect((error as OAuthError).statusCode).toBe(500);
      }
    });
  });

  describe("getJwksUri", () => {
    it("should return explicit JWKS URI when provided", async () => {
      const explicitUri = "https://custom.example.com/keys.json";

      // Mock fetch to ensure it's not called
      global.fetch = vi.fn();

      const result = await getJwksUri("https://auth.example.com", explicitUri);

      expect(result).toBe(explicitUri);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should discover JWKS URI when not provided", async () => {
      const mockMetadata = {
        issuer: "https://auth.example.com",
        jwks_uri: "https://auth.example.com/.well-known/jwks.json",
        response_types_supported: ["code"],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockMetadata,
      });

      const result = await getJwksUri("https://auth.example.com");

      expect(result).toBe("https://auth.example.com/.well-known/jwks.json");
      expect(global.fetch).toHaveBeenCalled();
    });

    it("should propagate discovery errors", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(getJwksUri("https://auth.example.com")).rejects.toThrow(OAuthError);
    });

    it("should prefer explicit URI over discovery", async () => {
      const explicitUri = "https://custom.example.com/keys.json";

      // Mock fetch to ensure it's not called
      global.fetch = vi.fn();

      const result = await getJwksUri("https://auth.example.com", explicitUri);

      expect(result).toBe(explicitUri);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
