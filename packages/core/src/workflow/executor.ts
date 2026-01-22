/**
 * Workflow executor - runtime execution engine
 *
 * @module workflow/executor
 */

import type { z } from "zod";
import type { ToolContext } from "../types/tools";
import type {
  WorkflowDefinition,
  WorkflowContext,
  WorkflowExecutionResult,
  StepExecutionResult,
  Step,
  StepConfig,
  ToolStep,
  CustomStep,
  ExternalStep,
  ParallelStep,
  BranchStep,
  NamedStep,
  RetryConfig,
  ErrorHandling,
} from "./types";
import {
  WorkflowExecutionError,
  StepTimeoutError,
  ExternalToolError,
  WorkflowDefinitionError,
  ToolResponseValidationError,
} from "./errors";
import { ExternalToolClient } from "./external-client";

/**
 * Type for a validator function or Zod schema
 */
type Validator<T> = z.ZodType<T> | ((value: unknown) => T);

/**
 * Type guard to check if a validator is a Zod schema
 */
function isZodSchema<T>(validator: Validator<T>): validator is z.ZodType<T> {
  return (
    typeof validator === "object" &&
    validator !== null &&
    "parse" in validator &&
    typeof validator.parse === "function"
  );
}

// =============================================================================
// WORKFLOW EXECUTOR
// =============================================================================

/**
 * Workflow execution engine
 *
 * Handles runtime execution of workflow steps with:
 * - Accumulated context management
 * - Retry logic with configurable backoff
 * - Error handling per step configuration
 * - Parallel execution
 * - Conditional branching
 */
export class WorkflowExecutor {
  private definition: WorkflowDefinition;
  private externalClient: ExternalToolClient;

  constructor(definition: WorkflowDefinition) {
    this.definition = definition;
    this.externalClient = new ExternalToolClient();
  }

  /**
   * Close the executor and release resources
   *
   * This closes all external MCP client connections.
   * Call this method when the executor is no longer needed.
   */
  async close(): Promise<void> {
    await this.externalClient.closeAll();
  }

  /**
   * Execute the workflow with the given input
   *
   * @param input - Workflow input matching the input schema
   * @param toolContext - MCP tool context
   * @returns Workflow execution result
   */
  async execute(input: unknown, toolContext: ToolContext): Promise<WorkflowExecutionResult> {
    const startTime = Date.now();
    const stepResults: StepExecutionResult[] = [];
    const outputs: Record<string, unknown> = {};

    // Validate input
    const validatedInput = this.definition.inputSchema.parse(input);

    // Create workflow context
    const context: WorkflowContext = {
      input: validatedInput,
      outputs,
      toolContext,
      callTool: async <TOutput = unknown>(
        toolName: string,
        toolInput: unknown,
        validator?: Validator<TOutput>
      ): Promise<TOutput> => {
        // Use the internal tool caller from context if available
        if (!toolContext._internalToolCaller) {
          throw new WorkflowExecutionError(
            `Internal tool caller not available. Cannot call tool: ${toolName}`,
            undefined,
            { toolName, input: toolInput }
          );
        }

        // Call the tool via the internal caller
        const result = await toolContext._internalToolCaller(toolName, toolInput, toolContext);

        // Validate the result if a validator is provided
        if (validator) {
          return this.validateToolResponse<TOutput>(result, toolName, validator);
        }

        // No validator provided - return as unknown (caller is responsible for validation)
        return result as TOutput;
      },
      callExternalTool: async <TOutput = unknown>(
        server: string,
        toolName: string,
        toolInput: unknown,
        validator?: Validator<TOutput>
      ): Promise<TOutput> => {
        const result = await this.externalClient.callTool(server, toolName, toolInput);

        // Validate the result if a validator is provided
        if (validator) {
          return this.validateToolResponse<TOutput>(result, `${server}:${toolName}`, validator);
        }

        // No validator provided - return as unknown (caller is responsible for validation)
        return result as TOutput;
      },
    };

    // Execute steps sequentially
    for (const namedStep of this.definition.steps) {
      const result = await this.executeNamedStep(namedStep, context);
      stepResults.push(result);

      // Add step output to context (even if skipped, add undefined)
      outputs[namedStep.name] = result.output;
    }

    // Validate output if schema is provided
    let finalOutput: unknown = outputs;
    if (this.definition.outputSchema) {
      // Check if workflow has no steps but declares an output schema
      if (this.definition.steps.length === 0) {
        throw new WorkflowDefinitionError(
          `Workflow declares an outputSchema but has no steps to produce that output. ` +
            `Add at least one step to the workflow or remove the outputSchema.`,
          {
            hasOutputSchema: true,
            stepsCount: this.definition.steps.length,
          }
        );
      }

      // If output schema is defined, use the last step's output as the final output
      // This allows the workflow to define its final output structure in the last step
      const lastStep = this.definition.steps[this.definition.steps.length - 1];
      const lastStepOutput = lastStep ? outputs[lastStep.name] : outputs;
      finalOutput = this.definition.outputSchema.parse(lastStepOutput);
    }

    return {
      output: finalOutput,
      stepResults,
      duration: Date.now() - startTime,
      success: true,
    };
  }

  /**
   * Validate a tool response using the provided validator
   */
  private validateToolResponse<T>(result: unknown, toolName: string, validator: Validator<T>): T {
    try {
      // Use type guard to check if validator is a Zod schema
      if (isZodSchema(validator)) {
        return validator.parse(result);
      }
      // Otherwise, it must be a validation function
      if (typeof validator === "function") {
        return validator(result);
      }
      throw new Error("Invalid validator: must be a Zod schema or validation function");
    } catch (error) {
      throw new ToolResponseValidationError(
        `Tool response validation failed for "${toolName}": ${(error as Error).message}`,
        toolName,
        { originalError: error, response: result }
      );
    }
  }

  /**
   * Execute a named step
   */
  private async executeNamedStep(
    namedStep: NamedStep,
    context: WorkflowContext
  ): Promise<StepExecutionResult> {
    const startTime = Date.now();
    let retries = 0;

    try {
      // Execute step with retry logic, passing step name for error messages
      const output = await this.executeStepWithRetry(
        namedStep.name,
        namedStep.step,
        context,
        (attempt) => {
          retries = attempt;
        }
      );

      return {
        name: namedStep.name,
        output,
        duration: Date.now() - startTime,
        retries,
      };
    } catch (error) {
      // Step failed after retries
      const stepError = error as Error;

      // Get error handling strategy
      const errorHandling = this.getErrorHandling(namedStep.step);

      if (errorHandling === "skip") {
        // Skip this step and continue
        return {
          name: namedStep.name,
          output: undefined,
          duration: Date.now() - startTime,
          retries,
          error: stepError,
          skipped: true,
        };
      } else if (typeof errorHandling === "function") {
        // Custom error handler
        try {
          const recoveryValue = await errorHandling(stepError, context);
          return {
            name: namedStep.name,
            output: recoveryValue,
            duration: Date.now() - startTime,
            retries,
            error: stepError,
          };
        } catch (handlerError) {
          // Error handler failed, re-throw original error
          throw new WorkflowExecutionError(
            `Step "${namedStep.name}" failed and error handler also failed: ${stepError.message}`,
            namedStep.name,
            { originalError: stepError, handlerError }
          );
        }
      } else {
        // "fail" - propagate error
        throw new WorkflowExecutionError(
          `Step "${namedStep.name}" failed: ${stepError.message}`,
          namedStep.name,
          { originalError: stepError }
        );
      }
    }
  }

  /**
   * Execute a step with retry logic
   *
   * @param onRetry - Callback invoked with the retry number (1, 2, 3, ...) when a retry is about to be performed
   */
  private async executeStepWithRetry(
    stepName: string,
    step: Step,
    context: WorkflowContext,
    onRetry: (retryNumber: number) => void
  ): Promise<unknown> {
    const retryConfig = this.getRetryConfig(step);
    const timeout = this.getTimeout(step);
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < retryConfig.maxAttempts; attempt++) {
      try {
        // Apply timeout if configured
        if (timeout) {
          return await this.executeStepWithTimeout(stepName, step, context, timeout);
        } else {
          return await this.executeStep(step, context);
        }
      } catch (error) {
        lastError = error as Error;

        // If this was the last attempt, throw
        if (attempt >= retryConfig.maxAttempts - 1) {
          throw lastError;
        }

        // Report the retry number (1-based: retry 1, retry 2, etc.)
        onRetry(attempt + 1);

        // Wait before retry
        const delay = this.calculateRetryDelay(attempt, retryConfig);
        await this.sleep(delay);
      }
    }

    // Should never reach here, but just in case
    throw lastError ?? new WorkflowExecutionError("Step failed with unknown error");
  }

  /**
   * Execute a step with timeout
   */
  private async executeStepWithTimeout(
    stepName: string,
    step: Step,
    context: WorkflowContext,
    timeout: number
  ): Promise<unknown> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new StepTimeoutError(stepName, timeout));
      }, timeout);
    });

    try {
      const result = await Promise.race([this.executeStep(step, context), timeoutPromise]);
      return result;
    } finally {
      // Always clear the timer to prevent memory leaks
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: Step, context: WorkflowContext): Promise<unknown> {
    switch (step.type) {
      case "tool":
        return this.executeToolStep(step, context);
      case "custom":
        return this.executeCustomStep(step, context);
      case "external":
        return this.executeExternalStep(step, context);
      case "parallel":
        return this.executeParallelStep(step, context);
      case "branch":
        return this.executeBranchStep(step, context);
      default:
        throw new WorkflowExecutionError(`Unknown step type: ${(step as Step).type}`);
    }
  }

  /**
   * Execute a tool step
   */
  private async executeToolStep(step: ToolStep, context: WorkflowContext): Promise<unknown> {
    // Get input for the tool
    const input = step.config?.mapInput ? step.config.mapInput(context) : context.input;

    // Call the tool using the context's callTool function
    return context.callTool(step.toolName, input);
  }

  /**
   * Execute a custom step
   */
  private async executeCustomStep(step: CustomStep, context: WorkflowContext): Promise<unknown> {
    // Apply mapInput if configured
    if (step.config?.mapInput) {
      // Create modified context with mapped input
      const mappedInput = step.config.mapInput(context);
      const modifiedContext: WorkflowContext = {
        ...context,
        input: mappedInput,
      };
      return step.handler(modifiedContext);
    }

    // Execute the custom handler with original context
    return step.handler(context);
  }

  /**
   * Execute an external step
   */
  private async executeExternalStep(
    step: ExternalStep,
    context: WorkflowContext
  ): Promise<unknown> {
    try {
      // Get input for the tool
      const input = step.config?.mapInput ? step.config.mapInput(context) : context.input;

      // Call the external tool
      return await context.callExternalTool(step.server, step.toolName, input);
    } catch (error) {
      // If error is already an ExternalToolError, rethrow it unchanged to avoid double-wrapping
      if (error instanceof ExternalToolError) {
        throw error;
      }

      // Wrap other errors in ExternalToolError with context
      throw new ExternalToolError((error as Error).message, step.server, step.toolName, {
        originalError: error,
      });
    }
  }

  /**
   * Execute a parallel step
   */
  private async executeParallelStep(
    step: ParallelStep,
    context: WorkflowContext
  ): Promise<unknown> {
    // Execute all steps in parallel
    const results = await Promise.all(
      step.steps.map((childStep) => this.executeStep(childStep, context))
    );

    // Return array of results
    return results;
  }

  /**
   * Execute a branch step
   */
  private async executeBranchStep(step: BranchStep, context: WorkflowContext): Promise<unknown> {
    // Evaluate condition
    const conditionResult = await step.condition(context);

    // Execute appropriate branch
    const stepsToExecute = conditionResult ? step.thenSteps : (step.elseSteps ?? []);

    // Execute branch steps sequentially
    const results: unknown[] = [];
    for (const childStep of stepsToExecute) {
      const result = await this.executeStep(childStep, context);
      results.push(result);
    }

    // Return array of results (or undefined if no steps executed)
    return results.length > 0 ? results : undefined;
  }

  /**
   * Get step configuration (all step types have a config property)
   */
  private getStepConfig(step: Step): StepConfig | undefined {
    return step.config;
  }

  /**
   * Get retry configuration for a step
   */
  private getRetryConfig(step: Step): Required<RetryConfig> {
    const config = this.getStepConfig(step);

    return {
      maxAttempts: config?.retry?.maxAttempts ?? 1,
      delay: config?.retry?.delay ?? 1000,
      backoff: config?.retry?.backoff ?? "linear",
      maxDelay: config?.retry?.maxDelay ?? 30000,
    };
  }

  /**
   * Get error handling strategy for a step
   */
  private getErrorHandling(step: Step): ErrorHandling {
    return this.getStepConfig(step)?.onError ?? "fail";
  }

  /**
   * Get timeout for a step
   */
  private getTimeout(step: Step): number | undefined {
    return this.getStepConfig(step)?.timeout;
  }

  /**
   * Calculate retry delay with backoff
   */
  private calculateRetryDelay(attempt: number, config: Required<RetryConfig>): number {
    const baseDelay = config.delay;
    let delay: number;

    if (config.backoff === "exponential") {
      delay = baseDelay * Math.pow(2, attempt);
    } else {
      // linear
      delay = baseDelay * (attempt + 1);
    }

    // Cap at maxDelay
    return Math.min(delay, config.maxDelay);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
