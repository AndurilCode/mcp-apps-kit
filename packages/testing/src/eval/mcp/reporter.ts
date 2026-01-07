/**
 * MCP Eval Reporter
 *
 * Provides formatted output for MCP evaluation results.
 */

import type { ToolCallRecord, JudgeResult } from "./evaluator";

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
   * Report duration
   */
  reportDuration(duration: number): void {
    if (!this.verbose) return;
    console.log(color("  Duration:", colors.gray), `${duration}ms`);
  }

  /**
   * Report judgment result
   */
  reportJudgment(judgment: JudgeResult): void {
    if (!this.verbose) return;
    
    const status = judgment.pass 
      ? color("[PASS]", colors.green)
      : color("[FAIL]", colors.red);
    const score = `${(judgment.score * 100).toFixed(0)}%`;
    
    console.log(
      color("  Judge:", colors.gray),
      status,
      color(`(${score})`, colors.dim),
      "-",
      judgment.explanation
    );
  }

  /**
   * Report a complete evaluation result
   */
  reportResult(
    prompt: string,
    toolCalls: ToolCallRecord[],
    response: string,
    duration: number
  ): void {
    this.reportStart(prompt);
    this.reportToolCalls(toolCalls);
    this.reportResponse(response);
    this.reportDuration(duration);
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
