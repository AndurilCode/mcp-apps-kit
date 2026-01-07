/**
 * Unit tests for TestServer
 */

import { describe, it, expect } from "vitest";
import { startTestServer } from "../../../src/server/test-server";
import { ServerStartupError } from "../../../src/errors";

describe("startTestServer", () => {
  it("should throw ServerStartupError for invalid command", async () => {
    await expect(
      startTestServer({
        command: "nonexistent-command-12345",
        args: [],
        port: 3000,
        timeout: 1000,
      })
    ).rejects.toThrow(ServerStartupError);
  });

  it("should start external server with ready pattern", async () => {
    // This test requires a real server process
    // Will be implemented with integration tests
  });

  it("should start server from App instance", async () => {
    // This test requires @mcp-apps-kit/core
    // Will be implemented with integration tests
  });
});
