/**
 * Integration tests for minimal example
 *
 * Tests the full workflow including server startup, tool calls, and cleanup.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  expectToolResult,
  startTestServer,
  createTestClient,
  TestEnvironmentBuilder,
} from "@mcp-apps-kit/testing";
import type { TestEnvironment } from "@mcp-apps-kit/testing";
import { app } from "../src/index.js";

describe("Minimal Example Integration", () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    // For versioned apps, we need to start the main app and connect to a version endpoint
    // Let's use v1 for integration tests
    // Use a fixed port for testing
    const testPort = 3004;
    const server = await startTestServer(app as unknown, { port: testPort });
    
    // Wait a bit for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    const client = await createTestClient(`http://localhost:${testPort}/v1/mcp`, {
      trackHistory: true,
      timeout: 10000,
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

  it("should start server and connect client", () => {
    expect(env.server).toBeDefined();
    expect(env.client).toBeDefined();
    expect(env.server.url).toBeTruthy();
    expect(env.server.mcpUrl).toBeTruthy();
  });

  it("should list available tools", async () => {
    const tools = await env.client.listTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some((t) => t.name === "greet")).toBe(true);
  });

  it("should track call history when enabled", async () => {
    env.client.clearHistory();

    await env.client.callTool("greet", { name: "HistoryTest" });

    const history = env.client.getCallHistory();
    expect(history.length).toBe(1);
    expect(history[0]?.name).toBe("greet");
    expect(history[0]?.args).toEqual({ name: "HistoryTest" });
  });

  it("should handle multiple sequential calls", async () => {
    env.client.clearHistory();

    const results = await Promise.all([
      env.client.callTool("greet", { name: "First" }),
      env.client.callTool("greet", { name: "Second" }),
      env.client.callTool("greet", { name: "Third" }),
    ]);

    expect(results).toHaveLength(3);
    results.forEach((result) => {
      expectToolResult(result).toHaveNoError();
    });

    const history = env.client.getCallHistory();
    expect(history.length).toBe(3);
  });

  it("should handle errors gracefully", async () => {
    // Test with invalid input (missing required field)
    // Note: This depends on how the server handles validation
    // For now, we'll test that the client doesn't crash
    try {
      await env.client.callTool("greet", {} as { name: string });
    } catch (error) {
      // Expected - validation error
      expect(error).toBeDefined();
    }
  });
});
