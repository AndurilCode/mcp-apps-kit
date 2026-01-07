/**
 * Advanced feature tests - showcasing more testing library capabilities
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  expectToolResult,
  startTestServer,
  createTestClient,
  createTestEnvironment,
  TestEnvironmentBuilder,
  createMockHost,
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
  // createTestEnvironment (simplified setup)
  // ==========================================================================
  describe("createTestEnvironment", () => {
    let env: TestEnvironment;

    beforeAll(async () => {
      env = await createTestEnvironment({
        app,
        port: 3009,
        version: "v1",
        clientOptions: { trackHistory: true },
      });
    });

    afterAll(async () => {
      await env.cleanup();
    });

    it("should create environment with app and version", () => {
      expect(env.server).toBeDefined();
      expect(env.client).toBeDefined();
      expect(env.server.url).toBe("http://localhost:3009");
    });

    it("should call tools through environment", async () => {
      const result = await env.client.callTool("greet", { name: "EnvTest" });
      expectToolResult(result).toHaveNoError();
      expectToolResult(result).toContainText("EnvTest");
    });

    it("should track history when enabled", async () => {
      env.client.clearHistory();
      await env.client.callTool("greet", { name: "HistoryTest" });
      const history = env.client.getCallHistory();
      expect(history).toHaveLength(1);
    });
  });

  // ==========================================================================
  // TestEnvironmentBuilder (fluent API)
  // ==========================================================================
  describe("TestEnvironmentBuilder", () => {
    let env: TestEnvironment;

    beforeAll(async () => {
      env = await new TestEnvironmentBuilder()
        .withApp(app)
        .withPort(3008)
        .withVersion("v1")
        .withClientOptions({ trackHistory: true })
        .build();
    });

    afterAll(async () => {
      await env.cleanup();
    });

    it("should create environment using builder pattern", () => {
      expect(env.server).toBeDefined();
      expect(env.client).toBeDefined();
    });

    it("should call tools through builder-created environment", async () => {
      const result = await env.client.callTool("greet", { name: "BuilderTest" });
      expectToolResult(result).toHaveNoError();
      expectToolResult(result).toContainText("BuilderTest");
    });
  });

  // ==========================================================================
  // createMockHost (UI testing)
  // ==========================================================================
  describe("createMockHost", () => {
    it("should create a mock host with default options", () => {
      const mockHost = createMockHost();
      expect(mockHost).toBeDefined();
      expect(mockHost.getTheme()).toBe("light");
    });

    it("should create a mock host with custom theme", () => {
      const mockHost = createMockHost({
        initialContext: { theme: "dark" },
      });
      expect(mockHost.getTheme()).toBe("dark");
    });

    it("should allow setting theme", () => {
      const mockHost = createMockHost();
      expect(mockHost.getTheme()).toBe("light");
      mockHost.setTheme("dark");
      expect(mockHost.getTheme()).toBe("dark");
    });

    it("should track tool call history via simulateToolCall", () => {
      const mockHost = createMockHost();
      
      mockHost.simulateToolCall("greet", { name: "Test" });
      mockHost.simulateToolCall("calculate", { a: 1, b: 2 });

      const history = mockHost.getToolCallHistory();
      expect(history).toHaveLength(2);
      expect(history[0]?.name).toBe("greet");
      expect(history[0]?.args).toEqual({ name: "Test" });
      expect(history[1]?.name).toBe("calculate");
    });

    it("should clear history", () => {
      const mockHost = createMockHost();
      mockHost.simulateToolCall("test", {});
      expect(mockHost.getToolCallHistory()).toHaveLength(1);
      
      mockHost.clearHistory();
      expect(mockHost.getToolCallHistory()).toHaveLength(0);
    });

    it("should emit and handle tool results", () => {
      const mockHost = createMockHost();
      const results: unknown[] = [];

      mockHost.onToolResult((result) => {
        results.push(result);
      });

      mockHost.emitToolResult({ message: "Hello!" });
      mockHost.emitToolResult({ count: 42 });

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ message: "Hello!" });
      expect(results[1]).toEqual({ count: 42 });
    });

    it("should register and unregister tool call handlers", () => {
      const mockHost = createMockHost();
      const calls: Array<{ name: string; args: unknown }> = [];

      const unsubscribe = mockHost.onToolCall((name, args) => {
        calls.push({ name, args });
      });

      mockHost.simulateToolCall("test1", { x: 1 });
      expect(calls).toHaveLength(1);

      unsubscribe();
      mockHost.simulateToolCall("test2", { x: 2 });
      expect(calls).toHaveLength(1); // Should not increase
    });

    it("should handle teardown events", () => {
      const mockHost = createMockHost();
      const reasons: Array<string | undefined> = [];

      mockHost.onTeardown((reason) => {
        reasons.push(reason);
      });

      mockHost.emitTeardown("user closed");
      mockHost.emitTeardown();

      expect(reasons).toEqual(["user closed", undefined]);
    });

    it("should handle tool cancelled events", () => {
      const mockHost = createMockHost();
      const reasons: Array<string | undefined> = [];

      mockHost.onToolCancelled((reason) => {
        reasons.push(reason);
      });

      mockHost.emitToolCancelled("timeout");
      mockHost.emitToolCancelled();

      expect(reasons).toEqual(["timeout", undefined]);
    });
  });

  // ==========================================================================
  // Test Suites (declarative test definitions)
  // ==========================================================================
  describe("defineTestSuite / runTestSuite", () => {
    let env: TestEnvironment;

    beforeAll(async () => {
      env = await createTestEnvironment({
        app,
        port: 3010,
        version: "v1",
      });
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
      env = await createTestEnvironment({
        app,
        port: 3011,
        version: "v1",
      });
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
        async (name: string) => {
          const result = await env.client.callTool("greet", { name });
          // Property: should always contain the input name in response
          if (result.isError) {
            return false;
          }
          // Parse JSON to check the actual message field (avoids JSON escaping issues)
          const text = result.content[0]?.text ?? "{}";
          const data = JSON.parse(text);
          return typeof data.message === "string" && data.message.includes(name);
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
      env = await createTestEnvironment({
        app,
        port: 3012,
        version: "v1",
      });
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
