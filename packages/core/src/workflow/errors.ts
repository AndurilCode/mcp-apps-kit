/**
 * Workflow engine error types
 *
 * @module workflow/errors
 */

/**
 * Base error class for workflow-related errors
 */
export class WorkflowError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "WorkflowError";
  }
}

/**
 * Error thrown when workflow execution fails
 */
export class WorkflowExecutionError extends WorkflowError {
  constructor(
    message: string,
    public readonly stepName?: string,
    details?: Record<string, unknown>
  ) {
    super(message, "WORKFLOW_EXECUTION_ERROR", details);
    this.name = "WorkflowExecutionError";
  }
}

/**
 * Error thrown when a step times out
 */
export class StepTimeoutError extends WorkflowError {
  constructor(
    public readonly stepName: string,
    public readonly timeout: number
  ) {
    super(`Step "${stepName}" timed out after ${timeout}ms`, "STEP_TIMEOUT", {
      stepName,
      timeout,
    });
    this.name = "StepTimeoutError";
  }
}

/**
 * Error thrown when external tool call fails
 */
export class ExternalToolError extends WorkflowError {
  constructor(
    message: string,
    public readonly server: string,
    public readonly toolName: string,
    details?: Record<string, unknown>
  ) {
    super(message, "EXTERNAL_TOOL_ERROR", { server, toolName, ...details });
    this.name = "ExternalToolError";
  }
}

/**
 * Error thrown when workflow validation fails during build
 */
export class WorkflowValidationError extends WorkflowError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "WORKFLOW_VALIDATION_ERROR", details);
    this.name = "WorkflowValidationError";
  }
}
