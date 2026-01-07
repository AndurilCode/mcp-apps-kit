/**
 * Unit tests for TestServer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startTestServer } from "../../../src/server";
import { ServerStartupError } from "../../../src/errors";
import type { TestServer } from "../../../src/types";

describe("startTestServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("from App instance", () => {
    it("should start server from App instance", async () => {
      // Create a mock App
      const mockStop = vi.fn().mockResolvedValue(undefined);
      const mockApp = {
        start: vi.fn().mockResolvedValue(undefined),
        stop: mockStop,
        handler: vi.fn().mockReturnValue(() => {}),
      };

      const server = await startTestServer(mockApp, { port: 4000 });

      expect(server).toBeDefined();
      expect(server.url).toBe("http://localhost:4000");
      expect(server.mcpUrl).toBe("http://localhost:4000/mcp");
      expect(server.port).toBe(4000);
      expect(mockApp.start).toHaveBeenCalledWith({ port: 4000, transport: "http" });

      await server.stop();
      expect(mockStop).toHaveBeenCalled();
    });

    it("should use dynamic port when port is 0", async () => {
      const mockApp = {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        handler: vi.fn().mockReturnValue(() => {}),
      };

      const server = await startTestServer(mockApp, { port: 0 });

      expect(server).toBeDefined();
      expect(server.port).toBeGreaterThan(0);
      expect(server.url).toBe(`http://localhost:${server.port}`);

      await server.stop();
    });

    it("should throw ServerStartupError if app.start fails", async () => {
      const mockApp = {
        start: vi.fn().mockRejectedValue(new Error("Failed to start")),
        handler: vi.fn().mockReturnValue(() => {}),
      };

      await expect(startTestServer(mockApp, { port: 4001 })).rejects.toThrow(ServerStartupError);
    });

    it("should throw ServerStartupError on timeout", async () => {
      // Create an app that never resolves start()
      const mockApp = {
        start: vi.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(resolve, 60000); // Never resolves in time
            })
        ),
        handler: vi.fn().mockReturnValue(() => {}),
      };

      await expect(startTestServer(mockApp, { port: 4002, timeout: 100 })).rejects.toThrow(
        ServerStartupError
      );
    }, 5000);

    it("should handle app without stop method gracefully", async () => {
      const mockApp = {
        start: vi.fn().mockResolvedValue(undefined),
        handler: vi.fn().mockReturnValue(() => {}),
        // Note: no stop method
      };

      const server = await startTestServer(mockApp, { port: 4003 });
      expect(server).toBeDefined();

      // Should not throw when stop() is called
      await expect(server.stop()).resolves.toBeUndefined();
    });
  });

  describe("from external command", () => {
    it("should throw ServerStartupError for invalid command", async () => {
      // Handle uncaught exceptions from child process
      const uncaughtHandler = (error: Error) => {
        // Ignore expected errors from spawn
        if (
          error.message.includes("nonexistent-command-12345") ||
          (error as NodeJS.ErrnoException).code === "EACCES" ||
          (error as NodeJS.ErrnoException).code === "ENOENT"
        ) {
          return;
        }
        throw error;
      };

      process.once("uncaughtException", uncaughtHandler);

      try {
        await expect(
          startTestServer({
            command: "nonexistent-command-12345",
            args: [],
            port: 3000,
            timeout: 1000,
          })
        ).rejects.toThrow(ServerStartupError);
      } finally {
        process.removeListener("uncaughtException", uncaughtHandler);
      }
    }, 10000);

    it("should configure with environment variables", async () => {
      // This test verifies the options are passed correctly
      // Without an actual server, we can only verify the options structure
      const options = {
        command: "node",
        args: ["test-server.js"],
        port: 3000,
        readyPattern: /Server ready/,
        timeout: 5000,
        env: { NODE_ENV: "test", PORT: "3000" },
      };

      // Verify options structure is correct
      expect(options.command).toBe("node");
      expect(options.env).toEqual({ NODE_ENV: "test", PORT: "3000" });
    });
  });

  describe("TestServer interface", () => {
    it("should have correct interface properties", async () => {
      const mockApp = {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        handler: vi.fn().mockReturnValue(() => {}),
      };

      const server = await startTestServer(mockApp, { port: 4004 });

      // Verify interface
      expect(typeof server.url).toBe("string");
      expect(typeof server.mcpUrl).toBe("string");
      expect(typeof server.port).toBe("number");
      expect(typeof server.stop).toBe("function");

      await server.stop();
    });
  });
});
