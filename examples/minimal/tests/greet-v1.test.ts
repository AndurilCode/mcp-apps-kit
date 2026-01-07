/**
 * Tests for v1 greet tool
 *
 * Tests the basic greet functionality with name only.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  expectToolResult,
  defineTestSuite,
  runTestSuite,
  startTestServer,
  createTestClient,
} from "@mcp-apps-kit/testing";
import type { TestEnvironment } from "@mcp-apps-kit/testing";
import { z } from "zod";
import { app } from "../src/index.js";

describe("Greet Tool V1", () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    // For versioned apps, start the main app and connect to version-specific endpoint
    // Use a fixed port for testing to avoid port detection issues
    const testPort = 3001;
    const server = await startTestServer(app as unknown, { port: testPort });
    
    // Wait a bit for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    // Connect to v1-specific endpoint
    const client = await createTestClient(`http://localhost:${testPort}/v1/mcp`, {
      trackHistory: true,
    });

    env = {
      server,
      client,
      async cleanup() {
        await client.disconnect();
        await server.stop();
      },
    };
  });

  afterAll(async () => {
    await env.cleanup();
  });

  describe("Basic functionality", () => {
    it("should greet a user by name", async () => {
      const result = await env.client.callTool("greet", { name: "Alice" });

      expectToolResult(result).toHaveNoError();
      expectToolResult(result).toMatchObject({
        message: expect.stringContaining("Alice"),
        timestamp: expect.any(String),
      });
    });

    it("should include timestamp in response", async () => {
      const result = await env.client.callTool("greet", { name: "Bob" });

      expectToolResult(result).toHaveNoError();
      
      // Verify timestamp is valid ISO string
      const data = JSON.parse(result.content[0]?.text ?? "{}");
      expect(() => new Date(data.timestamp)).not.toThrow();
      expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp);
    });

    it("should match output schema", async () => {
      const outputSchema = z.object({
        message: z.string(),
        timestamp: z.string(),
      });

      const result = await env.client.callTool("greet", { name: "Charlie" });

      expectToolResult(result).toHaveNoError();
      expectToolResult(result).toMatchSchema(outputSchema);
    });
  });

  describe("Test suite", () => {
    it("should run test suite for greet tool", async () => {
      const suite = defineTestSuite({
        name: "greet v1 suite",
        tool: "greet",
        cases: [
          {
            name: "greets Alice",
            input: { name: "Alice" },
            expected: {
              message: expect.stringContaining("Alice"),
            },
          },
          {
            name: "greets Bob",
            input: { name: "Bob" },
            expected: {
              message: expect.stringContaining("Bob"),
            },
          },
          {
            name: "greets with special characters",
            input: { name: "José" },
            expected: {
              message: expect.stringContaining("José"),
            },
          },
        ],
      });

      const results = await runTestSuite(env.client, suite);

      expect(results.passed).toBe(3);
      expect(results.failed).toBe(0);
      expect(results.total).toBe(3);
    });
  });

  describe("Framework matchers", () => {
    it("should work with Vitest matchers", async () => {
      const result = await env.client.callTool("greet", { name: "David" });

      // Using framework matchers
      expect(result).toBeSuccessfulToolResult();
      expect(result).toContainToolText("David");
    });

    it("should match schema with framework matcher", async () => {
      const outputSchema = z.object({
        message: z.string(),
        timestamp: z.string(),
      });

      const result = await env.client.callTool("greet", { name: "Eve" });

      expect(result).toMatchToolSchema(outputSchema);
    });
  });
});
