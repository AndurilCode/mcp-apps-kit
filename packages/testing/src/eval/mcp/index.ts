/**
 * MCP Eval Module
 *
 * Provides evaluation utilities where an LLM actually uses MCP tools
 * to complete tasks, then assertions are made on the results.
 */

export { 
  createMCPEval, 
  setupMCPEval,
  describeEval,
  hasOpenAIKey,
  type MCPEval,
  type MCPEvaluator,
  type MCPEvalConfig, 
  type MCPEvalSetupConfig,
  type MCPEvalResult, 
  type ToolCallRecord, 
  type JudgeResult 
} from "./evaluator";
export { MCPEvalReporter, getReporter } from "./reporter";
