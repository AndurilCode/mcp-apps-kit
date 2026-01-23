/**
 * Workflow engine tests
 *
 * @module workflow.test
 */

import { describe, it, expect, vi, beforeEach, onTestFinished } from "vitest";
import { z } from "zod";
import {
  workflow,
  toolStep,
  customStep,
  externalStep,
  WorkflowValidationError,
  ExecutorManager,
  type WorkflowContext,
} from "../src/workflow";
import type { ToolContext } from "../src/types/tools";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const mockToolContext: ToolContext = {
  locale: "en-US",
  userAgent: "test-agent",
  subject: "test-user",
};

// Reset ExecutorManager between tests to prevent cross-test pollution
let testCounter = 0;
beforeEach(() => {
  ExecutorManager.resetInstance();
  testCounter++;

  // Use onTestFinished to ensure cleanup happens even if test fails
  onTestFinished(async () => {
    try {
      await ExecutorManager.getInstance().shutdown(true);
      ExecutorManager.resetInstance();
    } catch (error) {
      // Log but don't fail the test cleanup
      console.error("Failed to cleanup ExecutorManager:", error);
    }
  });
});

// Helper to generate unique workflow names per test
function uniqueWorkflowName(base: string): string {
  return `${base}_${testCounter}_${Date.now()}`;
}

// =============================================================================
// WORKFLOW BUILDER TESTS
// =============================================================================

describe("Workflow Builder", () => {
  describe("Basic Configuration", () => {
    it("should require description", () => {
      expect(() => {
        const builder = workflow(uniqueWorkflowName("test")) as any;
        builder
          .input({ value: z.string() })
          .step(
            "step1",
            customStep(async () => ({ result: "ok" }))
          )
          .build();
      }).toThrow(WorkflowValidationError);
    });

    it("should require input schema", () => {
      expect(() => {
        const builder = workflow(uniqueWorkflowName("test")).describe("Test workflow") as any;
        builder
          .step(
            "step1",
            customStep(async () => ({ result: "ok" }))
          )
          .build();
      }).toThrow(WorkflowValidationError);
    });

    it("should require at least one step", () => {
      expect(() => {
        workflow(uniqueWorkflowName("test"))
          .describe("Test workflow")
          .input({ value: z.string() })
          .build();
      }).toThrow(WorkflowValidationError);
    });

    it("should build valid workflow", () => {
      const wf = workflow(uniqueWorkflowName("test"))
        .describe("Test workflow")
        .input({ value: z.string() })
        .step(
          "step1",
          customStep(async () => ({ result: "ok" }))
        )
        .build();

      expect(wf).toBeDefined();
      expect(wf.description).toBe("Test workflow");
      expect(wf.handler).toBeDefined();
    });

    it("should accept output schema", () => {
      const wf = workflow(uniqueWorkflowName("test"))
        .describe("Test workflow")
        .input({ value: z.string() })
        .output({ result: z.string() })
        .step(
          "step1",
          customStep(async () => ({ result: "ok" }))
        )
        .build();

      expect(wf).toBeDefined();
      expect(wf.output).toBeDefined();
    });

    it("should reject duplicate step names", () => {
      expect(() => {
        workflow(uniqueWorkflowName("test"))
          .describe("Test workflow")
          .input({ value: z.string() })
          .step(
            "step1",
            customStep(async () => ({ result: "ok" }))
          )
          .step(
            "step1",
            customStep(async () => ({ result: "ok" }))
          )
          .build();
      }).toThrow(WorkflowValidationError);
    });
  });

  describe("Step Types", () => {
    it("should accept tool step", () => {
      const wf = workflow(uniqueWorkflowName("test"))
        .describe("Test workflow")
        .input({ value: z.string() })
        .step("step1", toolStep("my_tool"))
        .build();

      expect(wf).toBeDefined();
    });

    it("should accept custom step", () => {
      const wf = workflow(uniqueWorkflowName("test"))
        .describe("Test workflow")
        .input({ value: z.string() })
        .step(
          "step1",
          customStep(async (ctx) => ({ value: (ctx.input as { value: string }).value }))
        )
        .build();

      expect(wf).toBeDefined();
    });

    it("should accept external step", () => {
      const wf = workflow(uniqueWorkflowName("test"))
        .describe("Test workflow")
        .input({ value: z.string() })
        .step(
          "step1",
          externalStep({
            server: "mcp://external-server",
            tool: "external_tool",
          })
        )
        .build();

      expect(wf).toBeDefined();
    });

    it("should accept parallel steps", () => {
      const wf = workflow(uniqueWorkflowName("test"))
        .describe("Test workflow")
        .input({ value: z.string() })
        .parallel("parallel1", [
          customStep(async () => ({ a: 1 })),
          customStep(async () => ({ b: 2 })),
        ])
        .build();

      expect(wf).toBeDefined();
    });

    it("should accept branch steps", () => {
      const wf = workflow(uniqueWorkflowName("test"))
        .describe("Test workflow")
        .input({ value: z.string() })
        .branch("branch1", {
          when: (ctx) => (ctx.input as { value: string }).value === "test",
          then: [customStep(async () => ({ result: "then" }))],
          else: [customStep(async () => ({ result: "else" }))],
        })
        .build();

      expect(wf).toBeDefined();
    });
  });
});

// =============================================================================
// WORKFLOW EXECUTION TESTS
// =============================================================================

describe("Workflow Execution", () => {
  describe("Custom Steps", () => {
    it("should execute single custom step", async () => {
      const wf = workflow(uniqueWorkflowName("test"))
        .describe("Test workflow")
        .input({ value: z.string() })
        .step(
          "step1",
          customStep(async (ctx: WorkflowContext) => ({
            result: `processed: ${(ctx.input as { value: string }).value}`,
          }))
        )
        .build();

      const result = await wf.handler({ value: "test" }, mockToolContext);

      expect(result).toEqual({
        step1: { result: "processed: test" },
      });
    });

    it("should execute multiple sequential steps", async () => {
      const wf = workflow(uniqueWorkflowName("test"))
        .describe("Test workflow")
        .input({ value: z.number() })
        .step(
          "double",
          customStep(async (ctx: WorkflowContext) => ({
            value: (ctx.input as { value: number }).value * 2,
          }))
        )
        .step(
          "add10",
          customStep(async (ctx: WorkflowContext) => ({
            value: (ctx.outputs.double as { value: number }).value + 10,
          }))
        )
        .build();

      const result = await wf.handler({ value: 5 }, mockToolContext);

      expect(result).toEqual({
        double: { value: 10 },
        add10: { value: 20 },
      });
    });

    it("should provide accumulated outputs to steps", async () => {
      const wf = workflow(uniqueWorkflowName("test"))
        .describe("Test workflow")
        .input({ value: z.number() })
        .step(
          "step1",
          customStep(async () => ({ a: 1 }))
        )
        .step(
          "step2",
          customStep(async () => ({ b: 2 }))
        )
        .step(
          "step3",
          customStep(async (ctx) => ({
            sum: (ctx.outputs.step1 as { a: number }).a + (ctx.outputs.step2 as { b: number }).b,
          }))
        )
        .build();

      const result = await wf.handler({ value: 0 }, mockToolContext);

      expect(result).toEqual({
        step1: { a: 1 },
        step2: { b: 2 },
        step3: { sum: 3 },
      });
    });
  });

  describe("Parallel Execution", () => {
    it("should execute parallel steps concurrently", async () => {
      const executionOrder: number[] = [];

      const wf = workflow(uniqueWorkflowName("test"))
        .describe("Test workflow")
        .input({ value: z.string() })
        .parallel("parallel1", [
          customStep(async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            executionOrder.push(1);
            return { a: 1 };
          }),
          customStep(async () => {
            await new Promise((resolve) => setTimeout(resolve, 25));
            executionOrder.push(2);
            return { b: 2 };
          }),
          customStep(async () => {
            executionOrder.push(3);
            return { c: 3 };
          }),
        ])
        .build();

      const result = await wf.handler({ value: "test" }, mockToolContext);

      // Results should be collected
      expect(result).toEqual({
        parallel1: [{ a: 1 }, { b: 2 }, { c: 3 }],
      });

      // Fastest should complete first (3, then 2, then 1)
      expect(executionOrder).toEqual([3, 2, 1]);
    });
  });

  describe("Conditional Branching", () => {
    it("should execute then branch when condition is true", async () => {
      const wf = workflow(uniqueWorkflowName("test"))
        .describe("Test workflow")
        .input({ shouldTakeThen: z.boolean() })
        .branch("branch1", {
          when: (ctx) => (ctx.input as { shouldTakeThen: boolean }).shouldTakeThen,
          then: [customStep(async () => ({ result: "then" }))],
          else: [customStep(async () => ({ result: "else" }))],
        })
        .build();

      const result = await wf.handler({ shouldTakeThen: true }, mockToolContext);

      expect(result).toEqual({
        branch1: [{ result: "then" }],
      });
    });

    it("should execute else branch when condition is false", async () => {
      const wf = workflow(uniqueWorkflowName("test"))
        .describe("Test workflow")
        .input({ shouldTakeThen: z.boolean() })
        .branch("branch1", {
          when: (ctx) => (ctx.input as { shouldTakeThen: boolean }).shouldTakeThen,
          then: [customStep(async () => ({ result: "then" }))],
          else: [customStep(async () => ({ result: "else" }))],
        })
        .build();

      const result = await wf.handler({ shouldTakeThen: false }, mockToolContext);

      expect(result).toEqual({
        branch1: [{ result: "else" }],
      });
    });

    it("should handle async condition", async () => {
      const wf = workflow(uniqueWorkflowName("test"))
        .describe("Test workflow")
        .input({ value: z.number() })
        .branch("branch1", {
          when: async (ctx) => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            return (ctx.input as { value: number }).value > 5;
          },
          then: [customStep(async () => ({ result: "high" }))],
          else: [customStep(async () => ({ result: "low" }))],
        })
        .build();

      const result1 = await wf.handler({ value: 10 }, mockToolContext);
      expect(result1).toEqual({ branch1: [{ result: "high" }] });

      const result2 = await wf.handler({ value: 3 }, mockToolContext);
      expect(result2).toEqual({ branch1: [{ result: "low" }] });
    });
  });

  describe("Error Handling", () => {
    it("should fail workflow by default on step error", async () => {
      const wf = workflow(uniqueWorkflowName("test"))
        .describe("Test workflow")
        .input({ value: z.string() })
        .step(
          "failing",
          customStep(async () => {
            throw new Error("Step failed");
          })
        )
        .build();

      await expect(wf.handler({ value: "test" }, mockToolContext)).rejects.toThrow();
    });

    it("should skip step when onError is skip", async () => {
      const wf = workflow(uniqueWorkflowName("test"))
        .describe("Test workflow")
        .input({ value: z.string() })
        .step(
          "failing",
          customStep(async () => {
            throw new Error("Step failed");
          }),
          { onError: "skip" }
        )
        .step(
          "next",
          customStep(async () => ({ result: "ok" }))
        )
        .build();

      const result = await wf.handler({ value: "test" }, mockToolContext);

      expect(result).toEqual({
        failing: undefined,
        next: { result: "ok" },
      });
    });

    it("should use custom error handler", async () => {
      const errorHandler = vi.fn(async (_error, _ctx) => ({ recovered: true }));

      const wf = workflow(uniqueWorkflowName("test"))
        .describe("Test workflow")
        .input({ value: z.string() })
        .step(
          "failing",
          customStep(async () => {
            throw new Error("Step failed");
          }),
          { onError: errorHandler }
        )
        .build();

      const result = await wf.handler({ value: "test" }, mockToolContext);

      expect(errorHandler).toHaveBeenCalled();
      expect(result).toEqual({
        failing: { recovered: true },
      });
    });
  });

  describe("Retry Logic", () => {
    it("should retry failed step with linear backoff", async () => {
      let attempts = 0;

      const wf = workflow(uniqueWorkflowName("test"))
        .describe("Test workflow")
        .input({ value: z.string() })
        .step(
          "retrying",
          customStep(async () => {
            attempts++;
            if (attempts < 3) {
              throw new Error("Not yet");
            }
            return { success: true };
          }),
          {
            retry: { maxAttempts: 3, delay: 10, backoff: "linear" },
          }
        )
        .build();

      const result = await wf.handler({ value: "test" }, mockToolContext);

      expect(attempts).toBe(3);
      expect(result).toEqual({
        retrying: { success: true },
      });
    });

    it("should retry with exponential backoff", async () => {
      let attempts = 0;
      const delays: number[] = [];
      let lastTime = Date.now();

      const wf = workflow(uniqueWorkflowName("test"))
        .describe("Test workflow")
        .input({ value: z.string() })
        .step(
          "retrying",
          customStep(async () => {
            attempts++;
            const now = Date.now();
            if (attempts > 1) {
              delays.push(now - lastTime);
            }
            lastTime = now;

            if (attempts < 3) {
              throw new Error("Not yet");
            }
            return { success: true };
          }),
          {
            retry: { maxAttempts: 3, delay: 10, backoff: "exponential" },
          }
        )
        .build();

      await wf.handler({ value: "test" }, mockToolContext);

      expect(attempts).toBe(3);
      // Exponential backoff: ~10ms, ~20ms
      expect(delays.length).toBe(2);
      expect(delays[1]).toBeGreaterThan(delays[0]!);
    });

    it("should respect maxDelay for exponential backoff", async () => {
      let attempts = 0;

      const wf = workflow(uniqueWorkflowName("test"))
        .describe("Test workflow")
        .input({ value: z.string() })
        .step(
          "retrying",
          customStep(async () => {
            attempts++;
            if (attempts < 5) {
              throw new Error("Not yet");
            }
            return { success: true };
          }),
          {
            retry: {
              maxAttempts: 5,
              delay: 10,
              backoff: "exponential",
              maxDelay: 50,
            },
          }
        )
        .build();

      const startTime = Date.now();
      await wf.handler({ value: "test" }, mockToolContext);
      const duration = Date.now() - startTime;

      // With exponential: 10, 20, 40, 80 (capped at 50)
      // So total ~= 10 + 20 + 50 + 50 = 130ms
      expect(duration).toBeLessThan(200); // Should be capped
    });
  });

  describe("Step Configuration", () => {
    it("should map input using mapInput", async () => {
      const wf = workflow(uniqueWorkflowName("test"))
        .describe("Test workflow")
        .input({ a: z.number(), b: z.number() })
        .step(
          "multiply",
          customStep(async (ctx: WorkflowContext) => ({
            result: (ctx.input as { product: number }).product * 2,
          })),
          {
            mapInput: (ctx) => ({
              product:
                (ctx.input as { a: number; b: number }).a *
                (ctx.input as { a: number; b: number }).b,
            }),
          }
        )
        .build();

      const result = await wf.handler({ a: 3, b: 4 }, mockToolContext);

      expect(result).toEqual({
        multiply: { result: 24 }, // (3 * 4) * 2
      });
    });

    it("should enforce timeout", async () => {
      const wf = workflow(uniqueWorkflowName("test"))
        .describe("Test workflow")
        .input({ value: z.string() })
        .step(
          "slow",
          customStep(async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            return { result: "ok" };
          }),
          { timeout: 50 }
        )
        .build();

      await expect(wf.handler({ value: "test" }, mockToolContext)).rejects.toThrow();
    });
  });
});

// =============================================================================
// STEP HELPER TESTS
// =============================================================================

describe("Step Helpers", () => {
  describe("toolStep", () => {
    it("should create tool step", () => {
      const step = toolStep("my_tool");

      expect(step.type).toBe("tool");
      expect(step.toolName).toBe("my_tool");
    });

    it("should accept configuration", () => {
      const step = toolStep("my_tool", {
        retry: { maxAttempts: 3 },
      });

      expect(step.config?.retry?.maxAttempts).toBe(3);
    });
  });

  describe("customStep", () => {
    it("should create custom step", () => {
      const handler = async () => ({ result: "ok" });
      const step = customStep(handler);

      expect(step.type).toBe("custom");
      expect(step.handler).toBe(handler);
    });

    it("should accept configuration", () => {
      const step = customStep(async () => ({ result: "ok" }), {
        timeout: 5000,
      });

      expect(step.config?.timeout).toBe(5000);
    });
  });

  describe("externalStep", () => {
    it("should create external step", () => {
      const step = externalStep({
        server: "mcp://server",
        tool: "tool_name",
      });

      expect(step.type).toBe("external");
      expect(step.server).toBe("mcp://server");
      expect(step.toolName).toBe("tool_name");
    });

    it("should accept configuration", () => {
      const step = externalStep({
        server: "mcp://server",
        tool: "tool_name",
        retry: { maxAttempts: 2 },
      });

      expect(step.config?.retry?.maxAttempts).toBe(2);
    });
  });
});
