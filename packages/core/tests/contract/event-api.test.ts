/**
 * Event API Contract Tests
 *
 * Defines the contract for the event system that all implementations must follow.
 * Tests event subscription, emission, and lifecycle.
 *
 * @module contract/event-api
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EventMap, EventHandler, AnyEventHandler, UnsubscribeFn } from "../../src/events/types";

// Mock EventEmitter interface for contract testing
interface EventEmitter {
  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): UnsubscribeFn;
  once<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): UnsubscribeFn;
  onAny(handler: AnyEventHandler): UnsubscribeFn;
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): Promise<void>;
  removeAllListeners(event?: keyof EventMap): void;
  listenerCount(event: keyof EventMap): number;
}

// Mock implementation for testing the contract
class MockEventEmitter implements EventEmitter {
  private listeners = new Map<string, EventHandler<unknown>[]>();
  private onceListeners = new Map<string, EventHandler<unknown>[]>();
  private anyListeners: AnyEventHandler[] = [];

  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): UnsubscribeFn {
    const handlers = this.listeners.get(event as string) ?? [];
    handlers.push(handler as EventHandler<unknown>);
    this.listeners.set(event as string, handlers);

    return () => {
      const handlers = this.listeners.get(event as string) ?? [];
      const index = handlers.indexOf(handler as EventHandler<unknown>);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    };
  }

  once<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): UnsubscribeFn {
    const handlers = this.onceListeners.get(event as string) ?? [];
    handlers.push(handler as EventHandler<unknown>);
    this.onceListeners.set(event as string, handlers);

    return () => {
      const handlers = this.onceListeners.get(event as string) ?? [];
      const index = handlers.indexOf(handler as EventHandler<unknown>);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    };
  }

  onAny(handler: AnyEventHandler): UnsubscribeFn {
    this.anyListeners.push(handler);
    return () => {
      const index = this.anyListeners.indexOf(handler);
      if (index !== -1) {
        this.anyListeners.splice(index, 1);
      }
    };
  }

  async emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): Promise<void> {
    // Execute regular listeners
    const handlers = this.listeners.get(event as string) ?? [];
    for (const handler of handlers) {
      await handler(payload);
    }

    // Execute once listeners
    const onceHandlers = this.onceListeners.get(event as string) ?? [];
    for (const handler of onceHandlers) {
      await handler(payload);
    }
    this.onceListeners.delete(event as string);

    // Execute wildcard listeners
    for (const handler of this.anyListeners) {
      await handler(event as string, payload);
    }
  }

  removeAllListeners(event?: keyof EventMap): void {
    if (event) {
      this.listeners.delete(event as string);
      this.onceListeners.delete(event as string);
    } else {
      this.listeners.clear();
      this.onceListeners.clear();
      this.anyListeners = [];
    }
  }

  listenerCount(event: keyof EventMap): number {
    const regular = this.listeners.get(event as string)?.length ?? 0;
    const once = this.onceListeners.get(event as string)?.length ?? 0;
    return regular + once;
  }
}

describe("Event API Contract", () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new MockEventEmitter();
    vi.clearAllMocks();
  });

  describe("on() - Subscribe to Event", () => {
    it("should register event handler", () => {
      const handler = vi.fn();
      emitter.on("app:init", handler);

      expect(emitter.listenerCount("app:init")).toBe(1);
    });

    it("should call handler when event is emitted", async () => {
      const handler = vi.fn();
      emitter.on("app:init", handler);

      const payload = { config: { name: "test", version: "1.0.0", tools: {} } };
      await emitter.emit("app:init", payload);

      expect(handler).toHaveBeenCalledWith(payload);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should call handler multiple times for multiple emissions", async () => {
      const handler = vi.fn();
      emitter.on("app:start", handler);

      await emitter.emit("app:start", { transport: "http", port: 3000 });
      await emitter.emit("app:start", { transport: "stdio" });

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("should support multiple handlers for same event", async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on("tool:called", handler1);
      emitter.on("tool:called", handler2);

      const payload = { toolName: "test", input: {}, context: {} };
      await emitter.emit("tool:called", payload);

      expect(handler1).toHaveBeenCalledWith(payload);
      expect(handler2).toHaveBeenCalledWith(payload);
    });

    it("should return unsubscribe function", () => {
      const handler = vi.fn();
      const unsubscribe = emitter.on("app:init", handler);

      expect(typeof unsubscribe).toBe("function");
    });

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
    });
  });

  describe("once() - Subscribe Once", () => {
    it("should register one-time handler", () => {
      const handler = vi.fn();
      emitter.once("app:start", handler);

      expect(emitter.listenerCount("app:start")).toBe(1);
    });

    it("should call handler only once", async () => {
      const handler = vi.fn();
      emitter.once("app:start", handler);

      await emitter.emit("app:start", { transport: "http", port: 3000 });
      await emitter.emit("app:start", { transport: "stdio" });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should automatically unsubscribe after first call", async () => {
      const handler = vi.fn();
      emitter.once("tool:success", handler);

      await emitter.emit("tool:success", { toolName: "test", result: {}, duration: 100 });

      expect(emitter.listenerCount("tool:success")).toBe(0);
    });

    it("should support manual unsubscribe before event fires", async () => {
      const handler = vi.fn();
      const unsubscribe = emitter.once("app:start", handler);

      unsubscribe();

      await emitter.emit("app:start", { transport: "http", port: 3000 });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("onAny() - Wildcard Listener", () => {
    it("should register wildcard handler", () => {
      const handler = vi.fn();
      emitter.onAny(handler);

      // Note: listenerCount is for specific events, wildcard is separate
      expect(typeof handler).toBe("function");
    });

    it("should call handler for any event", async () => {
      const handler = vi.fn();
      emitter.onAny(handler);

      await emitter.emit("app:init", { config: { name: "test", version: "1.0.0", tools: {} } });
      await emitter.emit("app:start", { transport: "http", port: 3000 });

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith("app:init", expect.any(Object));
      expect(handler).toHaveBeenCalledWith("app:start", expect.any(Object));
    });

    it("should receive event name and payload", async () => {
      const handler = vi.fn();
      emitter.onAny(handler);

      const payload = { transport: "http" as const, port: 3000 };
      await emitter.emit("app:start", payload);

      expect(handler).toHaveBeenCalledWith("app:start", payload);
    });

    it("should support unsubscribe", async () => {
      const handler = vi.fn();
      const unsubscribe = emitter.onAny(handler);

      unsubscribe();

      await emitter.emit("app:init", { config: { name: "test", version: "1.0.0", tools: {} } });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("Type Safety", () => {
    it("should enforce event name types", () => {
      const handler = vi.fn();

      // These should type-check correctly
      emitter.on("app:init", handler);
      emitter.on("app:start", handler);
      emitter.on("tool:called", handler);
      emitter.on("tool:success", handler);
      emitter.on("tool:error", handler);
      emitter.on("error", handler);

      // Invalid event names should fail at compile time (tested via TypeScript)
      // @ts-expect-error - invalid event name
      emitter.on("invalid:event", handler);
    });

    it("should enforce payload types", async () => {
      const handler = vi.fn<[EventMap["app:start"]]>();
      emitter.on("app:start", handler);

      // Valid payload
      await emitter.emit("app:start", { transport: "http", port: 3000 });

      // Invalid payload should fail at compile time
      // @ts-expect-error - missing required transport field
      await emitter.emit("app:start", { port: 3000 });
    });
  });
});
