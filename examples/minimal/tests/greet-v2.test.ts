/**
 * Tests for v2 greet tool
 *
 * Tests the enhanced greet functionality with name and optional surname.
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

describe("Greet Tool V2", () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    // For versioned apps, start the main app and connect to version-specific endpoint
    // Use a fixed port for testing to avoid port detection issues
    const testPort = 3002;
    const server = await startTestServer(app as unknown, { port: testPort });
    
    // Wait a bit for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    // Connect to v2-specific endpoint
    const client = await createTestClient(`http://localhost:${testPort}/v2/mcp`, {
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
    it("should greet a user by name only", async () => {
      const result = await env.client.callTool("greet", { name: "Alice" });

      expectToolResult(result).toHaveNoError();
      expectToolResult(result).toMatchObject({
        message: expect.stringContaining("Alice"),
        fullName: "Alice",
        timestamp: expect.any(String),
      });
    });

    it("should greet a user with name and surname", async () => {
      const result = await env.client.callTool("greet", {
        name: "Alice",
        surname: "Smith",
      });

      expectToolResult(result).toHaveNoError();
      expectToolResult(result).toMatchObject({
        message: expect.stringContaining("Alice Smith"),
        fullName: "Alice Smith",
        timestamp: expect.any(String),
      });
    });

    it("should match output schema", async () => {
      const outputSchema = z.object({
        message: z.string(),
        fullName: z.string(),
        timestamp: z.string(),
      });

      const result = await env.client.callTool("greet", {
        name: "Bob",
        surname: "Jones",
      });

      expectToolResult(result).toHaveNoError();
      expectToolResult(result).toMatchSchema(outputSchema);
    });
  });

  describe("Test suite", () => {
    it("should run test suite for greet tool v2", async () => {
      const suite = defineTestSuite({
        name: "greet v2 suite",
        tool: "greet",
        cases: [
          {
            name: "greets with name only",
            input: { name: "Alice" },
            expected: {
              fullName: "Alice",
            },
          },
          {
            name: "greets with name and surname",
            input: { name: "Bob", surname: "Smith" },
            expected: {
              fullName: "Bob Smith",
            },
          },
          {
            name: "handles empty surname",
            input: { name: "Charlie", surname: "" },
            expected: {
              fullName: "Charlie",
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

  describe("Property-based testing", () => {
    it("should handle various name inputs", async () => {
      // This test uses property-based testing to verify the tool
      // handles various input combinations correctly
      const { generators, forAllInputs } = await import("@mcp-apps-kit/testing");

      await forAllInputs(
        generators.object({
          name: generators.string({ minLength: 1, maxLength: 50 }),
          surname: generators.optional(
            generators.string({ minLength: 0, maxLength: 50 })
          ),
        }),
        async (input) => {
          const result = await env.client.callTool("greet", input);
          
          // Property: result should always contain the name
          const data = JSON.parse(result.content[0]?.text ?? "{}");
          return data.message.includes(input.name);
        },
        { numRuns: 20 } // Run 20 tests instead of 100 for speed
      );
    }, 30000); // Increase timeout for property tests
  });
});
