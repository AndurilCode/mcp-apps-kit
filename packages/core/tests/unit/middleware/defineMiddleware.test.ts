/**
 * defineMiddleware Unit Tests - Basic Pattern
 *
 * Tests the basic (void-based) middleware patterns:
 * - defineMiddleware({ before, after })
 * - defineMiddleware.before()
 * - defineMiddleware.after()
 * - defineMiddleware.wrap()
 */

import { describe, it, expect, beforeEach } from "vitest";
import { defineMiddleware } from "../../../src/middleware/defineMiddleware";
import type { MiddlewareContext } from "../../../src/middleware/types";

describe("defineMiddleware - Basic Pattern", () => {
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

  describe("defineMiddleware({ before, after })", () => {
    it("should execute before hook, then next, then after hook", async () => {
      const middleware = defineMiddleware({
        before: async (ctx) => {
          executionOrder.push("before");
          expect(ctx.toolName).toBe("testTool");
        },
        after: async (ctx) => {
          executionOrder.push("after");
          expect(ctx.toolName).toBe("testTool");
        },
      });

      await middleware(context, async () => {
        executionOrder.push("next");
      });

      expect(executionOrder).toEqual(["before", "next", "after"]);
    });

    it("should work with only before hook", async () => {
      const middleware = defineMiddleware({
        before: async () => {
          executionOrder.push("before");
        },
      });

      await middleware(context, async () => {
        executionOrder.push("next");
      });

      expect(executionOrder).toEqual(["before", "next"]);
    });

    it("should work with only after hook", async () => {
      const middleware = defineMiddleware({
        after: async () => {
          executionOrder.push("after");
        },
      });

      await middleware(context, async () => {
        executionOrder.push("next");
      });

      expect(executionOrder).toEqual(["next", "after"]);
    });

    it("should call next() even with empty definition", async () => {
      const middleware = defineMiddleware({});

      await middleware(context, async () => {
        executionOrder.push("next");
      });

      expect(executionOrder).toEqual(["next"]);
    });

    it("should allow state sharing between before and after", async () => {
      const middleware = defineMiddleware({
        before: async (ctx) => {
          ctx.state.set("timestamp", Date.now());
          ctx.state.set("initialized", true);
        },
        after: async (ctx) => {
          expect(ctx.state.get("timestamp")).toBeTypeOf("number");
          expect(ctx.state.get("initialized")).toBe(true);
        },
      });

      await middleware(context, async () => {});

      expect(context.state.get("initialized")).toBe(true);
    });

    it("should support synchronous hooks", async () => {
      const middleware = defineMiddleware({
        before: (ctx) => {
          executionOrder.push("before");
        },
        after: (ctx) => {
          executionOrder.push("after");
        },
      });

      await middleware(context, async () => {
        executionOrder.push("next");
      });

      expect(executionOrder).toEqual(["before", "next", "after"]);
    });

    it("should propagate errors from before hook", async () => {
      const middleware = defineMiddleware({
        before: async () => {
          throw new Error("Before hook error");
        },
        after: async () => {
          executionOrder.push("after"); // Should not run
        },
      });

      await expect(
        middleware(context, async () => {
          executionOrder.push("next"); // Should not run
        })
      ).rejects.toThrow("Before hook error");

      expect(executionOrder).toEqual([]);
    });

    it("should propagate errors from next()", async () => {
      const middleware = defineMiddleware({
        before: async () => {
          executionOrder.push("before");
        },
        after: async () => {
          executionOrder.push("after"); // Should not run
        },
      });

      await expect(
        middleware(context, async () => {
          throw new Error("Handler error");
        })
      ).rejects.toThrow("Handler error");

      expect(executionOrder).toEqual(["before"]);
    });

    it("should propagate errors from after hook", async () => {
      const middleware = defineMiddleware({
        before: async () => {
          executionOrder.push("before");
        },
        after: async () => {
          executionOrder.push("after");
          throw new Error("After hook error");
        },
      });

      await expect(
        middleware(context, async () => {
          executionOrder.push("next");
        })
      ).rejects.toThrow("After hook error");

      expect(executionOrder).toEqual(["before", "next", "after"]);
    });
  });

  describe("defineMiddleware.before()", () => {
    it("should execute hook then call next automatically", async () => {
      const middleware = defineMiddleware.before(async (ctx) => {
        executionOrder.push("before");
        ctx.state.set("initialized", true);
      });

      await middleware(context, async () => {
        executionOrder.push("next");
      });

      expect(executionOrder).toEqual(["before", "next"]);
      expect(context.state.get("initialized")).toBe(true);
    });

    it("should support synchronous hooks", async () => {
      const middleware = defineMiddleware.before((ctx) => {
        executionOrder.push("before");
      });

      await middleware(context, async () => {
        executionOrder.push("next");
      });

      expect(executionOrder).toEqual(["before", "next"]);
    });

    it("should propagate errors from hook", async () => {
      const middleware = defineMiddleware.before(async () => {
        throw new Error("Before hook error");
      });

      await expect(
        middleware(context, async () => {
          executionOrder.push("next");
        })
      ).rejects.toThrow("Before hook error");

      expect(executionOrder).toEqual([]);
    });

    it("should allow state modifications", async () => {
      const middleware = defineMiddleware.before(async (ctx) => {
        ctx.state.set("startTime", performance.now());
        ctx.state.set("user", { id: "123", name: "Test User" });
      });

      await middleware(context, async () => {});

      expect(context.state.get("startTime")).toBeTypeOf("number");
      expect(context.state.get("user")).toEqual({ id: "123", name: "Test User" });
    });
  });

  describe("defineMiddleware.after()", () => {
    it("should call next then execute hook automatically", async () => {
      const middleware = defineMiddleware.after(async (ctx) => {
        executionOrder.push("after");
        expect(ctx.state.get("handlerRan")).toBe(true);
      });

      await middleware(context, async () => {
        executionOrder.push("next");
        context.state.set("handlerRan", true);
      });

      expect(executionOrder).toEqual(["next", "after"]);
    });

    it("should support synchronous hooks", async () => {
      const middleware = defineMiddleware.after((ctx) => {
        executionOrder.push("after");
      });

      await middleware(context, async () => {
        executionOrder.push("next");
      });

      expect(executionOrder).toEqual(["next", "after"]);
    });

    it("should propagate errors from hook", async () => {
      const middleware = defineMiddleware.after(async () => {
        executionOrder.push("after");
        throw new Error("After hook error");
      });

      await expect(
        middleware(context, async () => {
          executionOrder.push("next");
        })
      ).rejects.toThrow("After hook error");

      expect(executionOrder).toEqual(["next", "after"]);
    });

    it("should have access to state set by handler", async () => {
      const middleware = defineMiddleware.after(async (ctx) => {
        const duration = Date.now() - (ctx.state.get("startTime") as number);
        ctx.state.set("duration", duration);
      });

      await middleware(context, async () => {
        context.state.set("startTime", Date.now());
      });

      expect(context.state.has("duration")).toBe(true);
    });
  });

  describe("defineMiddleware.wrap()", () => {
    it("should allow conditional next() call", async () => {
      const middleware = defineMiddleware.wrap(async (ctx, next) => {
        if (ctx.toolName === "skip") {
          executionOrder.push("skipped");
          return; // Don't call next
        }
        executionOrder.push("before");
        await next();
        executionOrder.push("after");
      });

      // Test with skip condition
      const skipContext = { ...context, toolName: "skip" };
      await middleware(skipContext, async () => {
        executionOrder.push("next");
      });
      expect(executionOrder).toEqual(["skipped"]);

      // Test without skip condition
      executionOrder = [];
      await middleware(context, async () => {
        executionOrder.push("next");
      });
      expect(executionOrder).toEqual(["before", "next", "after"]);
    });

    it("should allow error handling", async () => {
      const middleware = defineMiddleware.wrap(async (ctx, next) => {
        try {
          await next();
        } catch (error) {
          executionOrder.push("caught");
          ctx.state.set("error", error);
          throw new Error("Wrapped error");
        }
      });

      await expect(
        middleware(context, async () => {
          throw new Error("Handler error");
        })
      ).rejects.toThrow("Wrapped error");

      expect(executionOrder).toEqual(["caught"]);
      expect(context.state.get("error")).toBeDefined();
    });

    it("should enforce Promise<void> return type", async () => {
      const middleware = defineMiddleware.wrap(async (ctx, next) => {
        executionOrder.push("before");
        await next();
        executionOrder.push("after");
        // TypeScript should enforce returning void
      });

      await middleware(context, async () => {
        executionOrder.push("next");
      });

      expect(executionOrder).toEqual(["before", "next", "after"]);
    });

    it("should allow authentication pattern", async () => {
      const authMiddleware = defineMiddleware.wrap(async (ctx, next) => {
        const token = ctx.metadata.raw?.["authorization"];
        if (!token) {
          throw new Error("Unauthorized");
        }
        ctx.state.set("authenticated", true);
        ctx.state.set("token", token);
        return next();
      });

      // Without token
      await expect(authMiddleware(context, async () => {})).rejects.toThrow("Unauthorized");

      // With token
      context.metadata.raw = { authorization: "Bearer token123" };
      await authMiddleware(context, async () => {
        executionOrder.push("handler");
      });

      expect(context.state.get("authenticated")).toBe(true);
      expect(context.state.get("token")).toBe("Bearer token123");
      expect(executionOrder).toEqual(["handler"]);
    });

    it("should support complex control flow", async () => {
      const middleware = defineMiddleware.wrap(async (ctx, next) => {
        const bypass = ctx.state.get("bypass");
        if (bypass) {
          executionOrder.push("bypassed");
          return;
        }

        executionOrder.push("validate");
        if (!ctx.input) {
          throw new Error("Invalid input");
        }

        executionOrder.push("before-next");
        await next();
        executionOrder.push("after-next");

        ctx.state.set("processed", true);
      });

      // Test bypass
      context.state.set("bypass", true);
      await middleware(context, async () => {
        executionOrder.push("handler");
      });
      expect(executionOrder).toEqual(["bypassed"]);

      // Test validation failure
      executionOrder = [];
      context.state.delete("bypass");
      context.input = null;
      await expect(middleware(context, async () => {})).rejects.toThrow("Invalid input");
      expect(executionOrder).toEqual(["validate"]);

      // Test successful execution
      executionOrder = [];
      context.input = { test: "data" };
      await middleware(context, async () => {
        executionOrder.push("handler");
      });
      expect(executionOrder).toEqual(["validate", "before-next", "handler", "after-next"]);
      expect(context.state.get("processed")).toBe(true);
    });
  });

  describe("Multiple middleware chaining", () => {
    it("should compose multiple defineMiddleware instances", async () => {
      const m1 = defineMiddleware.before(async () => {
        executionOrder.push("m1-before");
      });

      const m2 = defineMiddleware({
        before: async () => {
          executionOrder.push("m2-before");
        },
        after: async () => {
          executionOrder.push("m2-after");
        },
      });

      const m3 = defineMiddleware.after(async () => {
        executionOrder.push("m3-after");
      });

      // Simulate middleware chain execution
      await m1(context, async () => {
        await m2(context, async () => {
          await m3(context, async () => {
            executionOrder.push("handler");
          });
        });
      });

      expect(executionOrder).toEqual(["m1-before", "m2-before", "handler", "m3-after", "m2-after"]);
    });
  });
});
