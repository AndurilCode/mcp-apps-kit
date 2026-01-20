/**
 * Workflow engine type definitions
 *
 * @module workflow/types
 */

import type { z } from "zod";
import type { ToolContext } from "../types/tools";

// =============================================================================
// WORKFLOW CONTEXT
// =============================================================================

/**
 * Function to call a tool defined in the same app
 */
export type ToolCaller = <TOutput = unknown>(toolName: string, input: unknown) => Promise<TOutput>;

/**
 * Function to call a tool from an external MCP server
 */
export type ExternalToolCaller = <TOutput = unknown>(
  server: string,
  toolName: string,
  input: unknown
) => Promise<TOutput>;

/**
 * Workflow context available to all steps
 *
 * Provides access to:
 * - Original workflow input
 * - Accumulated outputs from previous steps
 * - MCP tool context (locale, auth, etc.)
 * - Functions to call other tools
 */
export interface WorkflowContext<TInput = unknown, TOutputs = Record<string, unknown>> {
  /** Original workflow input */
  input: TInput;

  /** Accumulated outputs from previous steps (keyed by step name) */
  outputs: TOutputs;

  /** MCP tool context (locale, userAgent, subject, etc.) */
  toolContext: ToolContext;

  /** Function to call a tool defined in the same app */
  callTool: ToolCaller;

  /** Function to call a tool from an external MCP server */
  callExternalTool: ExternalToolCaller;
}

// =============================================================================
// RETRY CONFIGURATION
// =============================================================================

/**
 * Retry configuration for workflow steps
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (including the initial attempt) */
  maxAttempts: number;

  /** Delay in milliseconds before first retry (default: 1000) */
  delay?: number;

  /** Backoff strategy for retry delays (default: "linear") */
  backoff?: "linear" | "exponential";

  /** Maximum delay in milliseconds (caps exponential backoff) */
  maxDelay?: number;
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

/**
 * Error handler function type
 *
 * @param error - The error that occurred
 * @param context - Current workflow context
 * @returns Optional recovery value or undefined to skip
 */
export type ErrorHandler<TContext = WorkflowContext> = (
  error: Error,
  context: TContext
) => Promise<unknown>;

/**
 * Error handling strategy for workflow steps
 *
 * - "fail": Fail the entire workflow immediately (default)
 * - "skip": Skip this step and continue with undefined output
 * - Custom function: Handle error and optionally provide recovery value
 */
export type ErrorHandling = "fail" | "skip" | ErrorHandler;

// =============================================================================
// STEP CONFIGURATION
// =============================================================================

/**
 * Base configuration for all workflow steps
 */
export interface StepConfig<TContext = WorkflowContext> {
  /** Map workflow context to step input (default: passthrough) */
  mapInput?: (context: TContext) => unknown;

  /** Retry configuration for this step */
  retry?: RetryConfig;

  /** Error handling strategy for this step */
  onError?: ErrorHandling;

  /** Timeout in milliseconds for this step */
  timeout?: number;
}

// =============================================================================
// STEP TYPES
// =============================================================================

/**
 * Tool step - calls a tool defined in the same app
 */
export interface ToolStep<TContext = WorkflowContext> {
  type: "tool";
  toolName: string;
  config?: StepConfig<TContext>;
}

/**
 * Custom step - executes custom async logic
 */
export interface CustomStep<TContext = WorkflowContext> {
  type: "custom";
  handler: (context: TContext) => Promise<unknown>;
  config?: StepConfig<TContext>;
}

/**
 * External step - calls a tool from an external MCP server
 */
export interface ExternalStep<TContext = WorkflowContext> {
  type: "external";
  server: string;
  toolName: string;
  config?: StepConfig<TContext>;
}

/**
 * Parallel step - executes multiple steps concurrently
 */
export interface ParallelStep<TContext = WorkflowContext> {
  type: "parallel";
  steps: Step<TContext>[];
  config?: Omit<StepConfig<TContext>, "mapInput">; // Parallel doesn't map input
}

/**
 * Branch step - conditional execution
 */
export interface BranchStep<TContext = WorkflowContext> {
  type: "branch";
  condition: (context: TContext) => boolean | Promise<boolean>;
  thenSteps: Step<TContext>[];
  elseSteps?: Step<TContext>[];
  config?: Omit<StepConfig<TContext>, "mapInput">; // Branch doesn't map input
}

/**
 * Union type for all step types
 */
export type Step<TContext = WorkflowContext> =
  | ToolStep<TContext>
  | CustomStep<TContext>
  | ExternalStep<TContext>
  | ParallelStep<TContext>
  | BranchStep<TContext>;

// =============================================================================
// WORKFLOW DEFINITION
// =============================================================================

/**
 * Named step in a workflow (step with a name for output tracking)
 */
export interface NamedStep<TContext = WorkflowContext> {
  name: string;
  step: Step<TContext>;
}

/**
 * Internal workflow definition (accumulated by builder)
 */
export interface WorkflowDefinition<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType = z.ZodType,
> {
  name: string;
  description?: string;
  inputSchema: TInput;
  outputSchema?: TOutput;
  steps: NamedStep[];
}

// =============================================================================
// EXECUTION RESULT
// =============================================================================

/**
 * Result of executing a single step
 */
export interface StepExecutionResult {
  /** Step name */
  name: string;

  /** Output value from the step */
  output: unknown;

  /** Execution time in milliseconds */
  duration: number;

  /** Number of retry attempts made */
  retries: number;

  /** Error if step failed (only present if onError is not "fail") */
  error?: Error;

  /** Whether the step was skipped due to error */
  skipped?: boolean;
}

/**
 * Result of executing a workflow
 */
export interface WorkflowExecutionResult {
  /** Final output from the workflow */
  output: unknown;

  /** All step execution results */
  stepResults: StepExecutionResult[];

  /** Total execution time in milliseconds */
  duration: number;

  /** Whether the workflow completed successfully */
  success: boolean;
}
