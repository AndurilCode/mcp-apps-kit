/**
 * Workflow step helper functions
 *
 * @module workflow/steps
 */

import type { ToolStep, CustomStep, ExternalStep, StepConfig, WorkflowContext } from "./types";

// =============================================================================
// TOOL STEP
// =============================================================================

/**
 * Create a tool step that calls a tool defined in the same app
 *
 * @param toolName - Name of the tool to call
 * @param config - Optional step configuration
 * @returns Tool step definition
 *
 * @example
 * ```typescript
 * const validateStep = toolStep("validate_order", {
 *   mapInput: (ctx) => ({ orderId: ctx.input.orderId }),
 *   retry: { maxAttempts: 3, delay: 1000 },
 * });
 * ```
 */
export function toolStep<TContext = WorkflowContext>(
  toolName: string,
  config?: StepConfig<TContext>
): ToolStep<TContext> {
  return {
    type: "tool",
    toolName,
    config,
  };
}

// =============================================================================
// CUSTOM STEP
// =============================================================================

/**
 * Create a custom step with inline handler logic
 *
 * @param handler - Async function that receives workflow context and returns a value
 * @param config - Optional step configuration
 * @returns Custom step definition
 *
 * @example
 * ```typescript
 * const transformStep = customStep(async (ctx) => {
 *   const data = ctx.outputs.fetchData;
 *   return { transformed: data.value * 2 };
 * }, {
 *   timeout: 5000,
 * });
 * ```
 */
export function customStep<TContext = WorkflowContext>(
  handler: (context: TContext) => Promise<unknown>,
  config?: StepConfig<TContext>
): CustomStep<TContext> {
  return {
    type: "custom",
    handler,
    config,
  };
}

// =============================================================================
// EXTERNAL STEP
// =============================================================================

/**
 * Configuration for external tool step
 *
 * Supports both stdio and HTTP transports:
 * - stdio: Server command name (e.g., "weather-server" or "mcp://weather-server")
 * - HTTP: Full URL (e.g., "http://localhost:3000/mcp" or "https://api.example.com/mcp")
 */
export interface ExternalStepConfig<TContext = WorkflowContext> extends StepConfig<TContext> {
  /** MCP server identifier - command name for stdio or URL for HTTP */
  server: string;

  /** Tool name on the external server */
  tool: string;
}

/**
 * Create an external step that calls a tool from another MCP server
 *
 * Supports both stdio and HTTP transports based on the server identifier.
 *
 * @param config - External step configuration including server and tool name
 * @returns External step definition
 *
 * @example stdio transport (local MCP server)
 * ```typescript
 * const weatherStep = externalStep({
 *   server: "weather-server", // or "mcp://weather-server"
 *   tool: "get_forecast",
 *   mapInput: (ctx) => ({
 *     location: ctx.input.destination,
 *     date: ctx.input.date,
 *   }),
 * });
 * ```
 *
 * @example HTTP transport (remote MCP server)
 * ```typescript
 * const weatherStep = externalStep({
 *   server: "http://localhost:3000/mcp",
 *   tool: "get_forecast",
 *   mapInput: (ctx) => ({
 *     location: ctx.input.destination,
 *     date: ctx.input.date,
 *   }),
 * });
 * ```
 */
export function externalStep<TContext = WorkflowContext>(
  config: ExternalStepConfig<TContext>
): ExternalStep<TContext> {
  const { server, tool, ...stepConfig } = config;

  return {
    type: "external",
    server,
    toolName: tool,
    config: stepConfig,
  };
}
