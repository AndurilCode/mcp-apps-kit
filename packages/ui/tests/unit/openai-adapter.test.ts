/**
 * Unit tests for OpenAI/ChatGPT adapter
 *
 * Tests the OpenAIAdapter implementation for ChatGPT Apps.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAIAdapter } from "../../src/adapters/openai";

describe("OpenAIAdapter", () => {
  let adapter: OpenAIAdapter;

  beforeEach(() => {
    adapter = new OpenAIAdapter();
  });

  describe("connection", () => {
    it("should be constructable", () => {
      expect(adapter).toBeInstanceOf(OpenAIAdapter);
    });

    it("should not be connected before connect() is called", () => {
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe("state management", () => {
    it("should store and retrieve state", async () => {
      await adapter.connect();
      const state = { count: 42 };

      adapter.setState(state);
      expect(adapter.getState()).toEqual(state);
    });

    it("should return null when no state is set", async () => {
      await adapter.connect();
      expect(adapter.getState()).toBeNull();
    });
  });

  describe("host context", () => {
    it("should provide default host context", async () => {
      await adapter.connect();
      const context = adapter.getHostContext();

      expect(context).toMatchObject({
        theme: expect.stringMatching(/^(light|dark)$/),
        displayMode: expect.any(String),
        platform: expect.any(String),
      });
    });
  });

  describe("event subscriptions", () => {
    it("should return unsubscribe function for onToolResult", async () => {
      await adapter.connect();
      const handler = vi.fn();
      const unsubscribe = adapter.onToolResult(handler);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should return unsubscribe function for onHostContextChange", async () => {
      await adapter.connect();
      const handler = vi.fn();
      const unsubscribe = adapter.onHostContextChange(handler);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should return unsubscribe function for onToolInput", async () => {
      await adapter.connect();
      const handler = vi.fn();
      const unsubscribe = adapter.onToolInput(handler);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should return unsubscribe function for onToolCancelled", async () => {
      await adapter.connect();
      const handler = vi.fn();
      const unsubscribe = adapter.onToolCancelled(handler);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should return unsubscribe function for onTeardown", async () => {
      await adapter.connect();
      const handler = vi.fn();
      const unsubscribe = adapter.onTeardown(handler);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });
  });

  describe("logging", () => {
    it("should log to console", async () => {
      await adapter.connect();
      const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});

      adapter.log("info", { message: "test" });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("file operations", () => {
    it("should have uploadFile method defined", async () => {
      await adapter.connect();
      expect(typeof adapter.uploadFile).toBe("function");
    });

    it("should have getFileDownloadUrl method defined", async () => {
      await adapter.connect();
      expect(typeof adapter.getFileDownloadUrl).toBe("function");
    });
  });
});
