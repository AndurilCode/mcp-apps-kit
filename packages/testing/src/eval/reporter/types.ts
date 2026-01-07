/**
 * Types for Eval Reporter
 */

import type { EvaluationResult, EvalOptions } from "../../types";

/**
 * Options for the eval reporter
 */
export interface EvalReporterOptions {
  /** Enable verbose output (includes raw LLM response) */
  verbose?: boolean;
  /** Custom output stream (default: console) */
  output?: EvalReporterOutput;
  /** Include timestamp in reports */
  showTimestamp?: boolean;
  /** Show color-coded output (default: true if terminal supports colors) */
  colors?: boolean;
  /** Minimum score to highlight as warning (default: 0.5) */
  warningThreshold?: number;
}

/**
 * Output interface for reporter
 */
export interface EvalReporterOutput {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Single evaluation report entry
 */
export interface EvalReportEntry {
  /** Test name */
  testName: string;
  /** Tool name being evaluated */
  toolName?: string;
  /** Input to the tool */
  input?: unknown;
  /** Output from the tool */
  output: unknown;
  /** Evaluation result */
  evaluation: EvaluationResult;
  /** Evaluation options used */
  options: EvalOptions;
  /** Duration of evaluation in ms */
  duration: number;
  /** Timestamp of evaluation */
  timestamp: Date;
}

/**
 * Summary of all evaluations
 */
export interface EvalReportSummary {
  /** Total evaluations run */
  total: number;
  /** Evaluations that passed */
  passed: number;
  /** Evaluations that failed */
  failed: number;
  /** Average overall score */
  averageScore: number;
  /** Total duration in ms */
  totalDuration: number;
  /** Individual entries */
  entries: EvalReportEntry[];
}
