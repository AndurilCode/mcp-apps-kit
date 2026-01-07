/**
 * Eval Reporter Implementation
 *
 * Provides detailed reporting for LLM evaluation results.
 */

import type { EvaluationResult, EvalOptions, CriterionResult } from "../../types";
import type {
  EvalReporterOptions,
  EvalReporterOutput,
  EvalReportEntry,
  EvalReportSummary,
} from "./types";

// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

/**
 * Default console output implementation
 */
const defaultOutput: EvalReporterOutput = {
  log: (msg: string) => console.log(msg),
  warn: (msg: string) => console.warn(msg),
  error: (msg: string) => console.error(msg),
};

/**
 * Check if colors should be enabled
 */
function shouldUseColors(): boolean {
  // Check for CI environments or explicit NO_COLOR
  if (process.env.NO_COLOR || process.env.CI) {
    return false;
  }
  // Check if stdout is a TTY
  return process.stdout?.isTTY ?? false;
}

/**
 * Eval Reporter class for tracking and formatting evaluation results
 */
export class EvalReporter {
  private entries: EvalReportEntry[] = [];
  private options: Required<EvalReporterOptions>;
  private output: EvalReporterOutput;

  constructor(options: EvalReporterOptions = {}) {
    this.output = options.output ?? defaultOutput;
    this.options = {
      verbose: options.verbose ?? false,
      output: this.output,
      showTimestamp: options.showTimestamp ?? false,
      colors: options.colors ?? shouldUseColors(),
      warningThreshold: options.warningThreshold ?? 0.5,
    };
  }

  /**
   * Apply color to text if colors are enabled
   */
  private color(text: string, colorCode: string): string {
    if (!this.options.colors) {
      return text;
    }
    return `${colorCode}${text}${colors.reset}`;
  }

  /**
   * Format a score as a percentage with color
   */
  private formatScore(score: number, threshold: number = 0.7): string {
    const percentage = `${(score * 100).toFixed(0)}%`;
    if (score >= threshold) {
      return this.color(percentage, colors.green);
    } else if (score >= this.options.warningThreshold) {
      return this.color(percentage, colors.yellow);
    } else {
      return this.color(percentage, colors.red);
    }
  }

  /**
   * Format pass/fail badge
   */
  private formatBadge(pass: boolean): string {
    if (pass) {
      return this.color("[PASS]", colors.green);
    } else {
      return this.color("[FAIL]", colors.red);
    }
  }

  /**
   * Format criterion result as a single compact line
   */
  private formatCriterion(
    criterion: CriterionResult,
    threshold: number = 0.7,
    truncate: boolean = true
  ): string {
    const icon = criterion.pass ? this.color("✓", colors.green) : this.color("✗", colors.red);
    const score = this.formatScore(criterion.score, threshold);
    const name = this.color(criterion.name, colors.bold);
    let explanation = criterion.explanation;
    // Only truncate if not in verbose mode
    if (truncate) {
      const maxLen = 60;
      if (explanation.length > maxLen) {
        explanation = explanation.substring(0, maxLen - 3) + "...";
      }
    }
    return `  ${icon} ${name} ${score} - ${explanation}`;
  }

  /**
   * Report a single evaluation result
   */
  report(
    testName: string,
    output: unknown,
    evaluation: EvaluationResult,
    evalOptions: EvalOptions,
    duration: number
  ): void {
    const entry: EvalReportEntry = {
      testName,
      toolName: evalOptions.context?.toolName,
      input: evalOptions.context?.input,
      output,
      evaluation,
      options: evalOptions,
      duration,
      timestamp: new Date(),
    };

    this.entries.push(entry);
    this.printEntry(entry);
  }

  /**
   * Print a single evaluation entry (compact format)
   */
  private printEntry(entry: EvalReportEntry): void {
    const { testName, toolName, input, evaluation, duration } = entry;

    // Single-line header with status
    const badge = this.formatBadge(evaluation.overall.pass);
    const score = this.formatScore(evaluation.overall.score);
    const tool = toolName ? this.color(`[${toolName}]`, colors.gray) : "";
    const inputStr = input ? this.color(` ${JSON.stringify(input)}`, colors.dim) : "";
    const durationStr = this.color(`${duration}ms`, colors.gray);

    this.output.log("");
    this.output.log(
      `${badge} ${this.color(testName, colors.bold)} ${tool}${inputStr}`
    );
    this.output.log(`  Score: ${score} | Duration: ${durationStr}`);

    // Criteria - don't truncate in verbose mode
    const truncate = !this.options.verbose;
    for (const criterion of Object.values(evaluation.criteria)) {
      const threshold =
        entry.options.criteria.find((c) => c.name === criterion.name)?.threshold ?? 0.7;
      this.output.log(this.formatCriterion(criterion, threshold, truncate));
    }

    // Verbose mode: show output and raw LLM response (full, not truncated)
    if (this.options.verbose) {
      this.output.log(`  ${this.color("Output:", colors.gray)} ${JSON.stringify(entry.output)}`);
      if (evaluation.rawResponse) {
        this.output.log(`  ${this.color("LLM Response:", colors.magenta)}`);
        // Pretty print the JSON response
        try {
          const parsed = JSON.parse(evaluation.rawResponse);
          const formatted = JSON.stringify(parsed, null, 2);
          for (const line of formatted.split("\n")) {
            this.output.log(`    ${line}`);
          }
        } catch {
          // If not valid JSON, just print as-is
          this.output.log(`    ${evaluation.rawResponse}`);
        }
      }
    }
  }

  /**
   * Print summary of all evaluations
   */
  printSummary(): EvalReportSummary {
    const summary = this.getSummary();

    this.output.log("");
    this.output.log(this.color("=".repeat(50), colors.cyan));
    this.output.log(this.color(" EVAL SUMMARY", colors.bold));
    this.output.log(this.color("=".repeat(50), colors.cyan));

    // Stats in a compact format
    const passColor = summary.failed === 0 ? colors.green : colors.yellow;
    const stats = [
      `Total: ${summary.total}`,
      `Passed: ${this.color(String(summary.passed), passColor)}`,
      summary.failed > 0 ? `Failed: ${this.color(String(summary.failed), colors.red)}` : null,
      `Avg: ${this.formatScore(summary.averageScore)}`,
      `Time: ${(summary.totalDuration / 1000).toFixed(1)}s`,
    ]
      .filter(Boolean)
      .join(" | ");

    this.output.log(stats);

    // List failed tests if any
    const failedEntries = summary.entries.filter((e) => !e.evaluation.overall.pass);
    if (failedEntries.length > 0) {
      this.output.log("");
      this.output.log(this.color("Failed:", colors.red));
      for (const entry of failedEntries) {
        const failedCriteria = Object.values(entry.evaluation.criteria)
          .filter((c) => !c.pass)
          .map((c) => c.name)
          .join(", ");
        this.output.log(
          `  ${this.color("✗", colors.red)} ${entry.testName} - ${failedCriteria}`
        );
      }
    }

    this.output.log(this.color("=".repeat(50), colors.cyan));
    this.output.log("");

    return summary;
  }

  /**
   * Get summary without printing
   */
  getSummary(): EvalReportSummary {
    const passed = this.entries.filter((e) => e.evaluation.overall.pass).length;
    const failed = this.entries.filter((e) => !e.evaluation.overall.pass).length;
    const totalScore = this.entries.reduce((sum, e) => sum + e.evaluation.overall.score, 0);
    const totalDuration = this.entries.reduce((sum, e) => sum + e.duration, 0);

    return {
      total: this.entries.length,
      passed,
      failed,
      averageScore: this.entries.length > 0 ? totalScore / this.entries.length : 0,
      totalDuration,
      entries: [...this.entries],
    };
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Get all entries
   */
  getEntries(): EvalReportEntry[] {
    return [...this.entries];
  }
}

/**
 * Create an eval reporter instance
 *
 * @param options - Reporter options
 * @returns EvalReporter instance
 *
 * @example
 * ```typescript
 * const reporter = createEvalReporter();
 *
 * // After each evaluation
 * reporter.report("test name", output, evaluation, options, duration);
 *
 * // At the end of all tests
 * reporter.printSummary();
 * ```
 */
export function createEvalReporter(options: EvalReporterOptions = {}): EvalReporter {
  return new EvalReporter(options);
}
