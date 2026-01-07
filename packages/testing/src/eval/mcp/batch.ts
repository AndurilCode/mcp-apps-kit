/**
 * Batch Evaluation for MCP Eval
 * 
 * Run multiple evaluations and aggregate results.
 */

import type { MCPEvaluator, MCPEvalResult, TokenUsage, ToolCallRecord, JudgeResult } from "./evaluator";
import { getReporter } from "./reporter";
import { llmLogger } from "../../debug";

/**
 * A single evaluation case in a batch
 */
export interface BatchEvalCase {
  /** Optional name for the case */
  name?: string;
  /** The prompt to evaluate */
  prompt: string;
  /** Expected tool call (for automatic assertion) */
  expect?: {
    /** Expected tool name */
    tool?: string;
    /** Expected tool arguments (partial match) */
    args?: Record<string, unknown>;
    /** Expected number of tool calls */
    toolCallCount?: number;
  };
  /** Criteria for LLM judge */
  judgeCriteria?: string;
  /** Per-case error injection */
  injectError?: {
    tool: string;
    error: string;
  };
}

/**
 * Result of a single case in the batch
 */
export interface BatchCaseResult {
  /** Case name or index */
  name: string;
  /** The prompt */
  prompt: string;
  /** Whether the case passed all checks */
  passed: boolean;
  /** Full evaluation result */
  result: MCPEvalResult;
  /** Tool call assertion result (if expect was provided) */
  toolAssertion?: {
    passed: boolean;
    expected: BatchEvalCase["expect"];
    actual: ToolCallRecord[];
    reason?: string;
  };
  /** Judge result (if judgeCriteria was provided) */
  judgeResult?: JudgeResult;
  /** Duration for this case */
  duration: number;
}

/**
 * Summary of a batch evaluation
 */
export interface BatchSummary {
  /** Total number of cases */
  total: number;
  /** Number of passed cases */
  passed: number;
  /** Number of failed cases */
  failed: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Total duration for all cases */
  totalDuration: number;
  /** Average duration per case */
  avgDuration: number;
  /** Total token usage */
  totalUsage?: TokenUsage;
  /** Tool usage statistics */
  toolStats: Record<string, { calls: number; successes: number; failures: number }>;
}

/**
 * Result of a batch evaluation
 */
export interface BatchResult {
  /** Summary statistics */
  summary: BatchSummary;
  /** Individual case results */
  results: BatchCaseResult[];
  /** Failed cases for quick access */
  failures: BatchCaseResult[];
}

/**
 * Options for batch evaluation
 */
export interface BatchOptions {
  /** Run cases in parallel (default: false for rate limiting) */
  parallel?: boolean;
  /** Stop on first failure (default: false) */
  stopOnFailure?: boolean;
  /** Delay between cases in ms (default: 0) */
  delayBetweenCases?: number;
  /** Print verbose output during run (default: true) */
  verbose?: boolean;
  /** Print summary after completion (default: true) */
  printSummary?: boolean;
}

/**
 * Check if tool calls match expected criteria
 */
function checkToolAssertion(
  toolCalls: ToolCallRecord[],
  expected: NonNullable<BatchEvalCase["expect"]>
): { passed: boolean; reason?: string } {
  // Check tool call count
  if (expected.toolCallCount !== undefined && toolCalls.length !== expected.toolCallCount) {
    return {
      passed: false,
      reason: `Expected ${expected.toolCallCount} tool calls, got ${toolCalls.length}`,
    };
  }

  // Check specific tool
  if (expected.tool) {
    const matchingCalls = toolCalls.filter((tc) => tc.name === expected.tool);
    if (matchingCalls.length === 0) {
      return {
        passed: false,
        reason: `Expected tool "${expected.tool}" was not called`,
      };
    }

    // Check args if specified
    if (expected.args) {
      const argsMatch = matchingCalls.some((tc) => {
        return Object.entries(expected.args!).every(([key, value]) => {
          return tc.args[key] === value;
        });
      });

      if (!argsMatch) {
        return {
          passed: false,
          reason: `Tool "${expected.tool}" was called but args didn't match`,
        };
      }
    }
  }

  return { passed: true };
}

/**
 * Sleep for a duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a batch of evaluations
 * 
 * @param evaluator - The MCP evaluator to use
 * @param cases - Array of evaluation cases
 * @param options - Batch options
 * @returns Batch result with summary and individual results
 * 
 * @example
 * ```typescript
 * const batch = await runBatch(mcpEval, [
 *   { prompt: "Greet Alice", expect: { tool: "greet", args: { name: "Alice" } } },
 *   { prompt: "Greet Bob", expect: { tool: "greet", args: { name: "Bob" } } },
 * ]);
 * 
 * expect(batch.summary.successRate).toBe(1.0);
 * ```
 */
export async function runBatch(
  evaluator: MCPEvaluator,
  cases: BatchEvalCase[],
  options: BatchOptions = {}
): Promise<BatchResult> {
  const verbose = options.verbose ?? true;
  const printSummary = options.printSummary ?? true;
  const reporter = getReporter(verbose);

  const results: BatchCaseResult[] = [];
  const failures: BatchCaseResult[] = [];
  
  // Track total usage
  let totalUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  // Track tool statistics
  const toolStats: Record<string, { calls: number; successes: number; failures: number }> = {};

  llmLogger("Starting batch evaluation with %d cases", cases.length);
  const batchStartTime = Date.now();

  // Helper function to run a single case
  async function runCase(evalCase: BatchEvalCase, index: number): Promise<BatchCaseResult> {
    const caseName = evalCase.name ?? `Case ${index + 1}`;
    const caseStartTime = Date.now();

    llmLogger("Running batch case: %s", caseName);

    // Run the evaluation
    const result = await evaluator.run(evalCase.prompt, {
      injectError: evalCase.injectError,
    });

    // Track tool usage
    for (const tc of result.toolCalls) {
      let stats = toolStats[tc.name];
      if (!stats) {
        stats = { calls: 0, successes: 0, failures: 0 };
        toolStats[tc.name] = stats;
      }
      stats.calls++;
      if (tc.success) {
        stats.successes++;
      } else {
        stats.failures++;
      }
    }

    // Track usage and aggregate costs
    if (result.usage) {
      totalUsage.promptTokens += result.usage.promptTokens;
      totalUsage.completionTokens += result.usage.completionTokens;
      totalUsage.totalTokens += result.usage.totalTokens;
      
      // Aggregate estimated costs from individual results
      if (result.usage.estimatedCost) {
        const costStr = result.usage.estimatedCost.replace(/[$¢]/g, "");
        const cost = parseFloat(costStr) || 0;
        totalUsage.estimatedCost = `$${((parseFloat(totalUsage.estimatedCost?.replace(/[$¢]/g, "") || "0") + cost)).toFixed(6)}`;
      }
    }

    // Check tool assertions
    let toolAssertion: BatchCaseResult["toolAssertion"];
    let toolPassed = true;
    if (evalCase.expect) {
      const assertion = checkToolAssertion(result.toolCalls, evalCase.expect);
      toolAssertion = {
        passed: assertion.passed,
        expected: evalCase.expect,
        actual: result.toolCalls,
        reason: assertion.reason,
      };
      toolPassed = assertion.passed;
    }

    // Run judge if criteria provided
    let judgeResult: JudgeResult | undefined;
    let judgePassed = true;
    if (evalCase.judgeCriteria) {
      judgeResult = await result.judge(evalCase.judgeCriteria);
      judgePassed = judgeResult.pass;
    }

    const duration = Date.now() - caseStartTime;
    const passed = toolPassed && judgePassed;

    return {
      name: caseName,
      prompt: evalCase.prompt,
      passed,
      result,
      toolAssertion,
      judgeResult,
      duration,
    };
  }

  // Run cases (sequential or parallel)
  if (options.parallel) {
    // Run all cases in parallel
    const caseResults = await Promise.all(
      cases.map((evalCase, index) => runCase(evalCase, index))
    );
    results.push(...caseResults);
  } else {
    // Run cases sequentially with progress reporting
    let passedCount = 0;
    for (let i = 0; i < cases.length; i++) {
      const evalCase = cases[i]!;
      const caseResult = await runCase(evalCase, i);
      results.push(caseResult);

      if (caseResult.passed) {
        passedCount++;
      } else {
        failures.push(caseResult);
        if (options.stopOnFailure) {
          llmLogger("Stopping batch due to failure: %s", caseResult.name);
          break;
        }
      }

      // Report progress
      reporter.reportBatchProgress(i + 1, cases.length, passedCount);

      // Delay between cases
      if (options.delayBetweenCases && i < cases.length - 1) {
        await sleep(options.delayBetweenCases);
      }
    }
  }

  // Build summary
  const totalDuration = Date.now() - batchStartTime;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  // No additional cost calculation needed - costs are aggregated from individual results

  const summary: BatchSummary = {
    total: results.length,
    passed,
    failed,
    successRate: results.length > 0 ? passed / results.length : 0,
    totalDuration,
    avgDuration: results.length > 0 ? totalDuration / results.length : 0,
    totalUsage: totalUsage.totalTokens > 0 ? totalUsage : undefined,
    toolStats,
  };

  llmLogger(
    "Batch complete: %d/%d passed (%.0f%%) in %dms",
    passed,
    results.length,
    summary.successRate * 100,
    totalDuration
  );

  const batchResult: BatchResult = {
    summary,
    results,
    failures: results.filter((r) => !r.passed),
  };

  // Print summary if enabled
  if (printSummary) {
    reporter.reportBatchSummary(batchResult);
  }

  return batchResult;
}

/**
 * Add runBatch method to an evaluator
 */
export function extendWithBatch(evaluator: MCPEvaluator): MCPEvaluator & {
  runBatch: (cases: BatchEvalCase[], options?: BatchOptions) => Promise<BatchResult>;
} {
  return {
    ...evaluator,
    runBatch: (cases: BatchEvalCase[], options?: BatchOptions) => runBatch(evaluator, cases, options),
  };
}
