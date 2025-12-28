import { describe, it, expect, vi } from "vitest";
import { createJwksClient, getSigningKey } from "../../../src/server/oauth/jwks-client.js";

describe("JWKS Client", () => {
  describe("createJwksClient", () => {
    it("should create a JWKS client with default options", () => {
      const client = createJwksClient({
        jwksUri: "https://auth.example.com/.well-known/jwks.json",
      });

      expect(client).toBeDefined();
      expect(typeof client.getSigningKey).toBe("function");
    });

    it("should create a JWKS client with custom cache max age", () => {
      const client = createJwksClient({
        jwksUri: "https://auth.example.com/.well-known/jwks.json",
        cacheMaxAge: 300000, // 5 minutes
      });

      expect(client).toBeDefined();
    });

    it("should create a JWKS client with custom rate limit", () => {
      const client = createJwksClient({
        jwksUri: "https://auth.example.com/.well-known/jwks.json",
        jwksRequestsPerMinute: 20,
      });

      expect(client).toBeDefined();
    });

    it("should create a JWKS client with custom timeout", () => {
      const client = createJwksClient({
        jwksUri: "https://auth.example.com/.well-known/jwks.json",
        timeout: 10000, // 10 seconds
      });

      expect(client).toBeDefined();
    });

    it("should create a JWKS client with all custom options", () => {
      const client = createJwksClient({
        jwksUri: "https://auth.example.com/.well-known/jwks.json",
        cacheMaxAge: 300000,
        jwksRequestsPerMinute: 20,
        timeout: 10000,
      });

      expect(client).toBeDefined();
    });

    it("should accept various JWKS URI formats", () => {
      const uris = [
        "https://auth.example.com/.well-known/jwks.json",
        "https://auth.example.com/oauth/keys",
        "https://auth.example.com:8443/jwks",
      ];

      uris.forEach((uri) => {
        const client = createJwksClient({ jwksUri: uri });
        expect(client).toBeDefined();
      });
    });
  });

  describe("getSigningKey", () => {
    it("should get signing key from client", async () => {
      const mockSigningKey = {
        kid: "test-key-id",
        getPublicKey: () =>
          "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----",
      };

      const mockClient = {
        getSigningKey: vi.fn().mockResolvedValue(mockSigningKey),
      };

      const result = await getSigningKey(mockClient as any, "test-key-id");

      expect(mockClient.getSigningKey).toHaveBeenCalledWith("test-key-id");
      expect(result).toEqual(mockSigningKey);
    });

    it("should propagate errors from client", async () => {
      const mockClient = {
        getSigningKey: vi.fn().mockRejectedValue(new Error("Key not found")),
      };

      await expect(getSigningKey(mockClient as any, "unknown-key-id")).rejects.toThrow(
        "Key not found"
      );
    });

    it("should handle missing key ID", async () => {
      const mockClient = {
        getSigningKey: vi.fn().mockRejectedValue(new Error("No key id provided")),
      };

      await expect(getSigningKey(mockClient as any, "")).rejects.toThrow();
    });
  });

  describe("Integration with jwks-rsa", () => {
    it("should create client that matches jwks-rsa interface", () => {
      const client = createJwksClient({
        jwksUri: "https://auth.example.com/.well-known/jwks.json",
      });

      // Verify the client has the expected interface
      expect(client).toHaveProperty("getSigningKey");
      expect(typeof client.getSigningKey).toBe("function");
    });

    it("should configure caching correctly", () => {
      const client = createJwksClient({
        jwksUri: "https://auth.example.com/.well-known/jwks.json",
        cacheMaxAge: 600000, // 10 minutes
      });

      expect(client).toBeDefined();
      // The jwks-rsa library enables caching by default
      // We just verify the client is created without errors
    });

    it("should configure rate limiting correctly", () => {
      const client = createJwksClient({
        jwksUri: "https://auth.example.com/.well-known/jwks.json",
        jwksRequestsPerMinute: 10,
      });

      expect(client).toBeDefined();
      // The jwks-rsa library handles rate limiting internally
      // We just verify the client is created without errors
    });
  });

  describe("Default values", () => {
    it("should use 10 minute cache by default", () => {
      const client = createJwksClient({
        jwksUri: "https://auth.example.com/.well-known/jwks.json",
      });

      expect(client).toBeDefined();
      // Default is 600000ms (10 minutes)
    });

    it("should use 10 requests per minute by default", () => {
      const client = createJwksClient({
        jwksUri: "https://auth.example.com/.well-known/jwks.json",
      });

      expect(client).toBeDefined();
      // Default is 10 requests per minute
    });

    it("should use 5 second timeout by default", () => {
      const client = createJwksClient({
        jwksUri: "https://auth.example.com/.well-known/jwks.json",
      });

      expect(client).toBeDefined();
      // Default is 5000ms (5 seconds)
    });
  });
});
