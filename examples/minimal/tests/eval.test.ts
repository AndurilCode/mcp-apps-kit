/**
 * MCP Evaluation Tests for Greet Tool
 *
 * These tests let an LLM actually USE the MCP tools to complete tasks,
 * then assert on what tools were called and what results came back.
 *
 * This is the correct way to evaluate MCP tools - not just checking JSON output.
 *
 * Requires OPENAI_API_KEY environment variable to be set.
 * Run with: pnpm test -- eval.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupMCPEval, describeEval, hasOpenAIKey } from "@mcp-apps-kit/testing";
import type { MCPEval } from "@mcp-apps-kit/testing";
import { app } from "../src/index.js";

// describeEval auto-skips if OPENAI_API_KEY is not set
describeEval("MCP Eval - V1 Greet Tool", () => {
  let mcpEval: MCPEval;

  beforeAll(async () => {
    mcpEval = await setupMCPEval(app, { 
      version: "v1", 
      model: "gpt-4o-mini",
      verbose: true,
    });
  });

  afterAll(async () => {
    await mcpEval.cleanup();
  });

  it("should use greet tool when asked to greet someone", async () => {
    const result = await mcpEval.run("Please greet Alice");

    // Assert tool was called with correct args
    expect(result.toolCalls).toContainEqual(
      expect.objectContaining({ name: "greet", args: { name: "Alice" }, success: true })
    );

    // Judge the response using LLM
    const judgment = await result.judge(
      "The response should acknowledge that Alice was greeted and be friendly"
    );
    expect(judgment.pass).toBe(true);
    expect(judgment.score).toBeGreaterThan(0.7);
  });

  it("should handle greeting with special characters", async () => {
    const result = await mcpEval.run("Greet José");

    // Assert tool was called with correct args
    expect(result.toolCalls).toContainEqual(
      expect.objectContaining({ name: "greet", args: { name: "José" }, success: true })
    );

    // Judge the response
    const judgment = await result.judge(
      "The response should be a friendly greeting to the person"
    );
    expect(judgment.pass).toBe(true);
  });

  it("should greet multiple people with multiple tool calls", async () => {
    const result = await mcpEval.run("Greet both Alice and Bob");

    // Assert both names were greeted
    expect(result.toolCalls).toContainEqual(
      expect.objectContaining({ name: "greet", args: { name: "Alice" } })
    );
    expect(result.toolCalls).toContainEqual(
      expect.objectContaining({ name: "greet", args: { name: "Bob" } })
    );

    // Judge the response
    const judgment = await result.judge(
      "The response should confirm that both Alice and Bob were greeted"
    );
    expect(judgment.pass).toBe(true);
  });

  it("should use greet tool appropriately for formal greeting request", async () => {
    const result = await mcpEval.run("I need to send a greeting to Dr. Smith");

    // Assert greet was called successfully (name might be "Dr. Smith" or "Smith")
    expect(result.toolCalls).toContainEqual(
      expect.objectContaining({ name: "greet", success: true })
    );

    // Judge the response
    const judgment = await result.judge(
      "The response should confirm that a greeting was sent to Dr. Smith"
    );
    expect(judgment.pass).toBe(true);
  });
});

describeEval("MCP Eval - V2 Greet Tool (with surname)", () => {
  let mcpEval: MCPEval;

  beforeAll(async () => {
    mcpEval = await setupMCPEval(app, { 
      version: "v2", 
      model: "gpt-4o-mini",
    });
  });

  afterAll(async () => {
    await mcpEval.cleanup();
  });

  it("should use full name when given first and last name", async () => {
    const result = await mcpEval.run("Greet John Doe");

    // Assert greet was called with name and surname
    expect(result.toolCalls).toContainEqual(
      expect.objectContaining({ 
        name: "greet", 
        args: expect.objectContaining({ name: "John" }),
        success: true 
      })
    );

    // Judge the response
    const judgment = await result.judge(
      "The response should be a greeting that includes John Doe's full name"
    );
    expect(judgment.pass).toBe(true);
  });

  it("should handle single name gracefully", async () => {
    const result = await mcpEval.run("Say hello to Jane");

    // Assert greet was called
    expect(result.toolCalls).toContainEqual(
      expect.objectContaining({ name: "greet", args: { name: "Jane" }, success: true })
    );

    // Judge the response
    const judgment = await result.judge(
      "The response should be a friendly greeting to Jane"
    );
    expect(judgment.pass).toBe(true);
  });
});

// Informative message when tests are skipped
if (!hasOpenAIKey()) {
  describe("MCP Evaluation Tests", () => {
    it.skip("⚠️ Skipped: Set OPENAI_API_KEY environment variable to run MCP evaluation tests", () => {
      // This test is intentionally empty - it serves as documentation
    });
  });
}
