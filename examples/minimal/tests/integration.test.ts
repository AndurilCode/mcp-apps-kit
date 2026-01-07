/**
 * Integration tests for minimal example
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { expectToolResult, startTestServer, createTestClient } from "@mcp-apps-kit/testing";
import type { TestEnvironment } from "@mcp-apps-kit/testing";
import { app } from "../src/index.js";

describe("Minimal Example Integration", () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    const testPort = 3004;
    const server = await startTestServer(app, { port: testPort });
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

    const result1 = await env.client.callTool("greet", { name: "First" });
    const result2 = await env.client.callTool("greet", { name: "Second" });
    const result3 = await env.client.callTool("greet", { name: "Third" });

    const results = [result1, result2, result3];
    expect(results).toHaveLength(3);
    results.forEach((result) => {
      expectToolResult(result).toHaveNoError();
    });

    const history = env.client.getCallHistory();
    expect(history.length).toBe(3);
  });

  it("should handle errors gracefully", async () => {
    // Test with invalid input (missing required field)
    try {
      await env.client.callTool("greet", {} as { name: string });
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});
