/**
 * defineMiddleware Unit Tests - Result-Passing Pattern
 *
 * Tests the result-passing middleware patterns:
 * - defineMiddleware.withResult({ before, after })
 * - defineMiddleware.withResult.after()
 * - defineMiddleware.withResult.wrap()
 */

import { describe, it, expect, beforeEach } from "vitest";
import { defineMiddleware } from "../../../src/middleware/defineMiddleware";
import type { MiddlewareContext } from "../../../src/middleware/types";

interface TestResult {
  data: string;
  count?: number;
  _meta?: Record<string, unknown>;
}

describe("defineMiddleware - Result-Passing Pattern", () => {
  let context: MiddlewareContext;
  let executionOrder: string[];

  beforeEach(() => {
    context = {
      toolName: "testTool",
      input: { test: "data" },
      metadata: { locale: "en-US" },
      state: new Map(),
    };
    executionOrder = [];
  });

  describe("defineMiddleware.withResult({ before, after })", () => {
    it("should execute before hook, then next, then after hook with result", async () => {
      const middleware = defineMiddleware.withResult<TestResult>({
        before: async (ctx) => {
          executionOrder.push("before");
        },
        after: async (ctx, result) => {
          executionOrder.push("after");
          expect(result.data).toBe("test-data");
          return result;
        },
      });

      const result = await middleware(context, async () => {
        executionOrder.push("next");
        return { data: "test-data" };
      });

      expect(executionOrder).toEqual(["before", "next", "after"]);
      expect(result.data).toBe("test-data");
    });

    it("should allow after hook to transform result", async () => {
      const middleware = defineMiddleware.withResult<TestResult>({
        after: async (ctx, result) => {
          return {
            ...result,
            _meta: { timestamp: Date.now(), toolName: ctx.toolName },
          };
        },
      });

      const result = await middleware(context, async () => {
        return { data: "original" };
      });

      expect(result.data).toBe("original");
      expect(result._meta).toBeDefined();
      expect(result._meta?.toolName).toBe("testTool");
      expect(result._meta?.timestamp).toBeTypeOf("number");
    });

    it("should keep original result when after returns undefined", async () => {
      const middleware = defineMiddleware.withResult<TestResult>({
        after: async (ctx, result) => {
          // Inspect but don't transform
          expect(result.data).toBe("original");
          // Return undefined to keep original
        },
      });

      const result = await middleware(context, async () => {
        return { data: "original", count: 42 };
      });

      expect(result).toEqual({ data: "original", count: 42 });
    });

    it("should allow synchronous after hook", async () => {
      const middleware = defineMiddleware.withResult<TestResult>({
        after: (ctx, result) => {
          return { ...result, count: (result.count || 0) + 1 };
        },
      });

      const result = await middleware(context, async () => {
        return { data: "test" };
      });

      expect(result).toEqual({ data: "test", count: 1 });
    });

    it("should propagate errors from before hook", async () => {
      const middleware = defineMiddleware.withResult<TestResult>({
        before: async () => {
          throw new Error("Before hook error");
        },
        after: async (ctx, result) => {
          executionOrder.push("after"); // Should not run
          return result;
        },
      });

      await expect(
        middleware(context, async () => {
          executionOrder.push("next");
          return { data: "test" };
        })
      ).rejects.toThrow("Before hook error");

      expect(executionOrder).toEqual([]);
    });

    it("should propagate errors from after hook", async () => {
      const middleware = defineMiddleware.withResult<TestResult>({
        after: async (ctx, result) => {
          throw new Error("After hook error");
        },
      });

      await expect(
        middleware(context, async () => {
          return { data: "test" };
        })
      ).rejects.toThrow("After hook error");
    });

    it("should allow result enrichment from state", async () => {
      const middleware = defineMiddleware.withResult<TestResult>({
        before: async (ctx) => {
          const userId = ctx.metadata.subject || "anonymous";
          ctx.state.set("userId", userId);
          ctx.state.set("startTime", Date.now());
        },
        after: async (ctx, result) => {
          const userId = ctx.state.get("userId") as string;
          const startTime = ctx.state.get("startTime") as number;
          const duration = Date.now() - startTime;

          return {
            ...result,
            _meta: {
              ...result._meta,
              userId,
              duration,
            },
          };
        },
      });

      context.metadata.subject = "user-123";
      const result = await middleware(context, async () => {
        return { data: "test" };
      });

      expect(result._meta?.userId).toBe("user-123");
      expect(result._meta?.duration).toBeTypeOf("number");
    });
  });

  describe("defineMiddleware.withResult.after()", () => {
    it("should receive and return result", async () => {
      const middleware = defineMiddleware.withResult.after<TestResult>(async (ctx, result) => {
        executionOrder.push("after");
        expect(result.data).toBe("original");
        return result;
      });

      const result = await middleware(context, async () => {
        executionOrder.push("next");
        return { data: "original" };
      });

      expect(executionOrder).toEqual(["next", "after"]);
      expect(result.data).toBe("original");
    });

    it("should allow result transformation", async () => {
      const middleware = defineMiddleware.withResult.after<TestResult>(async (ctx, result) => {
        return {
          ...result,
          data: result.data.toUpperCase(),
          count: (result.count || 0) + 10,
        };
      });

      const result = await middleware(context, async () => {
        return { data: "hello", count: 5 };
      });

      expect(result).toEqual({ data: "HELLO", count: 15 });
    });

    it("should keep original result when returning undefined", async () => {
      const middleware = defineMiddleware.withResult.after<TestResult>(async (ctx, result) => {
        // Log result but don't transform
        executionOrder.push(`logged: ${result.data}`);
        return undefined; // Explicit undefined
      });

      const result = await middleware(context, async () => {
        return { data: "test", count: 42 };
      });

      expect(result).toEqual({ data: "test", count: 42 });
      expect(executionOrder).toEqual(["logged: test"]);
    });

    it("should support synchronous transformation", async () => {
      const middleware = defineMiddleware.withResult.after<TestResult>((ctx, result) => {
        return { ...result, data: `${result.data}!` };
      });

      const result = await middleware(context, async () => {
        return { data: "hello" };
      });

      expect(result.data).toBe("hello!");
    });

    it("should propagate errors from hook", async () => {
      const middleware = defineMiddleware.withResult.after<TestResult>(async (ctx, result) => {
        throw new Error("Transform error");
      });

      await expect(
        middleware(context, async () => {
          return { data: "test" };
        })
      ).rejects.toThrow("Transform error");
    });

    it("should allow adding metadata", async () => {
      const addTimestamp = defineMiddleware.withResult.after<TestResult>(async (ctx, result) => {
        return {
          ...result,
          _meta: {
            ...result._meta,
            processedAt: new Date().toISOString(),
            toolName: ctx.toolName,
          },
        };
      });

      const result = await addTimestamp(context, async () => {
        return { data: "test" };
      });

      expect(result._meta?.processedAt).toBeDefined();
      expect(result._meta?.toolName).toBe("testTool");
    });
  });

  describe("defineMiddleware.withResult.wrap()", () => {
    it("should allow conditional next() call with result", async () => {
      const middleware = defineMiddleware.withResult.wrap<TestResult>(async (ctx, next) => {
        if (ctx.toolName === "cached") {
          executionOrder.push("cache-hit");
          return { data: "cached-result" };
        }

        executionOrder.push("cache-miss");
        const result = await next();
        return result;
      });

      // Test cache hit
      const cachedContext = { ...context, toolName: "cached" };
      const cached = await middleware(cachedContext, async () => {
        executionOrder.push("handler"); // Should not run
        return { data: "fresh" };
      });
      expect(executionOrder).toEqual(["cache-hit"]);
      expect(cached.data).toBe("cached-result");

      // Test cache miss
      executionOrder = [];
      const fresh = await middleware(context, async () => {
        executionOrder.push("handler");
        return { data: "fresh" };
      });
      expect(executionOrder).toEqual(["cache-miss", "handler"]);
      expect(fresh.data).toBe("fresh");
    });

    it("should allow result transformation", async () => {
      const middleware = defineMiddleware.withResult.wrap<TestResult>(async (ctx, next) => {
        const result = await next();
        return {
          ...result,
          data: result.data.toUpperCase(),
          _meta: { transformed: true },
        };
      });

      const result = await middleware(context, async () => {
        return { data: "hello" };
      });

      expect(result.data).toBe("HELLO");
      expect(result._meta?.transformed).toBe(true);
    });

    it("should support caching pattern", async () => {
      const cache = new Map<string, TestResult>();

      const cachingMiddleware = defineMiddleware.withResult.wrap<TestResult>(async (ctx, next) => {
        const cacheKey = `${ctx.toolName}:${JSON.stringify(ctx.input)}`;

        // Check cache
        const cached = cache.get(cacheKey);
        if (cached) {
          ctx.state.set("cache", "hit");
          return cached;
        }

        // Execute handler
        ctx.state.set("cache", "miss");
        const result = await next();

        // Store in cache
        cache.set(cacheKey, result);

        return result;
      });

      // First call - cache miss
      const result1 = await cachingMiddleware(context, async () => {
        return { data: "computed", count: 1 };
      });
      expect(context.state.get("cache")).toBe("miss");
      expect(result1).toEqual({ data: "computed", count: 1 });

      // Second call - cache hit
      const result2 = await cachingMiddleware(context, async () => {
        return { data: "should-not-run", count: 2 };
      });
      expect(context.state.get("cache")).toBe("hit");
      expect(result2).toEqual({ data: "computed", count: 1 }); // Cached result
    });

    it("should support retry pattern", async () => {
      let attempts = 0;

      const retryMiddleware = defineMiddleware.withResult.wrap<TestResult>(async (ctx, next) => {
        const maxAttempts = 3;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            const result = await next();
            if (result.data) {
              ctx.state.set("attempts", attempt + 1);
              return result;
            }
            throw new Error("Invalid result");
          } catch (error) {
            if (attempt === maxAttempts - 1) throw error;
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }

        throw new Error("Max retries exceeded");
      });

      const result = await retryMiddleware(context, async () => {
        attempts++;
        if (attempts < 2) throw new Error("Temporary failure");
        return { data: "success" };
      });

      expect(result.data).toBe("success");
      expect(context.state.get("attempts")).toBe(2);
    });

    it("should support result validation", async () => {
      const validateMiddleware = defineMiddleware.withResult.wrap<TestResult>(async (ctx, next) => {
        const result = await next();

        if (!result.data) {
          throw new Error("Result missing data field");
        }

        if (result.count !== undefined && result.count < 0) {
          throw new Error("Count must be non-negative");
        }

        return result;
      });

      // Valid result
      const valid = await validateMiddleware(context, async () => {
        return { data: "test", count: 5 };
      });
      expect(valid).toEqual({ data: "test", count: 5 });

      // Invalid - missing data
      await expect(
        validateMiddleware(context, async () => {
          return {} as TestResult;
        })
      ).rejects.toThrow("Result missing data field");

      // Invalid - negative count
      await expect(
        validateMiddleware(context, async () => {
          return { data: "test", count: -1 };
        })
      ).rejects.toThrow("Count must be non-negative");
    });

    it("should support result sanitization", async () => {
      interface SensitiveResult extends TestResult {
        apiKey?: string;
        internalId?: string;
      }

      const sanitizeMiddleware = defineMiddleware.withResult.wrap<SensitiveResult>(
        async (ctx, next) => {
          const result = await next();

          const isAdmin = ctx.metadata.subject === "admin";
          if (!isAdmin) {
            // Remove sensitive fields for non-admin users
            const { apiKey, internalId, ...sanitized } = result;
            return sanitized as SensitiveResult;
          }

          return result;
        }
      );

      // Non-admin user
      const sanitized = await sanitizeMiddleware(context, async () => {
        return { data: "test", apiKey: "secret123", internalId: "internal-456" };
      });
      expect(sanitized).toEqual({ data: "test" });
      expect(sanitized.apiKey).toBeUndefined();

      // Admin user
      context.metadata.subject = "admin";
      const full = await sanitizeMiddleware(context, async () => {
        return { data: "test", apiKey: "secret123", internalId: "internal-456" };
      });
      expect(full.apiKey).toBe("secret123");
      expect(full.internalId).toBe("internal-456");
    });

    it("should enforce Promise<TResult> return type", async () => {
      const middleware = defineMiddleware.withResult.wrap<TestResult>(async (ctx, next) => {
        const result = await next();
        // TypeScript should enforce returning TestResult
        return result;
      });

      const result = await middleware(context, async () => {
        return { data: "test" };
      });

      expect(result.data).toBe("test");
    });
  });

  describe("Type inference", () => {
    it("should infer result type from generic parameter", async () => {
      interface CustomResult {
        value: number;
        message: string;
      }

      const middleware = defineMiddleware.withResult<CustomResult>({
        after: async (ctx, result) => {
          // TypeScript should know result has value and message
          expect(result.value).toBeTypeOf("number");
          expect(result.message).toBeTypeOf("string");
          return result;
        },
      });

      const result = await middleware(context, async () => {
        return { value: 42, message: "success" };
      });

      expect(result).toEqual({ value: 42, message: "success" });
    });

    it("should work with unknown type when no generic provided", async () => {
      const middleware = defineMiddleware.withResult({
        after: async (ctx, result) => {
          // result is unknown type
          return result;
        },
      });

      const result = await middleware(context, async () => {
        return { anything: "goes" };
      });

      expect(result).toEqual({ anything: "goes" });
    });
  });
});
