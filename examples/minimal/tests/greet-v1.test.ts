/**
 * Tests for v1 greet tool
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { expectToolResult, startTestServer, createTestClient } from "@mcp-apps-kit/testing";
import type { TestEnvironment } from "@mcp-apps-kit/testing";
import { z } from "zod";
import { app } from "../src/index.js";

describe("Greet Tool V1", () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    const testPort = 3001;
    const server = await startTestServer(app, { port: testPort });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const client = await createTestClient(
      { transport: "http", url: `http://localhost:${testPort}/v1/mcp` },
      {
        trackHistory: true,
      }
    );

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
      expectToolResult(result).toContainText("Alice");

      // Use structuredContent for typed data assertions
      const data = result.structuredContent as { message: string; timestamp: string };
      expect(data.message).toContain("Alice");
      expect(data.timestamp).toBeDefined();
    });

    it("should include timestamp in response", async () => {
      const result = await env.client.callTool("greet", { name: "Bob" });

      expectToolResult(result).toHaveNoError();

      // Use structuredContent for typed data assertions
      const data = result.structuredContent as { message: string; timestamp: string };
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
      // Run individual test cases to verify the tool works
      const names = ["Alice", "Bob", "José"];
      for (const name of names) {
        const result = await env.client.callTool("greet", { name });
        expectToolResult(result).toHaveNoError();
        expectToolResult(result).toContainText(name);
      }
    });
  });

  describe("Framework matchers", () => {
    it("should work with Vitest matchers", async () => {
      const result = await env.client.callTool("greet", { name: "David" });

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
