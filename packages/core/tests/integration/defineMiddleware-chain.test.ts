/**
 * defineMiddleware Integration Tests
 *
 * Tests integration between defineMiddleware and MiddlewareChain:
 * - Basic middleware with MiddlewareChain
 * - Result-passing middleware with MiddlewareChain<TResult>
 * - Mixing old and new styles
 * - Complex chains with multiple middleware
 * - Error handling through chains
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MiddlewareChain } from "../../src/middleware/MiddlewareChain";
import { defineMiddleware } from "../../src/middleware/defineMiddleware";
import type { MiddlewareContext, Middleware } from "../../src/middleware/types";
import { MultipleNextCallsError } from "../../src/middleware/types";

interface TestResult {
  data: string;
  count?: number;
  _meta?: Record<string, unknown>;
}

describe("defineMiddleware with MiddlewareChain", () => {
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

  describe("Basic middleware with void chain", () => {
    it("should work with MiddlewareChain", async () => {
      const chain = new MiddlewareChain();

      chain.use(
        defineMiddleware.before(async (ctx) => {
          executionOrder.push("m1");
          ctx.state.set("m1", true);
        })
      );

      chain.use(
        defineMiddleware({
          before: async (ctx) => {
            executionOrder.push("m2-before");
          },
          after: async (ctx) => {
            executionOrder.push("m2-after");
          },
        })
      );

      chain.use(
        defineMiddleware.after(async (ctx) => {
          executionOrder.push("m3");
        })
      );

      await chain.execute(context, async () => {
        executionOrder.push("handler");
      });

      expect(executionOrder).toEqual(["m1", "m2-before", "handler", "m3", "m2-after"]);
      expect(context.state.get("m1")).toBe(true);
    });

    it("should mix old-style and new-style middleware", async () => {
      const chain = new MiddlewareChain();

      // Old style
      chain.use(async (ctx, next) => {
        executionOrder.push("old-before");
        await next();
        executionOrder.push("old-after");
      });

      // New style
      chain.use(
        defineMiddleware({
          before: async () => {
            executionOrder.push("new-before");
          },
          after: async () => {
            executionOrder.push("new-after");
          },
        })
      );

      await chain.execute(context, async () => {
        executionOrder.push("handler");
      });

      expect(executionOrder).toEqual([
        "old-before",
        "new-before",
        "handler",
        "new-after",
        "old-after",
      ]);
    });

    it("should detect multiple next() calls in wrap pattern", async () => {
      const chain = new MiddlewareChain();

      chain.use(
        defineMiddleware.wrap(async (ctx, next) => {
          await next();
          await next(); // Second call - should throw
        })
      );

      await expect(chain.execute(context, async () => {})).rejects.toThrow(MultipleNextCallsError);
    });

    it("should propagate errors through chain", async () => {
      const chain = new MiddlewareChain();

      chain.use(
        defineMiddleware.before(async () => {
          executionOrder.push("m1");
        })
      );

      chain.use(
        defineMiddleware.wrap(async (ctx, next) => {
          executionOrder.push("m2-before");
          try {
            await next();
          } catch (error) {
            executionOrder.push("m2-caught");
            throw error;
          }
        })
      );

      await expect(
        chain.execute(context, async () => {
          executionOrder.push("handler");
          throw new Error("Handler error");
        })
      ).rejects.toThrow("Handler error");

      expect(executionOrder).toEqual(["m1", "m2-before", "handler", "m2-caught"]);
    });
  });

  describe("Result-passing middleware with typed chain", () => {
    it("should work with MiddlewareChain<TResult>", async () => {
      const chain = new MiddlewareChain<TestResult>();

      chain.use(
        defineMiddleware.withResult<TestResult>({
          before: async (ctx) => {
            executionOrder.push("m1-before");
            ctx.state.set("timestamp", Date.now());
          },
          after: async (ctx, result) => {
            executionOrder.push("m1-after");
            return {
              ...result,
              _meta: { ...result._meta, processed: true },
            };
          },
        })
      );

      chain.use(
        defineMiddleware.withResult.after<TestResult>(async (ctx, result) => {
          executionOrder.push("m2-after");
          return {
            ...result,
            count: (result.count || 0) + 1,
          };
        })
      );

      const result = await chain.execute(context, async () => {
        executionOrder.push("handler");
        return { data: "test", count: 5 };
      });

      expect(executionOrder).toEqual(["m1-before", "handler", "m2-after", "m1-after"]);
      expect(result.data).toBe("test");
      expect(result.count).toBe(6);
      expect(result._meta?.processed).toBe(true);
    });

    it("should pass result through entire chain", async () => {
      const chain = new MiddlewareChain<TestResult>();

      chain.use(
        defineMiddleware.withResult.after<TestResult>(async (ctx, result) => {
          return { ...result, data: `${result.data}-m1` };
        })
      );

      chain.use(
        defineMiddleware.withResult.after<TestResult>(async (ctx, result) => {
          return { ...result, data: `${result.data}-m2` };
        })
      );

      chain.use(
        defineMiddleware.withResult.after<TestResult>(async (ctx, result) => {
          return { ...result, data: `${result.data}-m3` };
        })
      );

      const result = await chain.execute(context, async () => {
        return { data: "original" };
      });

      // Result passes through chain in reverse order (m3, then m2, then m1)
      expect(result.data).toBe("original-m3-m2-m1");
    });

    it("should support caching middleware in chain", async () => {
      const cache = new Map<string, TestResult>();
      const chain = new MiddlewareChain<TestResult>();

      chain.use(
        defineMiddleware.withResult.wrap<TestResult>(async (ctx, next) => {
          const cacheKey = ctx.toolName;
          const cached = cache.get(cacheKey);

          if (cached) {
            executionOrder.push("cache-hit");
            ctx.state.set("cached", true);
            return cached;
          }

          executionOrder.push("cache-miss");
          const result = await next();
          cache.set(cacheKey, result);
          return result;
        })
      );

      chain.use(
        defineMiddleware.withResult.after<TestResult>(async (ctx, result) => {
          if (!ctx.state.get("cached")) {
            executionOrder.push("processed");
          }
          return result;
        })
      );

      // First call - cache miss
      const result1 = await chain.execute(context, async () => {
        executionOrder.push("handler");
        return { data: "computed" };
      });
      expect(executionOrder).toEqual(["cache-miss", "handler", "processed"]);
      expect(result1.data).toBe("computed");

      // Second call - cache hit
      executionOrder = [];
      const result2 = await chain.execute(context, async () => {
        executionOrder.push("handler-should-not-run");
        return { data: "should-not-run" };
      });
      expect(executionOrder).toEqual(["cache-hit"]);
      expect(result2.data).toBe("computed");
    });

    it("should handle errors in result-passing chain", async () => {
      const chain = new MiddlewareChain<TestResult>();

      chain.use(
        defineMiddleware.withResult<TestResult>({
          before: async (ctx) => {
            executionOrder.push("m1-before");
          },
          after: async (ctx, result) => {
            executionOrder.push("m1-after"); // Should not run
            return result;
          },
        })
      );

      chain.use(
        defineMiddleware.withResult.wrap<TestResult>(async (ctx, next) => {
          executionOrder.push("m2-before");
          try {
            return await next();
          } catch (error) {
            executionOrder.push("m2-caught");
            throw error;
          }
        })
      );

      await expect(
        chain.execute(context, async () => {
          executionOrder.push("handler");
          throw new Error("Handler error");
        })
      ).rejects.toThrow("Handler error");

      expect(executionOrder).toEqual(["m1-before", "m2-before", "handler", "m2-caught"]);
    });
  });

  describe("Complex middleware chains", () => {
    it("should handle authentication + logging + timing", async () => {
      const chain = new MiddlewareChain();

      // Auth middleware
      chain.use(
        defineMiddleware.wrap(async (ctx, next) => {
          const token = ctx.metadata.raw?.["authorization"];
          if (!token) {
            throw new Error("Unauthorized");
          }
          ctx.state.set("authenticated", true);
          ctx.state.set("userId", "user-123");
          return next();
        })
      );

      // Logging middleware
      chain.use(
        defineMiddleware({
          before: async (ctx) => {
            executionOrder.push(`[LOG] ${ctx.toolName} started`);
          },
          after: async (ctx) => {
            executionOrder.push(`[LOG] ${ctx.toolName} completed`);
          },
        })
      );

      // Timing middleware
      chain.use(
        defineMiddleware({
          before: async (ctx) => {
            ctx.state.set("startTime", Date.now());
          },
          after: async (ctx) => {
            const duration = Date.now() - (ctx.state.get("startTime") as number);
            ctx.state.set("duration", duration);
            executionOrder.push(`[TIMING] ${duration}ms`);
          },
        })
      );

      // Without auth - should fail
      await expect(chain.execute(context, async () => {})).rejects.toThrow("Unauthorized");

      // With auth - should succeed
      executionOrder = [];
      context.metadata.raw = { authorization: "Bearer token123" };
      await chain.execute(context, async () => {
        executionOrder.push("[HANDLER] executed");
      });

      expect(executionOrder[0]).toBe("[LOG] testTool started");
      expect(executionOrder[1]).toBe("[HANDLER] executed");
      expect(executionOrder[2]).toMatch(/\[TIMING\] \d+ms/);
      expect(executionOrder[3]).toBe("[LOG] testTool completed");
      expect(context.state.get("authenticated")).toBe(true);
      expect(context.state.get("userId")).toBe("user-123");
    });

    it("should handle result transformation pipeline", async () => {
      const chain = new MiddlewareChain<TestResult>();

      // Add timestamp
      chain.use(
        defineMiddleware.withResult.after<TestResult>(async (ctx, result) => {
          return {
            ...result,
            _meta: { ...result._meta, timestamp: Date.now() },
          };
        })
      );

      // Add user info
      chain.use(
        defineMiddleware.withResult.after<TestResult>(async (ctx, result) => {
          const userId = ctx.state.get("userId");
          return {
            ...result,
            _meta: { ...result._meta, userId },
          };
        })
      );

      // Add tool name
      chain.use(
        defineMiddleware.withResult.after<TestResult>(async (ctx, result) => {
          return {
            ...result,
            _meta: { ...result._meta, toolName: ctx.toolName },
          };
        })
      );

      context.state.set("userId", "user-123");
      const result = await chain.execute(context, async () => {
        return { data: "test" };
      });

      expect(result.data).toBe("test");
      expect(result._meta?.timestamp).toBeTypeOf("number");
      expect(result._meta?.userId).toBe("user-123");
      expect(result._meta?.toolName).toBe("testTool");
    });

    it("should handle mixed void and result-passing middleware", async () => {
      const chain = new MiddlewareChain<TestResult>();

      // Void-based middleware adapted for result-passing chain
      chain.use(async (ctx, next) => {
        executionOrder.push("setup");
        ctx.state.set("initialized", true);
        return await next(); // Must return result
      });

      // Result-passing middleware
      chain.use(
        defineMiddleware.withResult.after<TestResult>(async (ctx, result) => {
          executionOrder.push("transform");
          return { ...result, count: (result.count || 0) + 1 };
        })
      );

      // Void-based middleware adapted for result-passing chain
      chain.use(async (ctx, next) => {
        const result = await next();
        executionOrder.push("cleanup");
        return result; // Must return result
      });

      const result = await chain.execute(context, async () => {
        executionOrder.push("handler");
        return { data: "test" };
      });

      expect(executionOrder).toEqual(["setup", "handler", "cleanup", "transform"]);
      expect(result).toEqual({ data: "test", count: 1 });
      expect(context.state.get("initialized")).toBe(true);
    });
  });

  describe("State management", () => {
    it("should share state across all middleware", async () => {
      const chain = new MiddlewareChain<TestResult>();

      chain.use(
        defineMiddleware.before(async (ctx) => {
          ctx.state.set("step1", "done");
        })
      );

      chain.use(
        defineMiddleware.before(async (ctx) => {
          expect(ctx.state.get("step1")).toBe("done");
          ctx.state.set("step2", "done");
        })
      );

      chain.use(
        defineMiddleware.withResult.after<TestResult>(async (ctx, result) => {
          expect(ctx.state.get("step1")).toBe("done");
          expect(ctx.state.get("step2")).toBe("done");
          ctx.state.set("step3", "done");
          return result;
        })
      );

      await chain.execute(context, async () => {
        expect(context.state.get("step1")).toBe("done");
        expect(context.state.get("step2")).toBe("done");
        context.state.set("handler", "done");
        return { data: "test" };
      });

      expect(context.state.get("handler")).toBe("done");
      expect(context.state.get("step3")).toBe("done");
    });
  });

  describe("Error recovery patterns", () => {
    it("should allow error handling middleware", async () => {
      const chain = new MiddlewareChain<TestResult>();

      chain.use(
        defineMiddleware.withResult.wrap<TestResult>(async (ctx, next) => {
          try {
            return await next();
          } catch (error) {
            executionOrder.push("error-caught");
            // Return fallback result
            return { data: "fallback" };
          }
        })
      );

      const result = await chain.execute(context, async () => {
        executionOrder.push("handler");
        throw new Error("Handler failed");
      });

      expect(executionOrder).toEqual(["handler", "error-caught"]);
      expect(result.data).toBe("fallback");
    });
  });
});
