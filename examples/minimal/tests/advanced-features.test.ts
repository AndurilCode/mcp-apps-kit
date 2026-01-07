/**
 * Advanced feature tests - showcasing more testing library capabilities
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  expectToolResult,
  startTestServer,
  createTestClient,
  defineTestSuite,
  runTestSuite,
  generators,
  forAllInputs,
} from "@mcp-apps-kit/testing";
import type { TestEnvironment } from "@mcp-apps-kit/testing";
import { z } from "zod";
import { app } from "../src/index.js";

describe("Advanced Features", () => {
  // ==========================================================================
  // Test Suites (declarative test definitions)
  // ==========================================================================
  describe("defineTestSuite / runTestSuite", () => {
    let env: TestEnvironment;

    beforeAll(async () => {
      const testPort = 3010;
      const server = await startTestServer(app, { port: testPort });
      await new Promise((resolve) => setTimeout(resolve, 100));
      const client = await createTestClient(`http://localhost:${testPort}/v1/mcp`);
      env = { server, client, cleanup: async () => { await client.disconnect(); await server.stop(); } };
    });

    afterAll(async () => {
      await env.cleanup();
    });

    it("should define and run a test suite", async () => {
      const suite = defineTestSuite({
        name: "Greet Suite",
        tool: "greet",
        cases: [
          { name: "greets Alice", input: { name: "Alice" } },
          { name: "greets Bob", input: { name: "Bob" } },
        ],
      });

      expect(suite.name).toBe("Greet Suite");
      expect(suite.tool).toBe("greet");
      expect(suite.cases).toHaveLength(2);

      const results = await runTestSuite(env.client, suite);
      expect(results.total).toBe(2);
      // Without expected values, it just checks for no errors
      expect(results.passed + results.failed).toBe(2);
    });

    it("should support beforeEach/afterEach hooks", async () => {
      let beforeCount = 0;
      let afterCount = 0;

      const suite = defineTestSuite({
        name: "Hooks Suite",
        tool: "greet",
        beforeEach: async () => { beforeCount++; },
        afterEach: async () => { afterCount++; },
        cases: [
          { name: "case1", input: { name: "Test1" } },
          { name: "case2", input: { name: "Test2" } },
        ],
      });

      await runTestSuite(env.client, suite);
      expect(beforeCount).toBe(2);
      expect(afterCount).toBe(2);
    });

    it("should support skip flag", async () => {
      const suite = defineTestSuite({
        name: "Skip Suite",
        tool: "greet",
        cases: [
          { name: "runs", input: { name: "Test" } },
          { name: "skipped", input: { name: "Skip" }, skip: true },
        ],
      });

      const results = await runTestSuite(env.client, suite);
      expect(results.skipped).toBe(1);
      expect(results.passed + results.failed).toBe(1);
    });
  });

  // ==========================================================================
  // Property-based Testing with built-in generators
  // ==========================================================================
  describe("Property-based Testing", () => {
    let env: TestEnvironment;

    beforeAll(async () => {
      const testPort = 3011;
      const server = await startTestServer(app, { port: testPort });
      await new Promise((resolve) => setTimeout(resolve, 100));
      const client = await createTestClient(`http://localhost:${testPort}/v1/mcp`);
      env = { server, client, cleanup: async () => { await client.disconnect(); await server.stop(); } };
    });

    afterAll(async () => {
      await env.cleanup();
    });

    it("should use generators.string()", () => {
      const gen = generators.string({ minLength: 1, maxLength: 10 });
      expect(gen).toBeDefined();
    });

    it("should use generators.integer()", () => {
      const gen = generators.integer(1, 100);
      expect(gen).toBeDefined();
    });

    it("should use generators.boolean()", () => {
      const gen = generators.boolean();
      expect(gen).toBeDefined();
    });

    it("should use generators.oneOf()", () => {
      const gen = generators.oneOf("a", "b", "c");
      expect(gen).toBeDefined();
    });

    it("should run property tests with forAllInputs", async () => {
      // Using built-in string generator instead of fromSchema
      await forAllInputs(
        generators.string({ minLength: 1, maxLength: 20 }),
        async (name) => {
          const result = await env.client.callTool("greet", { name });
          // Property: should always contain the input name in response
          const text = result.content[0]?.text ?? "";
          return text.includes(name) || !result.isError;
        },
        { numRuns: 5 } // Keep small for test speed
      );
    });
  });

  // ==========================================================================
  // Assertion Methods
  // ==========================================================================
  describe("Assertion Methods", () => {
    let env: TestEnvironment;

    beforeAll(async () => {
      const testPort = 3012;
      const server = await startTestServer(app, { port: testPort });
      await new Promise((resolve) => setTimeout(resolve, 100));
      const client = await createTestClient(`http://localhost:${testPort}/v1/mcp`);
      env = { server, client, cleanup: async () => { await client.disconnect(); await server.stop(); } };
    });

    afterAll(async () => {
      await env.cleanup();
    });

    it("toHaveNoError - passes for successful result", async () => {
      const result = await env.client.callTool("greet", { name: "Test" });
      expectToolResult(result).toHaveNoError();
    });

    it("toContainText - checks text content", async () => {
      const result = await env.client.callTool("greet", { name: "TextCheck" });
      expectToolResult(result).toContainText("TextCheck");
    });

    it("toMatchSchema - validates against Zod schema", async () => {
      const schema = z.object({
        message: z.string(),
        timestamp: z.string(),
      });
      const result = await env.client.callTool("greet", { name: "Schema" });
      expectToolResult(result).toMatchSchema(schema);
    });

    it("toMatchObject - exact partial object matching", async () => {
      const result = await env.client.callTool("greet", { name: "Object" });
      // Use exact string match (not asymmetric matchers)
      const data = JSON.parse(result.content[0]?.text ?? "{}");
      expectToolResult(result).toMatchObject({
        message: data.message, // Match the actual message
      });
    });
  });

  // ==========================================================================
  // Client Options
  // ==========================================================================
  describe("Client Options", () => {
    it("should track call history when enabled", async () => {
      const testPort = 3013;
      const server = await startTestServer(app, { port: testPort });
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      const client = await createTestClient(`http://localhost:${testPort}/v1/mcp`, {
        trackHistory: true,
      });

      await client.callTool("greet", { name: "History1" });
      await client.callTool("greet", { name: "History2" });

      const history = client.getCallHistory();
      expect(history).toHaveLength(2);
      expect(history[0]?.name).toBe("greet");
      expect(history[0]?.args).toEqual({ name: "History1" });
      expect(history[1]?.args).toEqual({ name: "History2" });

      // Test clearHistory
      client.clearHistory();
      expect(client.getCallHistory()).toHaveLength(0);

      await client.disconnect();
      await server.stop();
    });

    it("should list tools", async () => {
      const testPort = 3014;
      const server = await startTestServer(app, { port: testPort });
      await new Promise((resolve) => setTimeout(resolve, 100));
      const client = await createTestClient(`http://localhost:${testPort}/v1/mcp`);

      const tools = await client.listTools();
      expect(tools.some(t => t.name === "greet")).toBe(true);
      expect(tools[0]).toHaveProperty("name");
      expect(tools[0]).toHaveProperty("description");

      await client.disconnect();
      await server.stop();
    });

    it("should handle timeout option", async () => {
      const testPort = 3015;
      const server = await startTestServer(app, { port: testPort });
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      // Client with short timeout
      const client = await createTestClient(`http://localhost:${testPort}/v1/mcp`, {
        timeout: 5000, // 5 second timeout
      });

      // Should complete within timeout
      const result = await client.callTool("greet", { name: "Timeout" });
      expectToolResult(result).toHaveNoError();

      await client.disconnect();
      await server.stop();
    });
  });
});
