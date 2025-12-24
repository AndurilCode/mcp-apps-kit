/**
 * Middleware API Contract Tests
 *
 * Tests the middleware API contract to ensure:
 * - Middleware functions receive context and next
 * - MiddlewareContext has required immutable properties
 * - MiddlewareContext.state is mutable Map
 * - Middleware executes in registration order
 * - Multiple next() calls are detected
 * - Middleware errors propagate correctly
 *
 * These tests define the contract that middleware implementations must follow.
 */

import { describe, it, expect } from "vitest";
import type { Middleware, MiddlewareContext } from "../../src/middleware/types";
import { MultipleNextCallsError } from "../../src/middleware/types";
import { MiddlewareChain } from "../../src/middleware/MiddlewareChain";

describe("Middleware API Contract", () => {
  describe("MiddlewareContext Interface", () => {
    it("should have immutable toolName property", () => {
      const context: MiddlewareContext = {
        toolName: "testTool",
        input: { foo: "bar" },
        metadata: {},
        state: new Map(),
      };

      expect(context.toolName).toBe("testTool");

      // TypeScript should prevent assignment (compile-time check)
      // @ts-expect-error - toolName is readonly
      context.toolName = "modified";
    });

    it("should have immutable input property", () => {
      const context: MiddlewareContext = {
        toolName: "testTool",
        input: { foo: "bar" },
        metadata: {},
        state: new Map(),
      };

      expect(context.input).toEqual({ foo: "bar" });

      // TypeScript should prevent assignment (compile-time check)
      // @ts-expect-error - input is readonly
      context.input = { modified: true };
    });

    it("should have immutable metadata property", () => {
      const context: MiddlewareContext = {
        toolName: "testTool",
        input: {},
        metadata: { locale: "en-US" },
        state: new Map(),
      };

      expect(context.metadata).toEqual({ locale: "en-US" });

      // TypeScript should prevent assignment (compile-time check)
      // @ts-expect-error - metadata is readonly
      context.metadata = {};
    });

    it("should have mutable state Map", () => {
      const context: MiddlewareContext = {
        toolName: "testTool",
        input: {},
        metadata: {},
        state: new Map(),
      };

      // State should be a Map
      expect(context.state).toBeInstanceOf(Map);

      // State should be mutable
      context.state.set("test", "value");
      expect(context.state.get("test")).toBe("value");
    });

    it("should allow middleware to share data via state Map", () => {
      const context: MiddlewareContext = {
        toolName: "testTool",
        input: {},
        metadata: {},
        state: new Map(),
      };

      // First middleware sets state
      context.state.set("userId", "user-123");
      context.state.set("authLevel", "admin");

      // Second middleware reads state
      expect(context.state.get("userId")).toBe("user-123");
      expect(context.state.get("authLevel")).toBe("admin");
    });
  });

  describe("Middleware Function Signature", () => {
    it("should accept (context, next) parameters", async () => {
      const middleware: Middleware = async (context, next) => {
        expect(context).toBeDefined();
        expect(context.toolName).toBeDefined();
        expect(context.input).toBeDefined();
        expect(context.metadata).toBeDefined();
        expect(context.state).toBeDefined();
        expect(typeof next).toBe("function");
        await next();
      };

      const chain = new MiddlewareChain();
      chain.use(middleware);

      const context: MiddlewareContext = {
        toolName: "test",
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

    it("should execute before tool handler", async () => {
      const executionOrder: string[] = [];

      const middleware: Middleware = async (_context, next) => {
        executionOrder.push("middleware-before");
        await next();
        executionOrder.push("middleware-after");
      };

      const chain = new MiddlewareChain();
      chain.use(middleware);

      const context: MiddlewareContext = {
        toolName: "test",
        input: {},
        metadata: {},
        state: new Map(),
      };

      await chain.execute(context, async () => {
        executionOrder.push("handler");
      });

      expect(executionOrder).toEqual([
        "middleware-before",
        "handler",
        "middleware-after",
      ]);
    });

    it("should allow async middleware", async () => {
      const middleware: Middleware = async (_context, next) => {
        // Simulate async operation
        await new Promise((resolve) => setTimeout(resolve, 10));
        await next();
      };

      const chain = new MiddlewareChain();
      chain.use(middleware);

      const context: MiddlewareContext = {
        toolName: "test",
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

  describe("Middleware Execution Order", () => {
    it("should execute middleware in registration order", async () => {
      const executionOrder: string[] = [];

      const middleware1: Middleware = async (_context, next) => {
        executionOrder.push("m1-before");
        await next();
        executionOrder.push("m1-after");
      };

      const middleware2: Middleware = async (_context, next) => {
        executionOrder.push("m2-before");
        await next();
        executionOrder.push("m2-after");
      };

      const middleware3: Middleware = async (_context, next) => {
        executionOrder.push("m3-before");
        await next();
        executionOrder.push("m3-after");
      };

      const chain = new MiddlewareChain();
      chain.use(middleware1);
      chain.use(middleware2);
      chain.use(middleware3);

      const context: MiddlewareContext = {
        toolName: "test",
        input: {},
        metadata: {},
        state: new Map(),
      };

      await chain.execute(context, async () => {
        executionOrder.push("handler");
      });

      expect(executionOrder).toEqual([
        "m1-before",
        "m2-before",
        "m3-before",
        "handler",
        "m3-after",
        "m2-after",
        "m1-after",
      ]);
    });

    it("should allow middleware to modify state for downstream middleware", async () => {
      const middleware1: Middleware = async (context, next) => {
        context.state.set("step1", "complete");
        await next();
      };

      const middleware2: Middleware = async (context, next) => {
        expect(context.state.get("step1")).toBe("complete");
        context.state.set("step2", "complete");
        await next();
      };

      const chain = new MiddlewareChain();
      chain.use(middleware1);
      chain.use(middleware2);

      const context: MiddlewareContext = {
        toolName: "test",
        input: {},
        metadata: {},
        state: new Map(),
      };

      await chain.execute(context, async () => {
        expect(context.state.get("step1")).toBe("complete");
        expect(context.state.get("step2")).toBe("complete");
      });
    });
  });

  describe("Middleware Control Flow", () => {
    it("should allow middleware to skip calling next()", async () => {
      const middleware: Middleware = async (_context, _next) => {
        // Don't call next() - short-circuit the chain
        return;
      };

      const chain = new MiddlewareChain();
      chain.use(middleware);

      const context: MiddlewareContext = {
        toolName: "test",
        input: {},
        metadata: {},
        state: new Map(),
      };

      let handlerCalled = false;
      await chain.execute(context, async () => {
        handlerCalled = true;
      });

      // Handler should NOT be called if middleware doesn't call next()
      expect(handlerCalled).toBe(false);
    });

    it("should throw error when middleware calls next() multiple times", async () => {
      const badMiddleware: Middleware = async (_context, next) => {
        await next();
        await next(); // Second call should throw
      };

      const chain = new MiddlewareChain();
      chain.use(badMiddleware);

      const context: MiddlewareContext = {
        toolName: "test",
        input: {},
        metadata: {},
        state: new Map(),
      };

      await expect(
        chain.execute(context, async () => {
          // Handler
        })
      ).rejects.toThrow(MultipleNextCallsError);
    });

    it("should identify which middleware called next() multiple times", async () => {
      const middleware1: Middleware = async (_context, next) => {
        await next();
      };

      const badMiddleware: Middleware = async (_context, next) => {
        await next();
        await next(); // Second call
      };

      const chain = new MiddlewareChain();
      chain.use(middleware1); // index 0
      chain.use(badMiddleware); // index 1

      const context: MiddlewareContext = {
        toolName: "test",
        input: {},
        metadata: {},
        state: new Map(),
      };

      await expect(
        chain.execute(context, async () => {})
      ).rejects.toThrow(/index 1/);
    });
  });

  describe("Middleware Error Handling", () => {
    it("should propagate errors from middleware", async () => {
      const errorMiddleware: Middleware = async (_context, _next) => {
        throw new Error("Middleware error");
      };

      const chain = new MiddlewareChain();
      chain.use(errorMiddleware);

      const context: MiddlewareContext = {
        toolName: "test",
        input: {},
        metadata: {},
        state: new Map(),
      };

      await expect(
        chain.execute(context, async () => {})
      ).rejects.toThrow("Middleware error");
    });

    it("should propagate errors from handler through middleware", async () => {
      const middleware: Middleware = async (_context, next) => {
        try {
          await next();
        } catch (error) {
          // Middleware can observe error
          expect(error).toBeInstanceOf(Error);
          throw error; // Re-throw
        }
      };

      const chain = new MiddlewareChain();
      chain.use(middleware);

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
    });

    it("should allow middleware to catch and suppress errors", async () => {
      const errorHandlingMiddleware: Middleware = async (_context, next) => {
        try {
          await next();
        } catch (error) {
          // Swallow error - don't re-throw
          return;
        }
      };

      const chain = new MiddlewareChain();
      chain.use(errorHandlingMiddleware);

      const context: MiddlewareContext = {
        toolName: "test",
        input: {},
        metadata: {},
        state: new Map(),
      };

      // Should NOT throw because middleware caught the error
      await expect(
        chain.execute(context, async () => {
          throw new Error("Handler error");
        })
      ).resolves.not.toThrow();
    });
  });

  describe("MiddlewareChain API", () => {
    it("should have use() method to register middleware", () => {
      const chain = new MiddlewareChain();
      const middleware: Middleware = async (_context, next) => {
        await next();
      };

      expect(() => chain.use(middleware)).not.toThrow();
    });

    it("should have execute() method to run middleware chain", () => {
      const chain = new MiddlewareChain();
      const context: MiddlewareContext = {
        toolName: "test",
        input: {},
        metadata: {},
        state: new Map(),
      };

      expect(
        chain.execute(context, async () => {})
      ).toBeInstanceOf(Promise);
    });

    it("should have hasMiddleware() method to check if middleware registered", () => {
      const chain = new MiddlewareChain();
      expect(chain.hasMiddleware()).toBe(false);

      chain.use(async (_context, next) => {
        await next();
      });
      expect(chain.hasMiddleware()).toBe(true);
    });
  });
});
