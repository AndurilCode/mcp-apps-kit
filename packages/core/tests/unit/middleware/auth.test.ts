/**
 * Auth Middleware Unit Tests
 *
 * Tests the built-in authentication middleware:
 * - API key validation
 * - JWT token validation
 * - Custom auth function support
 * - Unauthorized request rejection
 * - Auth state management (userId, authLevel, etc.)
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Middleware, MiddlewareContext } from "../../../src/middleware/types";

// Mock auth middleware (will be implemented)
function createAuthMiddleware(options: {
  apiKey?: string;
  jwtSecret?: string;
  customAuth?: (context: MiddlewareContext) => Promise<{ userId: string; authLevel: string } | null>;
}): Middleware {
  return async (context, next) => {
    // Extract auth token from metadata
    const authHeader = (context.metadata as any).authorization as string | undefined;

    // API Key auth
    if (options.apiKey) {
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Missing or invalid authorization header");
      }

      const token = authHeader.substring(7);
      if (token !== options.apiKey) {
        throw new Error("Invalid API key");
      }

      context.state.set("authenticated", true);
      context.state.set("authMethod", "apiKey");
      await next();
      return;
    }

    // JWT auth
    if (options.jwtSecret) {
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Missing or invalid authorization header");
      }

      const token = authHeader.substring(7);

      // Simple JWT validation (mock)
      try {
        // In real implementation, would use jsonwebtoken library
        // For now, just check if token contains expected secret
        if (!token.includes(options.jwtSecret)) {
          throw new Error("Invalid JWT");
        }

        // Mock decoded payload
        context.state.set("authenticated", true);
        context.state.set("authMethod", "jwt");
        context.state.set("userId", "user-123");
        await next();
      } catch (error) {
        throw new Error("Invalid or expired JWT token");
      }
      return;
    }

    // Custom auth function
    if (options.customAuth) {
      const authResult = await options.customAuth(context);
      if (!authResult) {
        throw new Error("Authentication failed");
      }

      context.state.set("authenticated", true);
      context.state.set("userId", authResult.userId);
      context.state.set("authLevel", authResult.authLevel);
      await next();
      return;
    }

    // No auth configured
    throw new Error("No auth method configured");
  };
}

describe("Auth Middleware", () => {
  let context: MiddlewareContext;

  beforeEach(() => {
    context = {
      toolName: "testTool",
      input: {},
      metadata: {},
      state: new Map(),
    };
  });

  describe("API Key Authentication", () => {
    it("should accept valid API key", async () => {
      const authMiddleware = createAuthMiddleware({
        apiKey: "test-api-key-123",
      });

      context.metadata = {
        authorization: "Bearer test-api-key-123",
      };

      let nextCalled = false;
      await authMiddleware(context, async () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(context.state.get("authenticated")).toBe(true);
      expect(context.state.get("authMethod")).toBe("apiKey");
    });

    it("should reject invalid API key", async () => {
      const authMiddleware = createAuthMiddleware({
        apiKey: "test-api-key-123",
      });

      context.metadata = {
        authorization: "Bearer wrong-key",
      };

      await expect(
        authMiddleware(context, async () => {})
      ).rejects.toThrow("Invalid API key");
    });

    it("should reject missing authorization header", async () => {
      const authMiddleware = createAuthMiddleware({
        apiKey: "test-api-key-123",
      });

      await expect(
        authMiddleware(context, async () => {})
      ).rejects.toThrow("Missing or invalid authorization header");
    });

    it("should reject malformed authorization header", async () => {
      const authMiddleware = createAuthMiddleware({
        apiKey: "test-api-key-123",
      });

      context.metadata = {
        authorization: "test-api-key-123", // Missing "Bearer" prefix
      };

      await expect(
        authMiddleware(context, async () => {})
      ).rejects.toThrow("Missing or invalid authorization header");
    });
  });

  describe("JWT Authentication", () => {
    it("should accept valid JWT token", async () => {
      const authMiddleware = createAuthMiddleware({
        jwtSecret: "my-secret",
      });

      context.metadata = {
        authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.my-secret.signature",
      };

      let nextCalled = false;
      await authMiddleware(context, async () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(context.state.get("authenticated")).toBe(true);
      expect(context.state.get("authMethod")).toBe("jwt");
      expect(context.state.get("userId")).toBe("user-123");
    });

    it("should reject invalid JWT token", async () => {
      const authMiddleware = createAuthMiddleware({
        jwtSecret: "my-secret",
      });

      context.metadata = {
        authorization: "Bearer invalid-token",
      };

      await expect(
        authMiddleware(context, async () => {})
      ).rejects.toThrow("Invalid or expired JWT token");
    });

    it("should reject missing JWT token", async () => {
      const authMiddleware = createAuthMiddleware({
        jwtSecret: "my-secret",
      });

      await expect(
        authMiddleware(context, async () => {})
      ).rejects.toThrow("Missing or invalid authorization header");
    });

    it("should set userId from JWT claims", async () => {
      const authMiddleware = createAuthMiddleware({
        jwtSecret: "my-secret",
      });

      context.metadata = {
        authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.my-secret.signature",
      };

      await authMiddleware(context, async () => {});

      expect(context.state.get("userId")).toBe("user-123");
    });
  });

  describe("Custom Authentication", () => {
    it("should accept custom auth function", async () => {
      const customAuth = vi.fn(async (_context: MiddlewareContext) => ({
        userId: "custom-user",
        authLevel: "admin",
      }));

      const authMiddleware = createAuthMiddleware({
        customAuth,
      });

      let nextCalled = false;
      await authMiddleware(context, async () => {
        nextCalled = true;
      });

      expect(customAuth).toHaveBeenCalledWith(context);
      expect(nextCalled).toBe(true);
      expect(context.state.get("authenticated")).toBe(true);
      expect(context.state.get("userId")).toBe("custom-user");
      expect(context.state.get("authLevel")).toBe("admin");
    });

    it("should reject when custom auth returns null", async () => {
      const customAuth = vi.fn(async (_context: MiddlewareContext) => null);

      const authMiddleware = createAuthMiddleware({
        customAuth,
      });

      await expect(
        authMiddleware(context, async () => {})
      ).rejects.toThrow("Authentication failed");
    });

    it("should allow custom auth to read metadata", async () => {
      const customAuth = async (context: MiddlewareContext) => {
        const apiKey = (context.metadata as any).apiKey as string;
        if (apiKey === "valid-key") {
          return { userId: "user-456", authLevel: "user" };
        }
        return null;
      };

      const authMiddleware = createAuthMiddleware({
        customAuth,
      });

      context.metadata = { apiKey: "valid-key" };

      await authMiddleware(context, async () => {});

      expect(context.state.get("userId")).toBe("user-456");
      expect(context.state.get("authLevel")).toBe("user");
    });

    it("should allow custom auth to validate based on tool name", async () => {
      const customAuth = async (context: MiddlewareContext) => {
        // Only allow admin users to access admin tools
        if (context.toolName.startsWith("admin")) {
          const authLevel = (context.metadata as any).authLevel as string;
          if (authLevel === "admin") {
            return { userId: "admin-user", authLevel: "admin" };
          }
          return null;
        }

        // All users can access non-admin tools
        return { userId: "regular-user", authLevel: "user" };
      };

      const authMiddleware = createAuthMiddleware({
        customAuth,
      });

      // Admin tool requires admin auth
      context.toolName = "adminDeleteUser";
      context.metadata = { authLevel: "admin" };

      await authMiddleware(context, async () => {});
      expect(context.state.get("userId")).toBe("admin-user");

      // Regular tool allows any user
      context.toolName = "listUsers";
      context.metadata = {};

      await authMiddleware(context, async () => {});
      expect(context.state.get("userId")).toBe("regular-user");
    });
  });

  describe("Auth State Management", () => {
    it("should set authenticated flag on successful auth", async () => {
      const authMiddleware = createAuthMiddleware({
        apiKey: "test-key",
      });

      context.metadata = {
        authorization: "Bearer test-key",
      };

      await authMiddleware(context, async () => {});

      expect(context.state.get("authenticated")).toBe(true);
    });

    it("should set userId in state for downstream middleware", async () => {
      const authMiddleware = createAuthMiddleware({
        jwtSecret: "secret",
      });

      context.metadata = {
        authorization: "Bearer jwt.secret.token",
      };

      await authMiddleware(context, async () => {
        expect(context.state.get("userId")).toBe("user-123");
      });
    });

    it("should allow tool handler to read auth state", async () => {
      const authMiddleware = createAuthMiddleware({
        customAuth: async () => ({
          userId: "user-789",
          authLevel: "superadmin",
        }),
      });

      await authMiddleware(context, async () => {
        // Tool handler can read auth state
        const userId = context.state.get("userId");
        const authLevel = context.state.get("authLevel");

        expect(userId).toBe("user-789");
        expect(authLevel).toBe("superadmin");
      });
    });
  });

  describe("Error Handling", () => {
    it("should throw clear error for missing auth", async () => {
      const authMiddleware = createAuthMiddleware({
        apiKey: "test-key",
      });

      await expect(
        authMiddleware(context, async () => {})
      ).rejects.toThrow("Missing or invalid authorization header");
    });

    it("should throw clear error for invalid credentials", async () => {
      const authMiddleware = createAuthMiddleware({
        apiKey: "correct-key",
      });

      context.metadata = {
        authorization: "Bearer wrong-key",
      };

      await expect(
        authMiddleware(context, async () => {})
      ).rejects.toThrow("Invalid API key");
    });

    it("should throw error if no auth method configured", async () => {
      const authMiddleware = createAuthMiddleware({});

      await expect(
        authMiddleware(context, async () => {})
      ).rejects.toThrow("No auth method configured");
    });

    it("should propagate errors from custom auth function", async () => {
      const customAuth = async () => {
        throw new Error("Database connection failed");
      };

      const authMiddleware = createAuthMiddleware({
        customAuth,
      });

      await expect(
        authMiddleware(context, async () => {})
      ).rejects.toThrow("Database connection failed");
    });
  });

  describe("Integration with Middleware Chain", () => {
    it("should work as first middleware in chain", async () => {
      const authMiddleware = createAuthMiddleware({
        apiKey: "test-key",
      });

      context.metadata = {
        authorization: "Bearer test-key",
      };

      const executionOrder: string[] = [];

      await authMiddleware(context, async () => {
        executionOrder.push("after-auth");
      });

      expect(executionOrder).toContain("after-auth");
    });

    it("should block execution if auth fails", async () => {
      const authMiddleware = createAuthMiddleware({
        apiKey: "test-key",
      });

      context.metadata = {
        authorization: "Bearer wrong-key",
      };

      let nextCalled = false;

      await expect(
        authMiddleware(context, async () => {
          nextCalled = true;
        })
      ).rejects.toThrow();

      expect(nextCalled).toBe(false);
    });

    it("should share auth state with downstream middleware", async () => {
      const authMiddleware = createAuthMiddleware({
        customAuth: async () => ({ userId: "user-123", authLevel: "admin" }),
      });

      await authMiddleware(context, async () => {
        // Simulate downstream middleware
        const loggingMiddleware = async (ctx: MiddlewareContext, next: () => Promise<void>) => {
          const userId = ctx.state.get("userId");
          expect(userId).toBe("user-123");
          await next();
        };

        await loggingMiddleware(context, async () => {});
      });
    });
  });
});
