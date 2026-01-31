/**
 * Tests for versioning functionality
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { expectToolResult, startTestServer, createTestClient } from "@mcp-apps-kit/testing";
import type { TestEnvironment } from "@mcp-apps-kit/testing";
import { app } from "../../src/index.js";

describe("Versioning", () => {
  let v1Env: TestEnvironment;
  let v2Env: TestEnvironment;
  let mainServer: Awaited<ReturnType<typeof startTestServer>>;

  beforeAll(async () => {
    const testPort = 3003;
    mainServer = await startTestServer(app as unknown, { port: testPort });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const v1Client = await createTestClient(
      { transport: "http", url: `http://localhost:${testPort}/v1/mcp` },
      {
        trackHistory: true,
      }
    );

    const v2Client = await createTestClient(
      { transport: "http", url: `http://localhost:${testPort}/v2/mcp` },
      {
        trackHistory: true,
      }
    );

    v1Env = {
      server: mainServer,
      client: v1Client,
      async cleanup() {
        await v1Client.disconnect();
      },
    };

    v2Env = {
      server: mainServer,
      client: v2Client,
      async cleanup() {
        await v2Client.disconnect();
      },
    };
  });

  afterAll(async () => {
    await Promise.all([v1Env.cleanup(), v2Env.cleanup()]);
    await mainServer.stop();
  });

  it("should have both v1 and v2 versions available", () => {
    const versions = app.getVersions();
    expect(versions).toContain("v1");
    expect(versions).toContain("v2");
  });

  it("should list tools for v1", async () => {
    const tools = await v1Env.client.listTools();
    // May include log_debug tool if debug is enabled
    expect(tools.length).toBeGreaterThanOrEqual(1);
    expect(tools.some((t) => t.name === "greet")).toBe(true);
  });

  it("should list tools for v2", async () => {
    const tools = await v2Env.client.listTools();
    // May include log_debug tool if debug is enabled
    expect(tools.length).toBeGreaterThanOrEqual(1);
    expect(tools.some((t) => t.name === "greet")).toBe(true);
  });

  it("should have different output schemas for v1 and v2", async () => {
    const v1Result = await v1Env.client.callTool("greet", { name: "Test" });
    const v2Result = await v2Env.client.callTool("greet", { name: "Test" });

    expectToolResult(v1Result).toHaveNoError();
    expectToolResult(v2Result).toHaveNoError();

    // Use structuredContent for typed data assertions
    const v1Data = v1Result.structuredContent as Record<string, unknown>;
    const v2Data = v2Result.structuredContent as Record<string, unknown>;

    expect(v1Data, "v1 result should have structuredContent").toBeDefined();
    expect(v2Data, "v2 result should have structuredContent").toBeDefined();

    // v1 doesn't have fullName
    expect(v1Data).not.toHaveProperty("fullName");

    // v2 has fullName
    expect(v2Data).toHaveProperty("fullName");
  });

  it("should handle v1 input schema (name only)", async () => {
    const result = await v1Env.client.callTool("greet", { name: "Alice" });

    expectToolResult(result).toHaveNoError();

    // Use structuredContent for typed data assertions
    const data = result.structuredContent as { message: string };
    expect(data, "result should have structuredContent").toBeDefined();
    expect(data.message).toContain("Alice");
  });

  it("should handle v2 input schema (name + optional surname)", async () => {
    const result = await v2Env.client.callTool("greet", {
      name: "Bob",
      surname: "Smith",
    });

    expectToolResult(result).toHaveNoError();

    // Use structuredContent for typed data assertions
    const data = result.structuredContent as { fullName: string };
    expect(data, "result should have structuredContent").toBeDefined();
    expect(data.fullName).toBe("Bob Smith");
  });
});
