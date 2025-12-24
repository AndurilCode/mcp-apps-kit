/**
 * TypedEventEmitter Unit Tests
 *
 * Tests the TypedEventEmitter implementation with:
 * - Event subscription and emission
 * - Error isolation (handler errors don't affect other handlers)
 * - Max listeners enforcement
 * - Memory leak prevention
 * - Stats and debugging
 *
 * @module unit/events/EventEmitter
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TypedEventEmitter } from "../../../src/events/EventEmitter";
import type { EventMap } from "../../../src/events/types";
import { MaxListenersExceededError } from "../../../src/events/types";

describe("TypedEventEmitter", () => {
  let emitter: TypedEventEmitter<EventMap>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    emitter = new TypedEventEmitter();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe("Event Subscription", () => {
    it("should register event handler with on()", () => {
      const handler = vi.fn();
      emitter.on("app:init", handler);

      expect(emitter.listenerCount("app:init")).toBe(1);
    });

    it("should register one-time handler with once()", () => {
      const handler = vi.fn();
      emitter.once("app:start", handler);

      expect(emitter.listenerCount("app:start")).toBe(1);
    });

    it("should register wildcard handler with onAny()", () => {
      const handler = vi.fn();
      emitter.onAny(handler);

      // onAny doesn't count toward event-specific listeners
      expect(emitter.listenerCount("app:init")).toBe(0);
    });

    it("should support multiple handlers for same event", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      emitter.on("tool:called", handler1);
      emitter.on("tool:called", handler2);
      emitter.on("tool:called", handler3);

      expect(emitter.listenerCount("tool:called")).toBe(3);
    });
  });

  describe("Event Emission", () => {
    it("should call handler when event is emitted", async () => {
      const handler = vi.fn();
      emitter.on("app:init", handler);

      const payload = { config: { name: "test", version: "1.0.0", tools: {} } };
      await emitter.emit("app:init", payload);

      expect(handler).toHaveBeenCalledWith(payload);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should call all handlers in registration order", async () => {
      const executionOrder: number[] = [];

      emitter.on("app:start", async () => {
        executionOrder.push(1);
      });
      emitter.on("app:start", async () => {
        executionOrder.push(2);
      });
      emitter.on("app:start", async () => {
        executionOrder.push(3);
      });

      await emitter.emit("app:start", { transport: "http", port: 3000 });

      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it("should call handler multiple times for multiple emissions", async () => {
      const handler = vi.fn();
      emitter.on("tool:success", handler);

      await emitter.emit("tool:success", { toolName: "test1", result: {}, duration: 100 });
      await emitter.emit("tool:success", { toolName: "test2", result: {}, duration: 200 });
      await emitter.emit("tool:success", { toolName: "test3", result: {}, duration: 150 });

      expect(handler).toHaveBeenCalledTimes(3);
    });

    it("should support async handlers", async () => {
      const handler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      emitter.on("app:init", handler);
      await emitter.emit("app:init", { config: { name: "test", version: "1.0.0", tools: {} } });

      expect(handler).toHaveBeenCalled();
    });
  });

  describe("once() Behavior", () => {
    it("should call handler only once", async () => {
      const handler = vi.fn();
      emitter.once("app:start", handler);

      await emitter.emit("app:start", { transport: "http", port: 3000 });
      await emitter.emit("app:start", { transport: "stdio" });
      await emitter.emit("app:start", { transport: "http", port: 4000 });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should auto-unsubscribe after first call", async () => {
      const handler = vi.fn();
      emitter.once("tool:error", handler);

      expect(emitter.listenerCount("tool:error")).toBe(1);

      await emitter.emit("tool:error", { toolName: "test", error: new Error("test"), duration: 50 });

      expect(emitter.listenerCount("tool:error")).toBe(0);
    });

    it("should support manual unsubscribe before event fires", async () => {
      const handler = vi.fn();
      const unsubscribe = emitter.once("app:start", handler);

      expect(emitter.listenerCount("app:start")).toBe(1);

      unsubscribe();

      expect(emitter.listenerCount("app:start")).toBe(0);

      await emitter.emit("app:start", { transport: "http", port: 3000 });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("onAny() Wildcard Listener", () => {
    it("should call handler for any event", async () => {
      const handler = vi.fn();
      emitter.onAny(handler);

      await emitter.emit("app:init", { config: { name: "test", version: "1.0.0", tools: {} } });
      await emitter.emit("app:start", { transport: "http", port: 3000 });
      await emitter.emit("tool:called", { toolName: "test", input: {}, context: {} });

      expect(handler).toHaveBeenCalledTimes(3);
    });

    it("should receive event name and payload", async () => {
      const handler = vi.fn();
      emitter.onAny(handler);

      const payload = { transport: "http" as const, port: 3000 };
      await emitter.emit("app:start", payload);

      expect(handler).toHaveBeenCalledWith("app:start", payload);
    });

    it("should work alongside specific event listeners", async () => {
      const specificHandler = vi.fn();
      const wildcardHandler = vi.fn();

      emitter.on("app:init", specificHandler);
      emitter.onAny(wildcardHandler);

      const payload = { config: { name: "test", version: "1.0.0", tools: {} } };
      await emitter.emit("app:init", payload);

      expect(specificHandler).toHaveBeenCalledWith(payload);
      expect(wildcardHandler).toHaveBeenCalledWith("app:init", payload);
    });
  });

  describe("Unsubscribe", () => {
    it("should remove handler when unsubscribe is called", async () => {
      const handler = vi.fn();
      const unsubscribe = emitter.on("app:init", handler);

      unsubscribe();

      await emitter.emit("app:init", { config: { name: "test", version: "1.0.0", tools: {} } });
      expect(handler).not.toHaveBeenCalled();
    });

    it("should be safe to call unsubscribe multiple times", () => {
      const handler = vi.fn();
      const unsubscribe = emitter.on("app:init", handler);

      expect(() => {
        unsubscribe();
        unsubscribe();
        unsubscribe();
      }).not.toThrow();

      expect(emitter.listenerCount("app:init")).toBe(0);
    });

    it("should only remove the specific handler", async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsubscribe1 = emitter.on("tool:success", handler1);
      emitter.on("tool:success", handler2);

      unsubscribe1();

      await emitter.emit("tool:success", { toolName: "test", result: {}, duration: 100 });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe("Error Isolation", () => {
    it("should catch and log handler errors", async () => {
      const error = new Error("Handler error");
      const badHandler = vi.fn(() => {
        throw error;
      });

      emitter.on("app:init", badHandler);

      await emitter.emit("app:init", { config: { name: "test", version: "1.0.0", tools: {} } });

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("should continue executing other handlers when one fails", async () => {
      const handler1 = vi.fn(() => {
        throw new Error("Handler 1 error");
      });
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      emitter.on("tool:called", handler1);
      emitter.on("tool:called", handler2);
      emitter.on("tool:called", handler3);

      await emitter.emit("tool:called", { toolName: "test", input: {}, context: {} });

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();
    });

    it("should handle async handler errors", async () => {
      const asyncBadHandler = vi.fn(async () => {
        throw new Error("Async handler error");
      });

      emitter.on("app:start", asyncBadHandler);

      await emitter.emit("app:start", { transport: "http", port: 3000 });

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("should not throw when handler throws", async () => {
      emitter.on("error", () => {
        throw new Error("Handler error");
      });

      await expect(
        emitter.emit("error", { error: new Error("test"), source: "test" })
      ).resolves.not.toThrow();
    });
  });

  describe("Max Listeners", () => {
    it("should enforce max listeners limit", () => {
      const smallEmitter = new TypedEventEmitter<EventMap>({ maxListeners: 3 });

      smallEmitter.on("app:init", vi.fn());
      smallEmitter.on("app:init", vi.fn());
      smallEmitter.on("app:init", vi.fn());

      expect(() => {
        smallEmitter.on("app:init", vi.fn());
      }).toThrow(MaxListenersExceededError);
    });

    it("should include helpful error message", () => {
      const smallEmitter = new TypedEventEmitter<EventMap>({ maxListeners: 2 });

      smallEmitter.on("tool:success", vi.fn());
      smallEmitter.on("tool:success", vi.fn());

      try {
        smallEmitter.on("tool:success", vi.fn());
        expect.fail("Should have thrown MaxListenersExceededError");
      } catch (error) {
        expect(error).toBeInstanceOf(MaxListenersExceededError);
        expect((error as Error).message).toContain("tool:success");
        expect((error as Error).message).toContain("2");
      }
    });

    it("should allow unlimited listeners when maxListeners is 0", () => {
      const unlimitedEmitter = new TypedEventEmitter<EventMap>({ maxListeners: 0 });

      for (let i = 0; i < 1000; i++) {
        unlimitedEmitter.on("app:init", vi.fn());
      }

      expect(unlimitedEmitter.listenerCount("app:init")).toBe(1000);
    });

    it("should count once() listeners toward max", () => {
      const smallEmitter = new TypedEventEmitter<EventMap>({ maxListeners: 2 });

      smallEmitter.on("app:start", vi.fn());
      smallEmitter.once("app:start", vi.fn());

      expect(() => {
        smallEmitter.on("app:start", vi.fn());
      }).toThrow(MaxListenersExceededError);
    });
  });

  describe("removeAllListeners()", () => {
    it("should remove all listeners for specific event", async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on("app:init", handler1);
      emitter.on("app:init", handler2);

      expect(emitter.listenerCount("app:init")).toBe(2);

      emitter.removeAllListeners("app:init");

      expect(emitter.listenerCount("app:init")).toBe(0);

      await emitter.emit("app:init", { config: { name: "test", version: "1.0.0", tools: {} } });
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it("should remove all listeners for all events when no event specified", () => {
      emitter.on("app:init", vi.fn());
      emitter.on("app:start", vi.fn());
      emitter.on("tool:called", vi.fn());

      emitter.removeAllListeners();

      expect(emitter.listenerCount("app:init")).toBe(0);
      expect(emitter.listenerCount("app:start")).toBe(0);
      expect(emitter.listenerCount("tool:called")).toBe(0);
    });

    it("should not affect other events", async () => {
      const initHandler = vi.fn();
      const startHandler = vi.fn();

      emitter.on("app:init", initHandler);
      emitter.on("app:start", startHandler);

      emitter.removeAllListeners("app:init");

      await emitter.emit("app:start", { transport: "http", port: 3000 });

      expect(initHandler).not.toHaveBeenCalled();
      expect(startHandler).toHaveBeenCalled();
    });
  });

  describe("getStats()", () => {
    it("should return emitter statistics", () => {
      emitter.on("app:init", vi.fn());
      emitter.on("app:init", vi.fn());
      emitter.on("app:start", vi.fn());
      emitter.onAny(vi.fn());

      const stats = emitter.getStats();

      expect(stats.totalListeners).toBe(3); // Doesn't count wildcard
      expect(stats.listenersByEvent["app:init"]).toBe(2);
      expect(stats.listenersByEvent["app:start"]).toBe(1);
      expect(stats.wildcardListeners).toBe(1);
    });

    it("should list active listeners", () => {
      emitter.on("app:init", vi.fn());
      emitter.once("app:start", vi.fn());

      const stats = emitter.getStats();

      expect(stats.listeners).toHaveLength(2);
      expect(stats.listeners.some(l => l.event === "app:init" && !l.once)).toBe(true);
      expect(stats.listeners.some(l => l.event === "app:start" && l.once)).toBe(true);
    });
  });

  describe("Options", () => {
    it("should respect logErrors option", async () => {
      const silentEmitter = new TypedEventEmitter<EventMap>({ logErrors: false });

      silentEmitter.on("error", () => {
        throw new Error("test");
      });

      await silentEmitter.emit("error", { error: new Error("test"), source: "test" });

      // Should not log when logErrors is false
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("should default to logging errors", async () => {
      emitter.on("app:init", () => {
        throw new Error("test");
      });

      await emitter.emit("app:init", { config: { name: "test", version: "1.0.0", tools: {} } });

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});
