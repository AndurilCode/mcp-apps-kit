/**
 * Middleware Chain Integration Tests
 *
 * Tests the complete middleware system integration:
 * - Multiple middleware working together
 * - Auth + Rate Limit + Logging
 * - Tool execution with middleware
 * - Real-world scenarios
 * - Performance impact
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createApp } from "../../src/createApp";
import { MiddlewareChain } from "../../src/middleware/MiddlewareChain";
import type { Middleware, MiddlewareContext } from "../../src/middleware/types";
import { z } from "zod";
import express from "express";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
let transport: StreamableHTTPClientTransport | undefined;

// Helper to create simple middleware
function createLoggingMiddleware(log: string[]): Middleware {
  return async (context, next) => {
    log.push(`before:${context.toolName}`);
    await next();
    log.push(`after:${context.toolName}`);
  };
}

function createAuthMiddleware(options: { apiKey: string }): Middleware {
  return async (context, next) => {
    const authHeader = (context.metadata as any).authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new Error("Unauthorized");
    }

    const token = authHeader.substring(7);
    if (token !== options.apiKey) {
      throw new Error("Invalid API key");
    }

    context.state.set("authenticated", true);
    context.state.set("userId", "user-123");
    await next();
  };
}

function createRateLimitMiddleware(options: { maxRequests: number }): Middleware {
  const counts = new Map<string, number>();

  return async (context, next) => {
    const userId = (context.state.get("userId") as string) || "anonymous";
    const count = counts.get(userId) || 0;

    if (count >= options.maxRequests) {
      throw new Error("Rate limit exceeded");
    }

    counts.set(userId, count + 1);
    context.state.set("requestCount", count + 1);
    await next();
  };
}

describe("Middleware Chain Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Cleanup MCP client and server
    if (transport) {
      await transport.close();
      transport = undefined;
    }
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => {
          server = undefined;
          resolve();
        });
      });
    }
  });

  describe("Multiple Middleware Execution", () => {
    it("should execute multiple middleware in order", async () => {
      const executionLog: string[] = [];
      const chain = new MiddlewareChain();

      const m1: Middleware = async (_context, next) => {
        executionLog.push("m1-before");
        await next();
        executionLog.push("m1-after");
      };

      const m2: Middleware = async (_context, next) => {
        executionLog.push("m2-before");
        await next();
        executionLog.push("m2-after");
      };

      const m3: Middleware = async (_context, next) => {
        executionLog.push("m3-before");
        await next();
        executionLog.push("m3-after");
      };

      chain.use(m1);
      chain.use(m2);
      chain.use(m3);

      const context: MiddlewareContext = {
        toolName: "test",
        input: {},
        metadata: {},
        state: new Map(),
      };

      await chain.execute(context, async () => {
        executionLog.push("handler");
      });

      expect(executionLog).toEqual([
        "m1-before",
        "m2-before",
        "m3-before",
        "handler",
        "m3-after",
        "m2-after",
        "m1-after",
      ]);
    });

    it("should share state between middleware", async () => {
      const chain = new MiddlewareChain();

      const authMiddleware: Middleware = async (context, next) => {
        context.state.set("userId", "user-123");
        context.state.set("role", "admin");
        await next();
      };

      const loggingMiddleware: Middleware = async (context, next) => {
        const userId = context.state.get("userId");
        expect(userId).toBe("user-123");
        await next();
      };

      const authzMiddleware: Middleware = async (context, next) => {
        const role = context.state.get("role");
        if (role !== "admin") {
          throw new Error("Forbidden");
        }
        await next();
      };

      chain.use(authMiddleware);
      chain.use(loggingMiddleware);
      chain.use(authzMiddleware);

      const context: MiddlewareContext = {
        toolName: "adminTool",
        input: {},
        metadata: {},
        state: new Map(),
      };

      let handlerCalled = false;
      await chain.execute(context, async () => {
        handlerCalled = true;
      });

      expect(handlerCalled).toBe(true);
    });
  });

  describe("Auth + Rate Limit + Logging Stack", () => {
    it("should execute auth, rate limit, and logging middleware together", async () => {
      const log: string[] = [];
      const chain = new MiddlewareChain();

      const authMiddleware = createAuthMiddleware({ apiKey: "test-key" });
      const rateLimitMiddleware = createRateLimitMiddleware({ maxRequests: 3 });
      const loggingMiddleware = createLoggingMiddleware(log);

      chain.use(loggingMiddleware);
      chain.use(authMiddleware);
      chain.use(rateLimitMiddleware);

      const context: MiddlewareContext = {
        toolName: "getTool",
        input: { id: "123" },
        metadata: { authorization: "Bearer test-key" },
        state: new Map(),
      };

      await chain.execute(context, async () => {
        expect(context.state.get("authenticated")).toBe(true);
        expect(context.state.get("userId")).toBe("user-123");
        expect(context.state.get("requestCount")).toBe(1);
      });

      expect(log).toEqual(["before:getTool", "after:getTool"]);
    });

    it("should reject unauthenticated requests before rate limiting", async () => {
      const chain = new MiddlewareChain();

      const authMiddleware = createAuthMiddleware({ apiKey: "test-key" });
      const rateLimitMiddleware = vi.fn(createRateLimitMiddleware({ maxRequests: 3 }));

      chain.use(authMiddleware);
      chain.use(rateLimitMiddleware);

      const context: MiddlewareContext = {
        toolName: "getTool",
        input: {},
        metadata: {}, // No auth header
        state: new Map(),
      };

      await expect(chain.execute(context, async () => {})).rejects.toThrow("Unauthorized");

      // Rate limit middleware should not be called
      expect(rateLimitMiddleware).not.toHaveBeenCalled();
    });

    it("should enforce rate limits per user", async () => {
      const chain = new MiddlewareChain();

      const authMiddleware = createAuthMiddleware({ apiKey: "test-key" });
      const rateLimitMiddleware = createRateLimitMiddleware({ maxRequests: 2 });

      chain.use(authMiddleware);
      chain.use(rateLimitMiddleware);

      const context: MiddlewareContext = {
        toolName: "getTool",
        input: {},
        metadata: { authorization: "Bearer test-key" },
        state: new Map(),
      };

      // First 2 requests should succeed
      await chain.execute(context, async () => {});

      // Reset state for 2nd request
      context.state = new Map();
      await chain.execute(context, async () => {});

      // 3rd request should be rate limited
      context.state = new Map();
      await expect(chain.execute(context, async () => {})).rejects.toThrow("Rate limit exceeded");
    });
  });

  describe("Error Handling in Chain", () => {
    it("should stop execution when middleware throws", async () => {
      const chain = new MiddlewareChain();
      const executionLog: string[] = [];

      const m1: Middleware = async (_context, next) => {
        executionLog.push("m1");
        await next();
      };

      const errorMiddleware: Middleware = async (_context, _next) => {
        executionLog.push("error-middleware");
        throw new Error("Middleware error");
      };

      const m3: Middleware = async (_context, next) => {
        executionLog.push("m3");
        await next();
      };

      chain.use(m1);
      chain.use(errorMiddleware);
      chain.use(m3);

      const context: MiddlewareContext = {
        toolName: "test",
        input: {},
        metadata: {},
        state: new Map(),
      };

      await expect(
        chain.execute(context, async () => {
          executionLog.push("handler");
        })
      ).rejects.toThrow("Middleware error");

      // m3 and handler should not be called
      expect(executionLog).toEqual(["m1", "error-middleware"]);
    });

    it("should allow middleware to catch and handle errors", async () => {
      const chain = new MiddlewareChain();
      const errors: string[] = [];

      const errorHandlerMiddleware: Middleware = async (context, next) => {
        try {
          await next();
        } catch (error) {
          errors.push((error as Error).message);
          context.state.set("errorHandled", true);
          // Don't re-throw - suppress error
        }
      };

      const errorMiddleware: Middleware = async (_context, _next) => {
        throw new Error("Test error");
      };

      chain.use(errorHandlerMiddleware);
      chain.use(errorMiddleware);

      const context: MiddlewareContext = {
        toolName: "test",
        input: {},
        metadata: {},
        state: new Map(),
      };

      // Should not throw because error is caught
      await expect(chain.execute(context, async () => {})).resolves.not.toThrow();

      expect(errors).toEqual(["Test error"]);
      expect(context.state.get("errorHandled")).toBe(true);
    });

    it("should propagate errors through entire chain", async () => {
      const chain = new MiddlewareChain();
      const catchLog: string[] = [];

      const m1: Middleware = async (_context, next) => {
        try {
          await next();
        } catch (error) {
          catchLog.push("m1-caught");
          throw error;
        }
      };

      const m2: Middleware = async (_context, next) => {
        try {
          await next();
        } catch (error) {
          catchLog.push("m2-caught");
          throw error;
        }
      };

      chain.use(m1);
      chain.use(m2);

      const context: MiddlewareContext = {
        toolName: "test",
        input: {},
        metadata: {},
        state: new Map(),
      };

      await expect(
        chain.execute(context, async () => {
          throw new Error("Handler error");
        })
      ).rejects.toThrow("Handler error");

      expect(catchLog).toEqual(["m2-caught", "m1-caught"]);
    });
  });

  describe("Middleware with createApp", () => {
    it("should register middleware via app.use()", async () => {
      const executionLog: string[] = [];

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          greet: {
            description: "Greet a user",
            input: z.object({ name: z.string() }),
            handler: async (input, context) => {
              const { name } = input as { name: string };
              executionLog.push(`handler:${name}`);

              // Handler can read middleware state
              const userId = context.state?.get?.("userId");
              return { message: `Hello, ${name}! (User: ${userId})` } as any;
            },
          },
        },
      });

      // Register middleware
      app.use(async (context, next) => {
        executionLog.push("middleware-before");
        context.state.set("userId", "user-123");
        await next();
        executionLog.push("middleware-after");
      });

      // TODO: Need to implement tool execution with middleware
      // This will be done in implementation phase
      expect(app).toBeDefined();
    });

    it("should throw error when middleware short-circuits without providing result", async () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          greet: {
            description: "Greet a user",
            input: z.object({ name: z.string() }),
            handler: async (input, _context) => {
              const { name } = input as { name: string };
              return { message: `Hello, ${name}!` };
            },
          },
        },
      });

      // Middleware that short-circuits without calling next() or providing a result
      app.use(async (_context, _next) => {
        // Intentionally not calling next() and not setting response
        return;
      });

      // Set up HTTP server to test tool invocation through MCP protocol
      const host = express();
      host.use(app.handler());
      server = host.listen(0);
      const port = (server.address() as AddressInfo).port;

      // Create MCP client and connect
      const client = new Client({ name: "test-client", version: "1.0.0" });
      transport = new StreamableHTTPClientTransport(new URL(`http://localhost:${port}/mcp`));
      await client.connect(transport);

      // Attempt to call the greet tool - should fail with clear error
      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "greet",
            arguments: { name: "World" },
          },
        },
        CallToolResultSchema
      );

      // Should return an error result
      expect(result.isError).toBeTruthy();
      if (result.isError) {
        const errorText = result.content[0]?.text || "";
        expect(errorText).toContain("Middleware short-circuited");
        expect(errorText).toContain("without providing a result");
      }
    });

    it("should allow middleware to provide result via state when short-circuiting", async () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          greet: {
            description: "Greet a user",
            input: z.object({ name: z.string() }),
            handler: async (input, _context) => {
              const { name } = input as { name: string };
              return { message: `Hello, ${name}!` };
            },
          },
        },
      });

      // Middleware that short-circuits but provides a result via state
      app.use(async (context, _next) => {
        // Set custom response in state instead of calling next()
        context.state.set("response", { message: "Cached response" });
        return;
      });

      // Set up HTTP server to test tool invocation through MCP protocol
      const host = express();
      host.use(app.handler());
      server = host.listen(0);
      const port = (server.address() as AddressInfo).port;

      // Create MCP client and connect
      const client = new Client({ name: "test-client", version: "1.0.0" });
      transport = new StreamableHTTPClientTransport(new URL(`http://localhost:${port}/mcp`));
      await client.connect(transport);

      // Call the greet tool - should succeed with cached response
      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "greet",
            arguments: { name: "World" },
          },
        },
        CallToolResultSchema
      );

      // Should return the cached response from middleware
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual({ message: "Cached response" });
    });

    it("should allow multiple middleware registration", async () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
      });

      const m1: Middleware = async (_context, next) => {
        await next();
      };
      const m2: Middleware = async (_context, next) => {
        await next();
      };
      const m3: Middleware = async (_context, next) => {
        await next();
      };

      app.use(m1);
      app.use(m2);
      app.use(m3);

      expect(app).toBeDefined();
    });
  });

  describe("Performance Impact", () => {
    it("should have minimal overhead with no middleware", async () => {
      const chain = new MiddlewareChain();

      const context: MiddlewareContext = {
        toolName: "test",
        input: {},
        metadata: {},
        state: new Map(),
      };

      const start = Date.now();
      await chain.execute(context, async () => {
        // Empty handler
      });
      const duration = Date.now() - start;

      // Should complete in under 10ms
      expect(duration).toBeLessThan(10);
    });

    it("should handle many middleware efficiently", async () => {
      const chain = new MiddlewareChain();

      // Add 10 middleware
      for (let i = 0; i < 10; i++) {
        chain.use(async (_context, next) => {
          await next();
        });
      }

      const context: MiddlewareContext = {
        toolName: "test",
        input: {},
        metadata: {},
        state: new Map(),
      };

      const start = Date.now();
      await chain.execute(context, async () => {
        // Empty handler
      });
      const duration = Date.now() - start;

      // Should complete in under 50ms even with 10 middleware
      expect(duration).toBeLessThan(50);
    });
  });

  describe("Real-World Scenarios", () => {
    it("should handle admin-only tool with auth + authz + logging", async () => {
      const chain = new MiddlewareChain();
      const log: string[] = [];

      // Logging middleware
      const loggingMiddleware: Middleware = async (context, next) => {
        log.push(`access:${context.toolName}`);
        await next();
      };

      // Auth middleware
      const authMiddleware: Middleware = async (context, next) => {
        const token = (context.metadata as any).token;
        if (token === "admin-token") {
          context.state.set("role", "admin");
        } else if (token === "user-token") {
          context.state.set("role", "user");
        } else {
          throw new Error("Unauthorized");
        }
        await next();
      };

      // Authorization middleware
      const authzMiddleware: Middleware = async (context, next) => {
        const role = context.state.get("role");
        if (context.toolName === "deleteUser" && role !== "admin") {
          throw new Error("Forbidden: Admin only");
        }
        await next();
      };

      chain.use(loggingMiddleware);
      chain.use(authMiddleware);
      chain.use(authzMiddleware);

      const context: MiddlewareContext = {
        toolName: "deleteUser",
        input: { userId: "user-456" },
        metadata: { token: "user-token" },
        state: new Map(),
      };

      // Regular user should be rejected
      await expect(chain.execute(context, async () => {})).rejects.toThrow("Forbidden: Admin only");

      // Admin should succeed
      context.state = new Map();
      context.metadata = { token: "admin-token" };

      let handlerCalled = false;
      await chain.execute(context, async () => {
        handlerCalled = true;
      });

      expect(handlerCalled).toBe(true);
      expect(log).toEqual(["access:deleteUser", "access:deleteUser"]);
    });

    it("should handle public + private tools with conditional auth", async () => {
      const chain = new MiddlewareChain();

      // Conditional auth - only for tools starting with "user_"
      const conditionalAuthMiddleware: Middleware = async (context, next) => {
        if (context.toolName.startsWith("user_")) {
          const token = (context.metadata as any).token;
          if (!token) {
            throw new Error("Auth required for user_ tools");
          }
          context.state.set("authenticated", true);
        }
        await next();
      };

      chain.use(conditionalAuthMiddleware);

      // Public tool should work without auth
      let context: MiddlewareContext = {
        toolName: "public_search",
        input: {},
        metadata: {},
        state: new Map(),
      };

      let handlerCalled = false;
      await chain.execute(context, async () => {
        handlerCalled = true;
      });
      expect(handlerCalled).toBe(true);

      // Private tool should require auth
      context = {
        toolName: "user_profile",
        input: {},
        metadata: {},
        state: new Map(),
      };

      await expect(chain.execute(context, async () => {})).rejects.toThrow(
        "Auth required for user_ tools"
      );

      // Private tool with auth should work
      context.metadata = { token: "valid-token" };
      context.state = new Map();

      handlerCalled = false;
      await chain.execute(context, async () => {
        handlerCalled = true;
      });
      expect(handlerCalled).toBe(true);
    });
  });
});
