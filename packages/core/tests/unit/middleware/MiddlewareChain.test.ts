/**
 * MiddlewareChain Unit Tests
 *
 * Tests the MiddlewareChain class implementation details:
 * - Middleware registration
 * - Execution order and control flow
 * - next() call tracking and multiple call detection
 * - Error handling and propagation
 * - State isolation between executions
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MiddlewareChain } from "../../../src/middleware/MiddlewareChain";
import type { Middleware, MiddlewareContext } from "../../../src/middleware/types";
import { MultipleNextCallsError } from "../../../src/middleware/types";

describe("MiddlewareChain", () => {
  let chain: MiddlewareChain;
  let context: MiddlewareContext;

  beforeEach(() => {
    chain = new MiddlewareChain();
    context = {
      toolName: "testTool",
      input: { test: "data" },
      metadata: { locale: "en-US" },
      state: new Map(),
    };
  });

  describe("Middleware Registration", () => {
    it("should start with empty middleware array", () => {
      expect(chain.hasMiddleware()).toBe(false);
    });

    it("should register middleware via use()", () => {
      const middleware: Middleware = async (_context, next) => {
        await next();
      };

      chain.use(middleware);
      expect(chain.hasMiddleware()).toBe(true);
    });

    it("should register multiple middleware in order", () => {
      const m1: Middleware = async (_context, next) => {
        await next();
      };
      const m2: Middleware = async (_context, next) => {
        await next();
      };
      const m3: Middleware = async (_context, next) => {
        await next();
      };

      chain.use(m1);
      chain.use(m2);
      chain.use(m3);

      expect(chain.hasMiddleware()).toBe(true);
    });
  });

  describe("Middleware Execution", () => {
    it("should execute single middleware", async () => {
      let middlewareCalled = false;

      const middleware: Middleware = async (_context, next) => {
        middlewareCalled = true;
        await next();
      };

      chain.use(middleware);

      let handlerCalled = false;
      await chain.execute(context, async () => {
        handlerCalled = true;
      });

      expect(middlewareCalled).toBe(true);
      expect(handlerCalled).toBe(true);
    });

    it("should execute middleware in registration order", async () => {
      const order: number[] = [];

      const m1: Middleware = async (_context, next) => {
        order.push(1);
        await next();
      };

      const m2: Middleware = async (_context, next) => {
        order.push(2);
        await next();
      };

      const m3: Middleware = async (_context, next) => {
        order.push(3);
        await next();
      };

      chain.use(m1);
      chain.use(m2);
      chain.use(m3);

      await chain.execute(context, async () => {
        order.push(4);
      });

      expect(order).toEqual([1, 2, 3, 4]);
    });

    it("should support middleware calling next() and executing code after", async () => {
      const executionLog: string[] = [];

      const middleware: Middleware = async (_context, next) => {
        executionLog.push("before");
        await next();
        executionLog.push("after");
      };

      chain.use(middleware);

      await chain.execute(context, async () => {
        executionLog.push("handler");
      });

      expect(executionLog).toEqual(["before", "handler", "after"]);
    });

    it("should allow middleware to not call next()", async () => {
      const middleware: Middleware = async (_context, _next) => {
        // Don't call next() - short-circuit
        return;
      };

      chain.use(middleware);

      let handlerCalled = false;
      await chain.execute(context, async () => {
        handlerCalled = true;
      });

      expect(handlerCalled).toBe(false);
    });

    it("should skip handler if middleware doesn't call next()", async () => {
      const m1: Middleware = async (_context, next) => {
        await next();
      };

      const m2: Middleware = async (_context, _next) => {
        // Don't call next()
        return;
      };

      const m3: Middleware = async (_context, next) => {
        await next();
      };

      chain.use(m1);
      chain.use(m2); // This one short-circuits
      chain.use(m3); // This won't run

      let m3Called = false;
      let handlerCalled = false;

      chain.use(async (_context, next) => {
        m3Called = true;
        await next();
      });

      await chain.execute(context, async () => {
        handlerCalled = true;
      });

      expect(m3Called).toBe(false);
      expect(handlerCalled).toBe(false);
    });
  });

  describe("next() Call Tracking", () => {
    it("should detect multiple next() calls in same middleware", async () => {
      const badMiddleware: Middleware = async (_context, next) => {
        await next();
        await next(); // Second call should throw
      };

      chain.use(badMiddleware);

      await expect(
        chain.execute(context, async () => {})
      ).rejects.toThrow(MultipleNextCallsError);
    });

    it("should include middleware index in error message", async () => {
      const m1: Middleware = async (_context, next) => {
        await next();
      };

      const badMiddleware: Middleware = async (_context, next) => {
        await next();
        await next();
      };

      chain.use(m1); // index 0
      chain.use(badMiddleware); // index 1

      try {
        await chain.execute(context, async () => {});
        expect.fail("Should have thrown MultipleNextCallsError");
      } catch (error) {
        expect(error).toBeInstanceOf(MultipleNextCallsError);
        expect((error as Error).message).toContain("index 1");
      }
    });

    it("should reset next() tracking between execute() calls", async () => {
      const middleware: Middleware = async (_context, next) => {
        await next();
      };

      chain.use(middleware);

      // First execution
      await chain.execute(context, async () => {});

      // Second execution should not throw
      await expect(
        chain.execute(context, async () => {})
      ).resolves.not.toThrow();
    });

    it("should track next() calls independently per middleware", async () => {
      const m1: Middleware = async (_context, next) => {
        await next(); // OK
      };

      const m2: Middleware = async (_context, next) => {
        await next(); // Also OK - different middleware
      };

      chain.use(m1);
      chain.use(m2);

      await expect(
        chain.execute(context, async () => {})
      ).resolves.not.toThrow();
    });
  });

  describe("Error Handling", () => {
    it("should propagate errors from middleware", async () => {
      const errorMiddleware: Middleware = async (_context, _next) => {
        throw new Error("Middleware error");
      };

      chain.use(errorMiddleware);

      await expect(
        chain.execute(context, async () => {})
      ).rejects.toThrow("Middleware error");
    });

    it("should propagate errors from handler", async () => {
      const middleware: Middleware = async (_context, next) => {
        await next();
      };

      chain.use(middleware);

      await expect(
        chain.execute(context, async () => {
          throw new Error("Handler error");
        })
      ).rejects.toThrow("Handler error");
    });

    it("should allow middleware to catch and handle errors", async () => {
      const errorHandlingMiddleware: Middleware = async (_context, next) => {
        try {
          await next();
        } catch (error) {
          // Catch error from handler
          // Don't re-throw - suppress error
        }
      };

      chain.use(errorHandlingMiddleware);

      // Should not throw because middleware caught it
      await expect(
        chain.execute(context, async () => {
          throw new Error("Handler error");
        })
      ).resolves.not.toThrow();
    });

    it("should allow middleware to transform errors", async () => {
      const transformMiddleware: Middleware = async (_context, next) => {
        try {
          await next();
        } catch (error) {
          throw new Error(`Transformed: ${(error as Error).message}`);
        }
      };

      chain.use(transformMiddleware);

      await expect(
        chain.execute(context, async () => {
          throw new Error("Original error");
        })
      ).rejects.toThrow("Transformed: Original error");
    });

    it("should propagate errors through multiple middleware", async () => {
      const errors: string[] = [];

      const m1: Middleware = async (_context, next) => {
        try {
          await next();
        } catch (error) {
          errors.push("m1 caught");
          throw error;
        }
      };

      const m2: Middleware = async (_context, next) => {
        try {
          await next();
        } catch (error) {
          errors.push("m2 caught");
          throw error;
        }
      };

      chain.use(m1);
      chain.use(m2);

      await expect(
        chain.execute(context, async () => {
          throw new Error("Handler error");
        })
      ).rejects.toThrow("Handler error");

      expect(errors).toEqual(["m2 caught", "m1 caught"]);
    });
  });

  describe("Context State Management", () => {
    it("should allow middleware to set state", async () => {
      const middleware: Middleware = async (context, next) => {
        context.state.set("userId", "user-123");
        await next();
      };

      chain.use(middleware);

      await chain.execute(context, async () => {
        expect(context.state.get("userId")).toBe("user-123");
      });
    });

    it("should share state between middleware", async () => {
      const m1: Middleware = async (context, next) => {
        context.state.set("step1", "done");
        await next();
      };

      const m2: Middleware = async (context, next) => {
        expect(context.state.get("step1")).toBe("done");
        context.state.set("step2", "done");
        await next();
      };

      chain.use(m1);
      chain.use(m2);

      await chain.execute(context, async () => {
        expect(context.state.get("step1")).toBe("done");
        expect(context.state.get("step2")).toBe("done");
      });
    });

    it("should isolate state between different executions", async () => {
      const middleware: Middleware = async (context, next) => {
        context.state.set("counter", (context.state.get("counter") as number || 0) + 1);
        await next();
      };

      chain.use(middleware);

      // First execution
      const context1: MiddlewareContext = {
        toolName: "test",
        input: {},
        metadata: {},
        state: new Map(),
      };

      await chain.execute(context1, async () => {
        expect(context1.state.get("counter")).toBe(1);
      });

      // Second execution with different context
      const context2: MiddlewareContext = {
        toolName: "test",
        input: {},
        metadata: {},
        state: new Map(),
      };

      await chain.execute(context2, async () => {
        // Should start from 0 again
        expect(context2.state.get("counter")).toBe(1);
      });
    });
  });

  describe("hasMiddleware()", () => {
    it("should return false when no middleware registered", () => {
      expect(chain.hasMiddleware()).toBe(false);
    });

    it("should return true when middleware registered", () => {
      chain.use(async (_context, next) => {
        await next();
      });
      expect(chain.hasMiddleware()).toBe(true);
    });

    it("should return true after multiple middleware registered", () => {
      chain.use(async (_context, next) => {
        await next();
      });
      chain.use(async (_context, next) => {
        await next();
      });
      expect(chain.hasMiddleware()).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty middleware chain", async () => {
      let handlerCalled = false;

      await chain.execute(context, async () => {
        handlerCalled = true;
      });

      expect(handlerCalled).toBe(true);
    });

    it("should handle middleware that throws synchronously", async () => {
      const syncThrowMiddleware: Middleware = (_context, _next) => {
        throw new Error("Sync error");
      };

      chain.use(syncThrowMiddleware);

      await expect(
        chain.execute(context, async () => {})
      ).rejects.toThrow("Sync error");
    });

    it("should handle handler that returns value", async () => {
      const middleware: Middleware = async (_context, next) => {
        await next();
      };

      chain.use(middleware);

      let result: string | undefined;
      await chain.execute(context, async () => {
        result = "handler result";
      });

      expect(result).toBe("handler result");
    });

    it("should handle middleware modifying context before calling next()", async () => {
      const middleware: Middleware = async (context, next) => {
        // Middleware can add state before downstream middleware/handler
        context.state.set("prepared", true);
        await next();
      };

      chain.use(middleware);

      await chain.execute(context, async () => {
        expect(context.state.get("prepared")).toBe(true);
      });
    });

    it("should handle middleware modifying context after calling next()", async () => {
      const middleware: Middleware = async (context, next) => {
        await next();
        // Middleware can modify state after handler completes
        context.state.set("processed", true);
      };

      chain.use(middleware);

      await chain.execute(context, async () => {
        expect(context.state.get("processed")).toBeUndefined();
      });

      // After handler completes, middleware's after-next code runs
      expect(context.state.get("processed")).toBe(true);
    });
  });
});
