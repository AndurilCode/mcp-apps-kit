/**
 * Tests for v2 greet tool (name + optional surname)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  expectToolResult,
  startTestServer,
  createTestClient,
} from "@mcp-apps-kit/testing";
import type { TestEnvironment } from "@mcp-apps-kit/testing";
import { z } from "zod";
import { app } from "../src/index.js";

describe("Greet Tool V2", () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    const testPort = 3002;
    const server = await startTestServer(app as unknown, { port: testPort });
    await new Promise((resolve) => setTimeout(resolve, 100));
    
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
      
      const data = JSON.parse(result.content[0]?.text ?? "{}");
      expect(data.message).toContain("Alice");
      expect(data.fullName).toBe("Alice");
    });

    it("should greet a user with name and surname", async () => {
      const result = await env.client.callTool("greet", {
        name: "Alice",
        surname: "Smith",
      });

      expectToolResult(result).toHaveNoError();
      
      const data = JSON.parse(result.content[0]?.text ?? "{}");
      expect(data.message).toContain("Alice Smith");
      expect(data.fullName).toBe("Alice Smith");
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
      // Test case: name only
      const result1 = await env.client.callTool("greet", { name: "Alice" });
      expectToolResult(result1).toHaveNoError();
      const data1 = JSON.parse(result1.content[0]?.text ?? "{}");
      expect(data1.fullName).toBe("Alice");

      // Test case: name and surname
      const result2 = await env.client.callTool("greet", { name: "Bob", surname: "Smith" });
      expectToolResult(result2).toHaveNoError();
      const data2 = JSON.parse(result2.content[0]?.text ?? "{}");
      expect(data2.fullName).toBe("Bob Smith");
    });
  });
});
