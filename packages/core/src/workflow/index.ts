/**
 * Workflow engine for @mcp-apps-kit/core
 *
 * Provides a fluent API for composing multi-step workflows as MCP tools.
 * Workflows support tool calls, custom logic, parallel execution, conditional
 * branching, and configurable error handling.
 *
 * @example Sequential workflow
 * ```typescript
 * import { workflow, toolStep, customStep } from "@mcp-apps-kit/core";
 *
 * const orderWorkflow = workflow("process_order")
 *   .describe("Process a customer order end-to-end")
 *   .input({ orderId: z.string(), customerId: z.string() })
 *   .output({ success: z.boolean(), receiptId: z.string().optional() })
 *   .step("validate", toolStep("validate_order"))
 *   .step("payment", toolStep("process_payment"), {
 *     retry: { maxAttempts: 3, delay: 1000 },
 *   })
 *   .build();
 * ```
 *
 * @example Parallel execution
 * ```typescript
 * const workflow = workflow("notifications")
 *   .describe("Send notifications")
 *   .input({ userId: z.string() })
 *   .parallel("notify", [
 *     toolStep("send_email"),
 *     toolStep("send_sms"),
 *     toolStep("log_event"),
 *   ])
 *   .build();
 * ```
 *
 * @example Conditional branching
 * ```typescript
 * const workflow = workflow("shipping")
 *   .describe("Handle shipping")
 *   .input({ orderId: z.string() })
 *   .step("validate", toolStep("validate_order"))
 *   .branch("shipping_method", {
 *     when: (ctx) => ctx.outputs.validate.isDigital,
 *     then: [customStep(async (ctx) => ({ delivered: true }))],
 *     else: [toolStep("create_shipment"), toolStep("notify_warehouse")],
 *   })
 *   .build();
 * ```
 *
 * @example External MCP tool
 * ```typescript
 * const workflow = workflow("weather_plan")
 *   .describe("Plan travel with weather")
 *   .input({ destination: z.string(), date: z.string() })
 *   .step("weather", externalStep({
 *     server: "mcp://weather-service",
 *     tool: "get_forecast",
 *     mapInput: (ctx) => ({
 *       location: ctx.input.destination,
 *       date: ctx.input.date,
 *     }),
 *   }))
 *   .build();
 * ```
 *
 * @module workflow
 */

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type {
  WorkflowContext,
  ToolCaller,
  ExternalToolCaller,
  RetryConfig,
  ErrorHandler,
  ErrorHandling,
  StepConfig,
  ToolStep,
  CustomStep,
  ExternalStep,
  ParallelStep,
  BranchStep,
  Step,
  NamedStep,
  WorkflowDefinition,
  StepExecutionResult,
  WorkflowExecutionResult,
} from "./types";

export type {
  WorkflowBuilderInitial,
  WorkflowBuilderWithDescription,
  WorkflowBuilderWithInput,
  WorkflowBuilderWithOutput,
  WorkflowBuilderWithSteps,
  SchemaInput,
  NormalizedSchema,
} from "./workflow-builder";

// =============================================================================
// ERROR EXPORTS
// =============================================================================

export {
  WorkflowError,
  WorkflowExecutionError,
  StepTimeoutError,
  ExternalToolError,
  WorkflowValidationError,
} from "./errors";

// =============================================================================
// STEP HELPER EXPORTS
// =============================================================================

export { toolStep, customStep, externalStep } from "./steps";
export type { ExternalStepConfig } from "./steps";

// =============================================================================
// BUILDER FACTORY
// =============================================================================

import { WorkflowBuilderImpl } from "./workflow-builder-impl";
import type { WorkflowBuilderInitial } from "./workflow-builder";

/**
 * Create a new workflow builder
 *
 * @param name - Workflow name (will be used as tool name)
 * @returns Workflow builder for chaining configuration
 *
 * @example
 * ```typescript
 * const myWorkflow = workflow("my_workflow")
 *   .describe("My workflow description")
 *   .input({ userId: z.string() })
 *   .step("fetch", toolStep("fetch_user"))
 *   .build();
 * ```
 */
export function workflow<TName extends string>(name: TName): WorkflowBuilderInitial<TName> {
  return new WorkflowBuilderImpl(name);
}

// =============================================================================
// EXECUTOR EXPORT (for advanced use cases)
// =============================================================================

export { WorkflowExecutor } from "./executor";
export { ExternalToolClient } from "./external-client";
