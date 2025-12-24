/**
 * Rate Limit Middleware Unit Tests
 *
 * Tests the built-in rate limiting middleware:
 * - Request counting and limits
 * - Time window-based rate limiting
 * - Per-user/per-IP rate limiting
 * - Rate limit exceeded errors
 * - Rate limit reset
 * - Different rate limits per tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Middleware, MiddlewareContext } from "../../../src/middleware/types";

// Mock rate limit middleware (will be implemented)
function createRateLimitMiddleware(options: {
  maxRequests: number;
  windowMs: number;
  keyGenerator?: (context: MiddlewareContext) => string;
}): Middleware {
  const requestCounts = new Map<string, { count: number; resetAt: number }>();

  return async (context, next) => {
    const now = Date.now();

    // Generate key for rate limiting (default: by userId from state or IP)
    const key = options.keyGenerator
      ? options.keyGenerator(context)
      : (context.state.get("userId") as string) ||
        (context.metadata as any).ip as string ||
        "default";

    // Get or create request count for this key
    let record = requestCounts.get(key);

    // Reset if window has passed
    if (!record || now > record.resetAt) {
      record = {
        count: 0,
        resetAt: now + options.windowMs,
      };
      requestCounts.set(key, record);
    }

    // Check if limit exceeded
    if (record.count >= options.maxRequests) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      context.state.set("rateLimitExceeded", true);
      context.state.set("retryAfter", retryAfter);
      throw new Error(`Rate limit exceeded. Retry after ${retryAfter} seconds.`);
    }

    // Increment count
    record.count++;
    context.state.set("rateLimitRemaining", options.maxRequests - record.count);

    await next();
  };
}

describe("Rate Limit Middleware", () => {
  let context: MiddlewareContext;

  beforeEach(() => {
    vi.useFakeTimers();
    context = {
      toolName: "testTool",
      input: {},
      metadata: {},
      state: new Map(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Basic Rate Limiting", () => {
    it("should allow requests under limit", async () => {
      const rateLimitMiddleware = createRateLimitMiddleware({
        maxRequests: 5,
        windowMs: 60000, // 1 minute
      });

      context.state.set("userId", "user-123");

      // Make 5 requests (at limit)
      for (let i = 0; i < 5; i++) {
        let nextCalled = false;
        await rateLimitMiddleware(context, async () => {
          nextCalled = true;
        });
        expect(nextCalled).toBe(true);
      }
    });

    it("should reject requests over limit", async () => {
      const rateLimitMiddleware = createRateLimitMiddleware({
        maxRequests: 3,
        windowMs: 60000,
      });

      context.state.set("userId", "user-123");

      // Make 3 successful requests
      for (let i = 0; i < 3; i++) {
        await rateLimitMiddleware(context, async () => {});
      }

      // 4th request should be rejected
      await expect(
        rateLimitMiddleware(context, async () => {})
      ).rejects.toThrow("Rate limit exceeded");
    });

    it("should include retry-after in error message", async () => {
      const rateLimitMiddleware = createRateLimitMiddleware({
        maxRequests: 2,
        windowMs: 60000,
      });

      context.state.set("userId", "user-123");

      // Exhaust limit
      await rateLimitMiddleware(context, async () => {});
      await rateLimitMiddleware(context, async () => {});

      // Next request should include retry-after
      try {
        await rateLimitMiddleware(context, async () => {});
        expect.fail("Should have thrown rate limit error");
      } catch (error) {
        expect((error as Error).message).toMatch(/Retry after \d+ seconds/);
      }
    });

    it("should set remaining count in state", async () => {
      const rateLimitMiddleware = createRateLimitMiddleware({
        maxRequests: 5,
        windowMs: 60000,
      });

      context.state.set("userId", "user-123");

      // First request
      await rateLimitMiddleware(context, async () => {});
      expect(context.state.get("rateLimitRemaining")).toBe(4);

      // Second request
      await rateLimitMiddleware(context, async () => {});
      expect(context.state.get("rateLimitRemaining")).toBe(3);
    });
  });

  describe("Time Window Reset", () => {
    it("should reset count after time window", async () => {
      const rateLimitMiddleware = createRateLimitMiddleware({
        maxRequests: 3,
        windowMs: 60000, // 1 minute
      });

      context.state.set("userId", "user-123");

      // Exhaust limit
      for (let i = 0; i < 3; i++) {
        await rateLimitMiddleware(context, async () => {});
      }

      // Should be rate limited
      await expect(
        rateLimitMiddleware(context, async () => {})
      ).rejects.toThrow("Rate limit exceeded");

      // Advance time by 61 seconds (past window)
      vi.advanceTimersByTime(61000);

      // Should work again after reset
      let nextCalled = false;
      await rateLimitMiddleware(context, async () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(true);
    });

    it("should maintain separate time windows for different keys", async () => {
      const rateLimitMiddleware = createRateLimitMiddleware({
        maxRequests: 2,
        windowMs: 60000,
      });

      // User 1 exhausts limit
      context.state.set("userId", "user-1");
      await rateLimitMiddleware(context, async () => {});
      await rateLimitMiddleware(context, async () => {});

      // User 1 is rate limited
      await expect(
        rateLimitMiddleware(context, async () => {})
      ).rejects.toThrow("Rate limit exceeded");

      // User 2 should still have full quota
      context.state = new Map();
      context.state.set("userId", "user-2");

      let nextCalled = false;
      await rateLimitMiddleware(context, async () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(true);
    });

    it("should reset individual user windows independently", async () => {
      const rateLimitMiddleware = createRateLimitMiddleware({
        maxRequests: 2,
        windowMs: 60000,
      });

      // User 1 makes request at t=0
      context.state.set("userId", "user-1");
      await rateLimitMiddleware(context, async () => {});

      // Advance time by 30 seconds
      vi.advanceTimersByTime(30000);

      // User 2 makes request at t=30
      context.state = new Map();
      context.state.set("userId", "user-2");
      await rateLimitMiddleware(context, async () => {});

      // Advance time by 31 more seconds (t=61)
      vi.advanceTimersByTime(31000);

      // User 1's window should be reset (61 seconds since first request)
      context.state = new Map();
      context.state.set("userId", "user-1");

      let user1Success = false;
      await rateLimitMiddleware(context, async () => {
        user1Success = true;
      });
      expect(user1Success).toBe(true);

      // User 2's window should still be active (only 31 seconds since first request)
      context.state = new Map();
      context.state.set("userId", "user-2");
      await rateLimitMiddleware(context, async () => {}); // 2nd request

      // User 2 should be rate limited (3rd request within window)
      await expect(
        rateLimitMiddleware(context, async () => {})
      ).rejects.toThrow("Rate limit exceeded");
    });
  });

  describe("Per-User Rate Limiting", () => {
    it("should track requests per userId from state", async () => {
      const rateLimitMiddleware = createRateLimitMiddleware({
        maxRequests: 2,
        windowMs: 60000,
      });

      // User 1 makes 2 requests
      context.state.set("userId", "user-1");
      await rateLimitMiddleware(context, async () => {});
      await rateLimitMiddleware(context, async () => {});

      // User 1 is limited
      await expect(
        rateLimitMiddleware(context, async () => {})
      ).rejects.toThrow("Rate limit exceeded");

      // User 2 should have separate quota
      const context2: MiddlewareContext = {
        toolName: "testTool",
        input: {},
        metadata: {},
        state: new Map([["userId", "user-2"]]),
      };

      let nextCalled = false;
      await rateLimitMiddleware(context2, async () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(true);
    });

    it("should use IP address as fallback if no userId", async () => {
      const rateLimitMiddleware = createRateLimitMiddleware({
        maxRequests: 2,
        windowMs: 60000,
      });

      // Requests from same IP
      context.metadata = { ip: "192.168.1.1" };

      await rateLimitMiddleware(context, async () => {});
      await rateLimitMiddleware(context, async () => {});

      // Should be rate limited
      await expect(
        rateLimitMiddleware(context, async () => {})
      ).rejects.toThrow("Rate limit exceeded");

      // Different IP should have separate quota
      const context2: MiddlewareContext = {
        toolName: "testTool",
        input: {},
        metadata: { ip: "192.168.1.2" },
        state: new Map(),
      };

      let nextCalled = false;
      await rateLimitMiddleware(context2, async () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(true);
    });
  });

  describe("Custom Key Generation", () => {
    it("should accept custom key generator", async () => {
      const keyGenerator = vi.fn((context: MiddlewareContext) => {
        return `${context.toolName}-${context.state.get("userId")}`;
      });

      const rateLimitMiddleware = createRateLimitMiddleware({
        maxRequests: 2,
        windowMs: 60000,
        keyGenerator,
      });

      context.state.set("userId", "user-123");
      context.toolName = "getTool";

      await rateLimitMiddleware(context, async () => {});

      expect(keyGenerator).toHaveBeenCalledWith(context);
    });

    it("should allow different limits per tool", async () => {
      const keyGenerator = (context: MiddlewareContext) => {
        return `${context.toolName}-${context.state.get("userId")}`;
      };

      const rateLimitMiddleware = createRateLimitMiddleware({
        maxRequests: 2,
        windowMs: 60000,
        keyGenerator,
      });

      context.state.set("userId", "user-123");

      // Use 2 requests for "getTool"
      context.toolName = "getTool";
      await rateLimitMiddleware(context, async () => {});
      await rateLimitMiddleware(context, async () => {});

      // Should be limited for "getTool"
      await expect(
        rateLimitMiddleware(context, async () => {})
      ).rejects.toThrow("Rate limit exceeded");

      // But should still have quota for "postTool"
      context.toolName = "postTool";

      let nextCalled = false;
      await rateLimitMiddleware(context, async () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(true);
    });

    it("should support custom composite keys", async () => {
      const keyGenerator = (context: MiddlewareContext) => {
        const userId = context.state.get("userId") as string;
        const apiVersion = (context.metadata as any).apiVersion as string;
        return `${userId}-${apiVersion}`;
      };

      const rateLimitMiddleware = createRateLimitMiddleware({
        maxRequests: 2,
        windowMs: 60000,
        keyGenerator,
      });

      context.state.set("userId", "user-123");
      context.metadata = { apiVersion: "v1" };

      // Use quota for v1
      await rateLimitMiddleware(context, async () => {});
      await rateLimitMiddleware(context, async () => {});

      // Should be limited for v1
      await expect(
        rateLimitMiddleware(context, async () => {})
      ).rejects.toThrow("Rate limit exceeded");

      // But should have separate quota for v2
      context.metadata = { apiVersion: "v2" };

      let nextCalled = false;
      await rateLimitMiddleware(context, async () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(true);
    });
  });

  describe("Rate Limit State", () => {
    it("should set rateLimitExceeded flag when limit hit", async () => {
      const rateLimitMiddleware = createRateLimitMiddleware({
        maxRequests: 1,
        windowMs: 60000,
      });

      context.state.set("userId", "user-123");

      // Exhaust limit
      await rateLimitMiddleware(context, async () => {});

      // Next request should set flag
      try {
        await rateLimitMiddleware(context, async () => {});
        expect.fail("Should have thrown");
      } catch {
        expect(context.state.get("rateLimitExceeded")).toBe(true);
      }
    });

    it("should set retryAfter in state", async () => {
      const rateLimitMiddleware = createRateLimitMiddleware({
        maxRequests: 1,
        windowMs: 60000,
      });

      context.state.set("userId", "user-123");

      // Exhaust limit
      await rateLimitMiddleware(context, async () => {});

      // Check retry-after
      try {
        await rateLimitMiddleware(context, async () => {});
        expect.fail("Should have thrown");
      } catch {
        const retryAfter = context.state.get("retryAfter") as number;
        expect(retryAfter).toBeGreaterThan(0);
        expect(retryAfter).toBeLessThanOrEqual(60);
      }
    });

    it("should update remaining count as requests are made", async () => {
      const rateLimitMiddleware = createRateLimitMiddleware({
        maxRequests: 5,
        windowMs: 60000,
      });

      context.state.set("userId", "user-123");

      await rateLimitMiddleware(context, async () => {});
      expect(context.state.get("rateLimitRemaining")).toBe(4);

      await rateLimitMiddleware(context, async () => {});
      expect(context.state.get("rateLimitRemaining")).toBe(3);

      await rateLimitMiddleware(context, async () => {});
      expect(context.state.get("rateLimitRemaining")).toBe(2);
    });
  });

  describe("Error Handling", () => {
    it("should provide clear error message", async () => {
      const rateLimitMiddleware = createRateLimitMiddleware({
        maxRequests: 1,
        windowMs: 60000,
      });

      context.state.set("userId", "user-123");

      await rateLimitMiddleware(context, async () => {});

      await expect(
        rateLimitMiddleware(context, async () => {})
      ).rejects.toThrow(/Rate limit exceeded/);
    });

    it("should not call next() when rate limited", async () => {
      const rateLimitMiddleware = createRateLimitMiddleware({
        maxRequests: 1,
        windowMs: 60000,
      });

      context.state.set("userId", "user-123");

      await rateLimitMiddleware(context, async () => {});

      let nextCalled = false;
      await expect(
        rateLimitMiddleware(context, async () => {
          nextCalled = true;
        })
      ).rejects.toThrow();

      expect(nextCalled).toBe(false);
    });
  });

  describe("Integration with Middleware Chain", () => {
    it("should work with auth middleware", async () => {
      const rateLimitMiddleware = createRateLimitMiddleware({
        maxRequests: 2,
        windowMs: 60000,
      });

      // Simulate auth middleware setting userId
      context.state.set("userId", "authenticated-user");

      // Make 2 successful requests
      await rateLimitMiddleware(context, async () => {});
      await rateLimitMiddleware(context, async () => {});

      // 3rd should be rate limited
      await expect(
        rateLimitMiddleware(context, async () => {})
      ).rejects.toThrow("Rate limit exceeded");
    });

    it("should allow downstream middleware to read rate limit state", async () => {
      const rateLimitMiddleware = createRateLimitMiddleware({
        maxRequests: 5,
        windowMs: 60000,
      });

      context.state.set("userId", "user-123");

      await rateLimitMiddleware(context, async () => {
        // Downstream middleware can read remaining count
        const remaining = context.state.get("rateLimitRemaining");
        expect(remaining).toBe(4);
      });
    });
  });
});
