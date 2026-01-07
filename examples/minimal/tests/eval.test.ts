/**
 * MCP Evaluation Tests for Greet Tool
 *
 * These tests demonstrate the full capabilities of the MCP eval framework:
 * - Basic tool evaluation
 * - Multi-turn conversations
 * - Batch evaluation
 * - Multi-criteria judging
 * - Error injection
 * - Token usage tracking
 *
 * Requires OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable.
 * Run with: pnpm test -- eval.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  setupMCPEval,
  describeEval,
  hasAnyProviderKey,
  printGlobalSummary,
  clearGlobalCollector,
  type MCPEval,
  type MCPSession,
} from "@mcp-apps-kit/testing";
import { app } from "../src/index.js";

// Clear any previous results and print global summary at the end
beforeAll(() => {
  clearGlobalCollector();
});

afterAll(() => {
  printGlobalSummary();
});

// =============================================================================
// BASIC EVALUATION TESTS
// =============================================================================

describeEval("MCP Eval - Basic Tool Evaluation", () => {
  let mcpEval: MCPEval;

  beforeAll(async () => {
    mcpEval = await setupMCPEval(app, {
      version: "v1",
      model: "gpt-4o-mini",
      verbose: true,
      // Pricing for gpt-4o-mini (per 1M tokens) - https://openai.com/api/pricing
      pricing: { input: 0.15, output: 0.6 },
      // Resilience config for production-like testing
      retry: { maxAttempts: 2, delay: 500 },
      timeout: 30000,
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

    // Check token usage is tracked
    expect(result.usage).toBeDefined();
    expect(result.usage?.totalTokens).toBeGreaterThan(0);

    // Judge the response
    const judgment = await result.judge(
      "The response should acknowledge that Alice was greeted and be friendly"
    );
    expect(judgment.pass).toBe(true);
    expect(judgment.score).toBeGreaterThan(0.7);
  });

  it("should greet multiple people with multiple tool calls", async () => {
    const result = await mcpEval.run("Greet both Alice and Bob");

    // Should have called greet at least twice
    const greetCalls = result.toolCalls.filter((tc) => tc.name === "greet");
    expect(greetCalls.length).toBeGreaterThanOrEqual(2);

    // Check both names were greeted
    const names = greetCalls.map((tc) => tc.args.name);
    expect(names).toContain("Alice");
    expect(names).toContain("Bob");

    // Judge: both people should be greeted
    const judgment = await result.judge(
      "The response should confirm that both Alice and Bob were greeted"
    );
    expect(judgment.pass).toBe(true);
  });
});

// =============================================================================
// MULTI-CRITERIA JUDGING
// =============================================================================

describeEval("MCP Eval - Multi-Criteria Judging", () => {
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

  it("should evaluate response against multiple criteria", async () => {
    const result = await mcpEval.run("Please greet my friend Charlie warmly");

    expect(result.toolCalls).toContainEqual(
      expect.objectContaining({ name: "greet", success: true })
    );

    // Judge with multiple criteria
    const judgment = await result.judge({
      criteria: [
        { name: "friendly", description: "Response should be friendly and warm" },
        { name: "accurate", description: "Response should mention Charlie's name" },
        { name: "concise", description: "Response should be reasonably concise" },
      ],
      threshold: 0.7,
    });

    // Overall pass
    expect(judgment.pass).toBe(true);

    // Per-criterion results
    expect(judgment.criteria).toBeDefined();
    expect(judgment.criteria?.friendly.pass).toBe(true);
    expect(judgment.criteria?.accurate.score).toBeGreaterThan(0.5);
  });
});

// =============================================================================
// MULTI-TURN CONVERSATIONS
// =============================================================================

describeEval("MCP Eval - Multi-Turn Conversations", () => {
  let mcpEval: MCPEval;
  let session: MCPSession;

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

  it("should maintain context across conversation turns", async () => {
    session = mcpEval.createSession();

    // First turn
    const r1 = await session.run("Greet Alice for me");
    expect(r1.toolCalls).toContainEqual(
      expect.objectContaining({ name: "greet", args: { name: "Alice" } })
    );

    // Second turn - references first turn
    const r2 = await session.run("Now greet Bob too");
    expect(r2.toolCalls).toContainEqual(
      expect.objectContaining({ name: "greet", args: { name: "Bob" } })
    );

    // Check aggregated usage
    const usage = session.getUsage();
    expect(usage.totalTokens).toBeGreaterThan(0);

    // Session should have both results
    expect(session.getResults()).toHaveLength(2);

    // Clean up session
    session.end();
  });

  it("should support manual history passing", async () => {
    // First turn
    const result1 = await mcpEval.run("Greet Diana");
    expect(result1.toolCalls).toContainEqual(
      expect.objectContaining({ name: "greet", args: { name: "Diana" } })
    );

    // Second turn with history
    const result2 = await mcpEval.run("Remind me who you greeted", {
      history: result1.history,
    });

    // Judge that the agent remembers Diana
    const judgment = await result2.judge("Response should mention Diana was greeted");
    expect(judgment.pass).toBe(true);
  });
});

// =============================================================================
// BATCH EVALUATION
// =============================================================================

describeEval("MCP Eval - Batch Evaluation", () => {
  let mcpEval: MCPEval;

  beforeAll(async () => {
    mcpEval = await setupMCPEval(app, {
      version: "v1",
      model: "gpt-4o-mini",
      verbose: false, // Quieter for batch runs
    });
  });

  afterAll(async () => {
    await mcpEval.cleanup();
  });

  it("should run batch evaluation with assertions", async () => {
    const batch = await mcpEval.runBatch(
      [
        {
          name: "Greet Alice",
          prompt: "Greet Alice",
          expect: { tool: "greet", args: { name: "Alice" } },
        },
        {
          name: "Greet Bob",
          prompt: "Greet Bob",
          expect: { tool: "greet", args: { name: "Bob" } },
        },
        {
          name: "Greet Charlie",
          prompt: "Say hello to Charlie",
          expect: { tool: "greet" },
          judgeCriteria: "Should be a friendly greeting to Charlie",
        },
      ],
      { verbose: true, printSummary: true }
    );

    // Check summary
    expect(batch.summary.total).toBe(3);
    expect(batch.summary.successRate).toBeGreaterThanOrEqual(0.9);
    expect(batch.failures).toHaveLength(0);

    // Check tool stats
    expect(batch.summary.toolStats.greet).toBeDefined();
    expect(batch.summary.toolStats.greet.calls).toBeGreaterThanOrEqual(3);
  });

  it("should aggregate token usage in batch", async () => {
    const batch = await mcpEval.runBatch([{ prompt: "Greet Emma" }, { prompt: "Greet Frank" }], {
      verbose: false,
      printSummary: false,
    });

    // Should have aggregated usage
    expect(batch.summary.totalUsage).toBeDefined();
    expect(batch.summary.totalUsage?.totalTokens).toBeGreaterThan(0);
    expect(batch.summary.avgDuration).toBeGreaterThan(0);
  });
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

describeEval("MCP Eval - Error Handling", () => {
  it("should handle error injection gracefully", async () => {
    const mcpEval = await setupMCPEval(app, {
      version: "v1",
      model: "gpt-4o-mini",
      verbose: true,
      // Configure mock error for greet tool
      mockErrors: {
        greet: { error: "Service temporarily unavailable", probability: 1.0 },
      },
    });

    try {
      const result = await mcpEval.run("Please greet Alice");

      // Tool should have been called but failed
      expect(result.toolCalls).toContainEqual(
        expect.objectContaining({ name: "greet", success: false })
      );

      // LLM should report the error to the user
      const judgment = await result.judge(
        "Response should acknowledge that something went wrong or the greeting failed"
      );
      expect(judgment.pass).toBe(true);
    } finally {
      await mcpEval.cleanup();
    }
  });

  it("should support per-run error injection", async () => {
    const mcpEval = await setupMCPEval(app, {
      version: "v1",
      model: "gpt-4o-mini",
      verbose: true,
    });

    try {
      // First run - should work
      const result1 = await mcpEval.run("Greet Alice");
      expect(result1.toolCalls).toContainEqual(
        expect.objectContaining({ name: "greet", success: true })
      );

      // Second run - inject error
      const result2 = await mcpEval.run("Greet Bob", {
        injectError: { tool: "greet", error: "Network timeout" },
      });
      expect(result2.toolCalls).toContainEqual(
        expect.objectContaining({ name: "greet", success: false })
      );

      // Third run - should work again (error was one-time)
      const result3 = await mcpEval.run("Greet Charlie");
      expect(result3.toolCalls).toContainEqual(
        expect.objectContaining({ name: "greet", success: true })
      );
    } finally {
      await mcpEval.cleanup();
    }
  });
});

// =============================================================================
// V2 TOOL TESTS
// =============================================================================

describeEval("MCP Eval - V2 Greet Tool (with surname)", () => {
  let mcpEval: MCPEval;

  beforeAll(async () => {
    mcpEval = await setupMCPEval(app, {
      version: "v2",
      model: "gpt-4o-mini",
      verbose: true,
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
        success: true,
      })
    );

    // Check structured result
    const greetCall = result.toolCalls.find((tc) => tc.name === "greet");
    const greetResult = greetCall?.result as { fullName?: string } | undefined;
    expect(greetResult?.fullName).toContain("John");

    // Judge with multiple criteria
    const judgment = await result.judge({
      criteria: [
        { name: "fullName", description: "Response should include full name" },
        { name: "friendly", description: "Response should be friendly" },
      ],
    });
    expect(judgment.pass).toBe(true);
  });
});

// =============================================================================
// SKIP MESSAGE
// =============================================================================

if (!hasAnyProviderKey()) {
  describe("MCP Evaluation Tests", () => {
    it.skip("⚠️ Skipped: Set OPENAI_API_KEY or ANTHROPIC_API_KEY to run eval tests", () => {
      // This test is intentionally empty - it serves as documentation
    });
  });
}
