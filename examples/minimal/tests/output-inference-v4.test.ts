/**
 * Tests for v4 output type inference (PRD-004)
 */

import { describe, it, expect, expectTypeOf, beforeAll, afterAll } from "vitest";
import { expectToolResult, startTestServer, createTestClient } from "@mcp-apps-kit/testing";
import type { TestEnvironment } from "@mcp-apps-kit/testing";
import { app, type AppClientToolsV4 } from "../src/index.js";

describe("V4 - Output Type Inference (PRD-004)", () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    const testPort = 3004;
    const server = await startTestServer(app, { port: testPort });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const client = await createTestClient(`http://localhost:${testPort}/v4/mcp`);

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

  describe("inferredToolV4 (defineTool without output schema)", () => {
    it("should execute and return inferred output type", async () => {
      const result = await env.client.callTool("getStats", { includeMemory: false });

      expectToolResult(result).toHaveNoError();

      const data = result.structuredContent as { uptime: number; timestamp: string };
      expect(data).toHaveProperty("uptime");
      expect(data).toHaveProperty("timestamp");
      expect(typeof data.uptime).toBe("number");
      expect(typeof data.timestamp).toBe("string");
    });

    it("should include optional memory field when requested", async () => {
      const result = await env.client.callTool("getStats", { includeMemory: true });

      expectToolResult(result).toHaveNoError();

      const data = result.structuredContent as {
        uptime: number;
        timestamp: string;
        memory?: { used: number; total: number };
      };
      expect(data).toHaveProperty("uptime");
      expect(data).toHaveProperty("timestamp");
      expect(data).toHaveProperty("memory");
      expect(data.memory).toHaveProperty("used");
      expect(data.memory).toHaveProperty("total");
    });

    it("should have correct client types inferred", () => {
      type StatsOutput = AppClientToolsV4["getStats"]["output"];

      // Meta keys should be excluded from client types
      expectTypeOf<StatsOutput>().not.toHaveProperty("_text");
      expectTypeOf<StatsOutput>().not.toHaveProperty("_meta");
      expectTypeOf<StatsOutput>().not.toHaveProperty("_closeWidget");

      // But should have the actual data fields
      expectTypeOf<StatsOutput>().toMatchTypeOf<{
        uptime: number;
        timestamp: string;
        memory?: { used: number; total: number };
      }>();
    });
  });

  describe("quickMathV4 (fluent builder without output)", () => {
    it("should execute addition", async () => {
      const result = await env.client.callTool("quickMath", {
        a: 5,
        b: 3,
        operation: "add",
      });

      expectToolResult(result).toHaveNoError();

      const data = result.structuredContent as {
        result: number;
        expression: string;
        isValid: boolean;
      };
      expect(data.result).toBe(8);
      expect(data.expression).toBe("5 add 3 = 8");
      expect(data.isValid).toBe(true);
    });

    it("should handle division by zero", async () => {
      const result = await env.client.callTool("quickMath", {
        a: 10,
        b: 0,
        operation: "divide",
      });

      expectToolResult(result).toHaveNoError();

      const data = result.structuredContent as {
        result: number;
        isValid: boolean;
      };
      // NaN gets serialized as null in JSON
      expect(data.result).toBe(null);
      expect(data.isValid).toBe(false);
    });

    it("should have correct client types inferred from builder", () => {
      type MathOutput = AppClientToolsV4["quickMath"]["output"];

      // Meta keys should be excluded
      expectTypeOf<MathOutput>().not.toHaveProperty("_text");

      // Should have the actual fields
      expectTypeOf<MathOutput>().toMatchTypeOf<{
        result: number;
        expression: string;
        isValid: boolean;
      }>();
    });
  });

  describe("type inference validation", () => {
    it("should infer output types correctly for both tools", () => {
      type V4Tools = AppClientToolsV4;

      // Verify both tools are present
      expectTypeOf<V4Tools>().toHaveProperty("getStats");
      expectTypeOf<V4Tools>().toHaveProperty("quickMath");

      // Verify output types are inferred (not unknown)
      expectTypeOf<V4Tools["getStats"]["output"]>().not.toEqualTypeOf<unknown>();
      expectTypeOf<V4Tools["quickMath"]["output"]>().not.toEqualTypeOf<unknown>();
    });
  });
});
