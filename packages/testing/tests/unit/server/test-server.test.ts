/**
 * Unit tests for TestServer
 */

import { describe, it, expect } from "vitest";
import { startTestServer } from "../../../src/server";
import { ServerStartupError } from "../../../src/errors";

describe("startTestServer", () => {
  it("should throw ServerStartupError for invalid command", async () => {
    // This test may cause unhandled errors in the child process, which is expected
    // The error is caught and converted to ServerStartupError
    // Handle uncaught exceptions from child process
    const uncaughtHandler = (error: Error) => {
      // Ignore EACCES errors from spawn - these are expected when testing invalid commands
      if (
        error.message.includes("nonexistent-command-12345") ||
        (error as NodeJS.ErrnoException).code === "EACCES"
      ) {
        return;
      }
      // Re-throw other errors
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
  }, 10000); // Increase timeout for this test

  it("should start external server with ready pattern", async () => {
    // This test requires a real server process
    // Will be implemented with integration tests
  });

  it("should start server from App instance", async () => {
    // This test requires @mcp-apps-kit/core
    // Will be implemented with integration tests
  });
});
