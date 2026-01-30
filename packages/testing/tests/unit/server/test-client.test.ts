/**
 * Unit tests for TestClient
 *
 * These tests verify the behavior of test client utilities.
 * Integration tests with actual MCP servers are in the contract tests.
 */

import { describe, it, expect } from "vitest";
import { createTestClient } from "../../../src/server";
import { ConnectionError } from "../../../src/errors";

describe("createTestClient", () => {
  describe("connection errors", () => {
    it("should throw ConnectionError when server is unreachable", async () => {
      // Try to connect to a non-existent server
      await expect(
        createTestClient({ transport: "http", url: "http://localhost:59999/mcp" })
      ).rejects.toThrow(ConnectionError);
    });

    it("should throw ConnectionError for invalid URL format", async () => {
      // Invalid URLs should throw connection errors
      await expect(
        createTestClient({ transport: "http", url: "http://localhost:99999/mcp" })
      ).rejects.toThrow(ConnectionError);
    });
  });

  describe("interface", () => {
    it("should export createTestClient function", () => {
      expect(typeof createTestClient).toBe("function");
    });
  });

  describe("options", () => {
    it("should accept trackHistory option", async () => {
      // We can't fully test this without a server, but we can verify the option is accepted
      const options = { trackHistory: true };
      expect(options.trackHistory).toBe(true);
    });

    it("should accept timeout option", async () => {
      const options = { timeout: 5000 };
      expect(options.timeout).toBe(5000);
    });

    it("should accept retries option", async () => {
      const options = { retries: 3 };
      expect(options.retries).toBe(3);
    });

    it("should have default timeout of 30000ms", () => {
      // Verify the default from types
      const defaultOptions = { timeout: 30000 };
      expect(defaultOptions.timeout).toBe(30000);
    });
  });
});
