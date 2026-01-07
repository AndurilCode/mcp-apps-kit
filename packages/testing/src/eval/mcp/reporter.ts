/**
 * MCP Eval Reporter
 *
 * Provides formatted output for MCP evaluation results.
 */

import type { ToolCallRecord, JudgeResult, TokenUsage } from "./evaluator";
import type { BatchResult, BatchCaseResult } from "./batch";

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  blue: "\x1b[34m",
};

function shouldUseColors(): boolean {
  if (process.env.NO_COLOR || process.env.CI) {
    return false;
  }
  return process.stdout?.isTTY ?? false;
}

const useColors = shouldUseColors();

function color(text: string, colorCode: string): string {
  if (!useColors) return text;
  return `${colorCode}${text}${colors.reset}`;
}

/**
 * Format a percentage with color based on value
 */
function formatPercent(value: number): string {
  const percent = `${(value * 100).toFixed(0)}%`;
  if (value >= 0.9) return color(percent, colors.green);
  if (value >= 0.7) return color(percent, colors.yellow);
  return color(percent, colors.red);
}

/**
 * MCP Eval Reporter - formats and outputs evaluation results
 */
export class MCPEvalReporter {
  private verbose: boolean;

  constructor(verbose: boolean = true) {
    this.verbose = verbose;
  }

  /**
   * Report the start of an evaluation
   */
  reportStart(prompt: string): void {
    if (!this.verbose) return;
    console.log("");
    console.log(color(`[MCP EVAL]`, colors.cyan), color(prompt, colors.bold));
  }

  /**
   * Report tool calls made by the LLM
   */
  reportToolCalls(toolCalls: ToolCallRecord[]): void {
    if (!this.verbose) return;

    const callStrs = toolCalls.map((tc) => {
      const status = tc.success ? color("✓", colors.green) : color("✗", colors.red);
      return `${status} ${tc.name}(${JSON.stringify(tc.args)})`;
    });

    console.log(color("  Tools:", colors.gray), callStrs.join(", "));
  }

  /**
   * Report the agent's response
   */
  reportResponse(response: string): void {
    if (!this.verbose) return;
    console.log(color("  Response:", colors.gray), response);
  }

  /**
   * Report duration and token usage
   */
  reportDuration(duration: number, usage?: TokenUsage): void {
    if (!this.verbose) return;

    let durationStr = `${duration}ms`;
    if (usage) {
      const tokenStr = `${usage.totalTokens} tokens`;
      const costStr = usage.estimatedCost ? `, ~${usage.estimatedCost}` : "";
      durationStr = `${duration}ms | ${tokenStr}${costStr}`;
    }

    console.log(color("  Duration:", colors.gray), durationStr);
  }

  /**
   * Report judgment result (single or multi-criteria)
   */
  reportJudgment(judgment: JudgeResult): void {
    if (!this.verbose) return;

    const status = judgment.pass ? color("[PASS]", colors.green) : color("[FAIL]", colors.red);
    const score = formatPercent(judgment.score);

    console.log(
      color("  Judge:", colors.gray),
      status,
      color(`(${score})`, colors.dim),
      "-",
      judgment.explanation
    );

    // Report multi-criteria results if present
    if (judgment.criteria) {
      for (const [name, criterion] of Object.entries(judgment.criteria)) {
        const criterionStatus = criterion.pass
          ? color("✓", colors.green)
          : color("✗", colors.red);
        console.log(
          color(`    ${name}:`, colors.gray),
          criterionStatus,
          formatPercent(criterion.score),
          "-",
          criterion.explanation
        );
      }
    }
  }

  /**
   * Report a complete evaluation result
   */
  reportResult(
    prompt: string,
    toolCalls: ToolCallRecord[],
    response: string,
    duration: number,
    usage?: TokenUsage
  ): void {
    this.reportStart(prompt);
    this.reportToolCalls(toolCalls);
    this.reportResponse(response);
    this.reportDuration(duration, usage);
  }

  /**
   * Report batch evaluation summary
   */
  reportBatchSummary(result: BatchResult): void {
    console.log("");
    console.log(color("═".repeat(50), colors.dim));
    console.log(color("MCP Eval Summary", colors.cyan + colors.bold));
    console.log(color("═".repeat(50), colors.dim));

    const { summary } = result;

    // Main stats
    const passedStr = color(String(summary.passed), colors.green);
    const failedStr = summary.failed > 0 
      ? color(String(summary.failed), colors.red)
      : String(summary.failed);
    console.log(
      `Total: ${summary.total} | Passed: ${passedStr} | Failed: ${failedStr} | Success Rate: ${formatPercent(summary.successRate)}`
    );

    // Tool usage
    if (Object.keys(summary.toolStats).length > 0) {
      console.log("");
      console.log(color("Tool Usage:", colors.cyan));
      for (const [tool, stats] of Object.entries(summary.toolStats)) {
        const successRate = stats.calls > 0 ? stats.successes / stats.calls : 0;
        console.log(
          `  ${tool}: ${stats.calls} calls (${formatPercent(successRate)} success)`
        );
      }
    }

    // Token usage
    if (summary.totalUsage) {
      console.log("");
      console.log(color("Token Usage:", colors.cyan));
      console.log(
        `  Total: ${summary.totalUsage.totalTokens.toLocaleString()} tokens`,
        summary.totalUsage.estimatedCost ? `| Est. Cost: ${summary.totalUsage.estimatedCost}` : ""
      );
    }

    // Duration
    console.log("");
    console.log(color("Duration:", colors.cyan));
    console.log(
      `  Total: ${summary.totalDuration}ms | Avg: ${summary.avgDuration.toFixed(0)}ms per case`
    );

    // Failed tests
    if (result.failures.length > 0) {
      console.log("");
      console.log(color("Failed Tests:", colors.red));
      for (const failure of result.failures) {
        const reason = this.getFailureReason(failure);
        console.log(color(`  ✗ ${failure.name}`, colors.red), "-", reason);
      }
    }

    console.log(color("═".repeat(50), colors.dim));
    console.log("");
  }

  /**
   * Get a human-readable reason for failure
   */
  private getFailureReason(failure: BatchCaseResult): string {
    if (failure.toolAssertion && !failure.toolAssertion.passed) {
      return failure.toolAssertion.reason ?? "Tool assertion failed";
    }
    if (failure.judgeResult && !failure.judgeResult.pass) {
      return `Judge: ${failure.judgeResult.explanation}`;
    }
    return "Unknown failure";
  }

  /**
   * Report batch case result (for verbose output)
   */
  reportBatchCase(caseResult: BatchCaseResult, index: number): void {
    if (!this.verbose) return;

    const status = caseResult.passed
      ? color("[PASS]", colors.green)
      : color("[FAIL]", colors.red);

    console.log(`  ${index + 1}. ${caseResult.name}: ${status}`);

    if (!caseResult.passed) {
      const reason = this.getFailureReason(caseResult);
      console.log(color(`     └─ ${reason}`, colors.gray));
    }
  }

  /**
   * Print a simple progress indicator for batch runs
   */
  reportBatchProgress(current: number, total: number, passed: number): void {
    if (!this.verbose) return;

    const percent = ((current / total) * 100).toFixed(0);
    const bar = "█".repeat(Math.floor(current / total * 20)) + 
                "░".repeat(20 - Math.floor(current / total * 20));
    
    // Use carriage return to overwrite line (works in TTY)
    if (process.stdout?.isTTY) {
      process.stdout.write(
        `\r[${bar}] ${current}/${total} (${percent}%) - ${passed} passed`
      );
      if (current === total) {
        console.log(""); // New line when done
      }
    }
  }
}

// Singleton reporter instance
let defaultReporter: MCPEvalReporter | null = null;

/**
 * Get or create the default reporter
 */
export function getReporter(verbose: boolean = true): MCPEvalReporter {
  if (!defaultReporter || defaultReporter["verbose"] !== verbose) {
    defaultReporter = new MCPEvalReporter(verbose);
  }
  return defaultReporter;
}

/**
 * Print a standalone batch summary (convenience function)
 */
export function printBatchSummary(result: BatchResult): void {
  const reporter = getReporter(true);
  reporter.reportBatchSummary(result);
}

/**
 * Collected result from an individual eval run
 */
export interface CollectedResult {
  prompt: string;
  toolCalls: ToolCallRecord[];
  response: string;
  duration: number;
  usage?: TokenUsage;
  judgeResult?: JudgeResult;
  testName?: string;
}

/**
 * Global results collector for aggregating eval results across tests
 */
class GlobalResultsCollector {
  private results: CollectedResult[] = [];
  private startTime: number = Date.now();

  /**
   * Add a result to the collection
   */
  add(result: CollectedResult): void {
    this.results.push(result);
  }

  /**
   * Get all collected results
   */
  getResults(): CollectedResult[] {
    return [...this.results];
  }

  /**
   * Clear all collected results
   */
  clear(): void {
    this.results = [];
    this.startTime = Date.now();
  }

  /**
   * Print a global summary of all collected results
   */
  printSummary(): void {
    if (this.results.length === 0) {
      console.log(color("\n[MCP Eval] No results collected\n", colors.gray));
      return;
    }

    const totalDuration = Date.now() - this.startTime;
    
    // Aggregate stats
    let totalTokens = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCost = 0;
    let hasCost = false;
    const toolStats: Record<string, { calls: number; successes: number; failures: number }> = {};
    let judgePassCount = 0;
    let judgeFailCount = 0;

    for (const result of this.results) {
      // Token usage
      if (result.usage) {
        totalTokens += result.usage.totalTokens;
        totalPromptTokens += result.usage.promptTokens;
        totalCompletionTokens += result.usage.completionTokens;
        
        if (result.usage.estimatedCost) {
          hasCost = true;
          const costStr = result.usage.estimatedCost.replace(/[$¢]/g, "");
          totalCost += parseFloat(costStr) || 0;
        }
      }

      // Tool usage
      for (const tc of result.toolCalls) {
        if (!toolStats[tc.name]) {
          toolStats[tc.name] = { calls: 0, successes: 0, failures: 0 };
        }
        const stats = toolStats[tc.name]!;
        stats.calls++;
        if (tc.success) {
          stats.successes++;
        } else {
          stats.failures++;
        }
      }

      // Judge results
      if (result.judgeResult) {
        if (result.judgeResult.pass) {
          judgePassCount++;
        } else {
          judgeFailCount++;
        }
      }
    }

    // Print summary
    console.log("");
    console.log(color("╔" + "═".repeat(58) + "╗", colors.cyan));
    console.log(color("║", colors.cyan) + color("  MCP EVAL GLOBAL SUMMARY".padEnd(58), colors.bold) + color("║", colors.cyan));
    console.log(color("╚" + "═".repeat(58) + "╝", colors.cyan));
    console.log("");

    // Overview
    console.log(color("Overview:", colors.cyan));
    console.log(`  Total Evaluations: ${this.results.length}`);
    console.log(`  Total Duration: ${(totalDuration / 1000).toFixed(1)}s`);
    console.log(`  Avg Duration: ${(this.results.reduce((a, r) => a + r.duration, 0) / this.results.length).toFixed(0)}ms per eval`);
    console.log("");

    // Token usage
    if (totalTokens > 0) {
      console.log(color("Token Usage:", colors.cyan));
      console.log(`  Total: ${totalTokens.toLocaleString()} tokens`);
      console.log(`  Input: ${totalPromptTokens.toLocaleString()} | Output: ${totalCompletionTokens.toLocaleString()}`);
      if (hasCost) {
        console.log(`  Est. Cost: $${totalCost.toFixed(6)}`);
      }
      console.log("");
    }

    // Tool usage
    if (Object.keys(toolStats).length > 0) {
      console.log(color("Tool Usage:", colors.cyan));
      for (const [tool, stats] of Object.entries(toolStats)) {
        const successRate = stats.calls > 0 ? stats.successes / stats.calls : 0;
        console.log(
          `  ${tool}: ${stats.calls} calls (${formatPercent(successRate)} success)`
        );
      }
      console.log("");
    }

    // Judge results
    if (judgePassCount + judgeFailCount > 0) {
      const total = judgePassCount + judgeFailCount;
      const passRate = judgePassCount / total;
      console.log(color("Judge Results:", colors.cyan));
      console.log(
        `  Passed: ${color(String(judgePassCount), colors.green)} | ` +
        `Failed: ${color(String(judgeFailCount), judgeFailCount > 0 ? colors.red : colors.green)} | ` +
        `Pass Rate: ${formatPercent(passRate)}`
      );
      console.log("");
    }

    console.log(color("─".repeat(60), colors.dim));
    console.log("");
  }

  /**
   * Get summary statistics without printing
   */
  getSummary(): {
    totalEvals: number;
    totalTokens: number;
    totalCost: number;
    toolStats: Record<string, { calls: number; successes: number; failures: number }>;
    judgeStats: { passed: number; failed: number };
  } {
    let totalTokens = 0;
    let totalCost = 0;
    const toolStats: Record<string, { calls: number; successes: number; failures: number }> = {};
    let passed = 0;
    let failed = 0;

    for (const result of this.results) {
      if (result.usage) {
        totalTokens += result.usage.totalTokens;
        if (result.usage.estimatedCost) {
          const costStr = result.usage.estimatedCost.replace(/[$¢]/g, "");
          totalCost += parseFloat(costStr) || 0;
        }
      }

      for (const tc of result.toolCalls) {
        if (!toolStats[tc.name]) {
          toolStats[tc.name] = { calls: 0, successes: 0, failures: 0 };
        }
        const stats = toolStats[tc.name]!;
        stats.calls++;
        if (tc.success) stats.successes++;
        else stats.failures++;
      }

      if (result.judgeResult) {
        if (result.judgeResult.pass) passed++;
        else failed++;
      }
    }

    return {
      totalEvals: this.results.length,
      totalTokens,
      totalCost,
      toolStats,
      judgeStats: { passed, failed },
    };
  }
}

// Global collector singleton
const globalCollector = new GlobalResultsCollector();

/**
 * Get the global results collector
 * 
 * Use this to collect results across all tests and print a summary at the end.
 * 
 * @example
 * ```typescript
 * import { getGlobalCollector } from "@mcp-apps-kit/testing";
 * 
 * // In afterAll at the top level of your test file:
 * afterAll(() => {
 *   getGlobalCollector().printSummary();
 * });
 * ```
 */
export function getGlobalCollector(): GlobalResultsCollector {
  return globalCollector;
}

/**
 * Clear the global results collector
 */
export function clearGlobalCollector(): void {
  globalCollector.clear();
}

/**
 * Print the global summary (convenience function)
 */
export function printGlobalSummary(): void {
  globalCollector.printSummary();
}
