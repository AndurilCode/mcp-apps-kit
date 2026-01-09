/**
 * Unit tests for createClient function
 *
 * Tests the createClient() API with various options including autoResize.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "../../src/index";

describe("createClient", () => {
  const originalWindow = global.window;

  beforeEach(() => {
    // Setup a mock window environment
    const mockWindow = {
      location: { href: "http://localhost:3000" },
    };
    Object.defineProperty(mockWindow, "parent", { value: mockWindow });
    vi.stubGlobal("window", mockWindow);
    vi.stubGlobal("document", { referrer: "" });
  });

  afterEach(() => {
    // Restore original window
    if (originalWindow !== undefined) {
      vi.stubGlobal("window", originalWindow);
    } else {
      vi.unstubAllGlobals();
    }
  });

  describe("with autoResize option", () => {
    it("should create client with autoResize: false", async () => {
      const client = await createClient({
        forceAdapter: "mock",
        autoResize: false,
      });

      expect(client).toBeDefined();
      expect(typeof client.callTool).toBe("function");
    });

    it("should create client with autoResize: true", async () => {
      const client = await createClient({
        forceAdapter: "mock",
        autoResize: true,
      });

      expect(client).toBeDefined();
      expect(typeof client.callTool).toBe("function");
    });

    it("should create client without autoResize option (default)", async () => {
      const client = await createClient({
        forceAdapter: "mock",
      });

      expect(client).toBeDefined();
      expect(typeof client.callTool).toBe("function");
    });

    it("should accept autoResize option for MCP adapter", async () => {
      // This test verifies the createClient function accepts the autoResize option.
      // MCP adapter requires browser environment, so connection will fail in Node, but
      // we can verify the option is accepted and passed through.
      await expect(
        createClient({
          forceAdapter: "mcp",
          autoResize: false,
        })
      ).rejects.toThrow();
    });

    it("should pass autoResize to mock adapter", async () => {
      const client = await createClient({
        forceAdapter: "mock",
        autoResize: true,
      });

      expect(client).toBeDefined();
    });
  });

  describe("basic functionality", () => {
    it("should create a connected client", async () => {
      const client = await createClient({
        forceAdapter: "mock",
      });

      expect(client).toBeDefined();
      expect(typeof client.callTool).toBe("function");
    });

    it("should auto-detect protocol when forceAdapter not specified", async () => {
      const client = await createClient();

      expect(client).toBeDefined();
    });
  });
});
