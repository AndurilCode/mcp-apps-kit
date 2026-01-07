/**
 * Evaluation module
 *
 * Provides various evaluation and testing utilities.
 */

// Behavior testing
export { expectToolResult, defineTestSuite, runTestSuite } from "./behavior";
export type { TestSuiteConfig } from "./behavior";

// Property testing - Phase 6
export { generators, forAllInputs } from "./property";

// LLM evaluation (output evaluation) - Phase 8
export { createLLMEvaluator, criteria } from "./llm";

// MCP evaluation (LLM uses MCP tools) - the correct way to eval
export { createMCPEval } from "./mcp";
export type { MCPEvalConfig, MCPEvalResult, ToolCallRecord } from "./mcp";

// Eval reporting
export { EvalReporter, createEvalReporter } from "./reporter";
export type { EvalReporterOptions, EvalReportEntry } from "./reporter";
