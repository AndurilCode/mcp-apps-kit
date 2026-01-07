/**
 * Contract tests for server utilities
 *
 * These tests verify the public API contract and behavior
 * of the server utilities.
 */

import { describe, it, expect } from "vitest";
import { createTestClient, startTestServer } from "../../../src/server";

describe("Server Utilities Contract", () => {
  it("should export createTestClient", () => {
    expect(typeof createTestClient).toBe("function");
  });

  it("should export startTestServer", () => {
    expect(typeof startTestServer).toBe("function");
  });

  it("createTestClient should return a TestClient", async () => {
    // This test requires a running server
    // Will be implemented with integration tests
  });

  it("startTestServer should return a TestServer", async () => {
    // This test requires @mcp-apps-kit/core or external server
    // Will be implemented with integration tests
  });
});
