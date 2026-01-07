/**
 * Unit tests for TestClient
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestClient } from "../../../src/server";
import { ConnectionError, TimeoutError } from "../../../src/errors";

describe("createTestClient", () => {
  it("should create a client with default options", async () => {
    // This test requires a running server
    // For now, we'll test error cases
    await expect(
      createTestClient("http://localhost:99999/mcp")
    ).rejects.toThrow(ConnectionError);
  });

  it("should track history when enabled", async () => {
    // This test requires a running server
    // Will be implemented when we have a test server setup
  });

  it("should respect timeout option", async () => {
    // This test requires a running server
    // Will be implemented when we have a test server setup
  });

  it("should retry on failure when retries > 0", async () => {
    // This test requires a running server
    // Will be implemented when we have a test server setup
  });
});
