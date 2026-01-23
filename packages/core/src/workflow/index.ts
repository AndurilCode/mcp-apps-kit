/**
 * Workflow engine for @mcp-apps-kit/core
 *
 * Provides a fluent API for composing multi-step workflows as MCP tools.
 * Workflows support tool calls, custom logic, parallel execution, conditional
 * branching, and configurable error handling.
 *
 * ## Production Best Practices
 *
 * ### Automatic Lifecycle Management
 *
 * Workflows automatically detect your environment and use the appropriate executor manager:
 *
 * **Traditional Servers** (Node.js, Express, etc.):
 * - Uses global singleton with persistent pooling
 * - Background cleanup of idle executors (10 min TTL)
 * - LRU eviction when pool reaches 100 executors
 * - Graceful shutdown via `server.stop()`
 *
 * **Edge/Serverless** (Supabase, Vercel, Cloudflare, AWS Lambda):
 * - Creates fresh manager per invocation (no singleton)
 * - Smaller pool size (10 executors, memory-constrained)
 * - No background timers (function terminates quickly)
 * - Auto-cleanup on function exit via process handlers
 *
 * Environment detection is automatic based on runtime characteristics.
 *
 * ### Edge Function Example (Supabase)
 *
 * ```typescript
 * import { serve } from "https://deno.land/std/http/server.ts";
 * import { createApp, workflow, toolStep } from "@mcp-apps-kit/core";
 *
 * const myWorkflow = workflow("process_data")
 *   .describe("Process data")
 *   .input({ data: z.string() })
 *   .step("validate", toolStep("validate"))
 *   .step("process", toolStep("process"))
 *   .build();
 *
 * const app = createApp({
 *   name: "edge-app",
 *   tools: { myWorkflow },
 * });
 *
 * serve(async (req) => {
 *   // Workflows automatically use edge-optimized manager
 *   // Cleanup happens when function terminates
 *   return await app.handleRequest(req);
 * });
 * ```
 *
 * ### Traditional Server Example
 *
 * ```typescript
 * const server = createApp({
 *   name: "my-app",
 *   tools: { myWorkflow },
 * });
 *
 * await server.start(); // Starts background cleanup timer
 *
 * // Later, during shutdown
 * await server.stop(); // Automatically cleans up all workflow resources
 * ```
 *
 * ### Advanced Configuration
 *
 * **Traditional Servers:**
 * ```typescript
 * import { ExecutorManager } from "@mcp-apps-kit/core";
 *
 * // Configure the global executor manager
 * const manager = ExecutorManager.getInstance({
 *   maxExecutors: 200,           // Increase pool size for high-traffic apps
 *   executorTTL: 5 * 60 * 1000,  // Cleanup after 5 minutes of inactivity
 *   autoCleanup: true,           // Enable automatic cleanup (default)
 *   cleanupInterval: 60 * 1000,  // Run cleanup every minute
 * });
 *
 * // Get statistics
 * const stats = manager.getStats();
 * console.log(`Active workflows: ${stats.activeExecutors}`);
 * console.log(`Total cached: ${stats.totalExecutors}`);
 * ```
 *
 * **Edge Functions:**
 * ```typescript
 * import { EdgeExecutorManager } from "@mcp-apps-kit/core";
 *
 * // Configure defaults for all edge invocations
 * EdgeExecutorManager.configureDefaults({
 *   maxExecutors: 5,  // Smaller pool for memory-constrained edge
 *   autoCleanup: false, // No background timers needed
 * });
 * ```
 *
 * ### External MCP Connection Configuration
 *
 * For workflows calling external MCP servers, configure connection pooling:
 *
 * ```typescript
 * import { ExternalToolClient } from "@mcp-apps-kit/core";
 *
 * // Configure per-executor connection settings
 * const client = new ExternalToolClient({
 *   cacheTTL: 10 * 60 * 1000,    // Keep connections alive for 10 minutes
 *   maxConnections: 20,          // Maximum concurrent MCP connections
 * });
 * ```
 *
 * Note: Each WorkflowExecutor has its own ExternalToolClient. In traditional
 * servers, the ExecutorManager reuses executors efficiently, so connection
 * pooling is shared across invocations. In edge functions, connections are
 * per-invocation and cleaned up when the function terminates.
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
 * const notificationsWorkflow = workflow("notifications")
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
 * const shippingWorkflow = workflow("shipping")
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
 * const weatherWorkflow = workflow("weather_plan")
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
  ToolValidator,
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
  WorkflowDefinitionError,
  ToolResponseValidationError,
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
export type { ExternalToolClientConfig } from "./external-client";

// =============================================================================
// EXECUTOR MANAGER EXPORT (production lifecycle management)
// =============================================================================

export { ExecutorManager } from "./executor-manager";
export type { ExecutorManagerConfig } from "./executor-manager";

export { EdgeExecutorManager } from "./executor-manager-edge";
export type { EdgeExecutorManagerConfig } from "./executor-manager-edge";
