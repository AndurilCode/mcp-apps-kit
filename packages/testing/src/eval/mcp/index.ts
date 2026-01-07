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
  hasAnthropicKey,
  hasAnyProviderKey,
  type TokenPricing,
  type MCPEval,
  type MCPEvaluator,
  type MCPEvalConfig, 
  type MCPEvalSetupConfig,
  type MCPRunOptions,
  type MCPEvalResult, 
  type ToolCallRecord, 
  type JudgeResult,
  type JudgeCriterion,
  type JudgeOptions,
  type CriterionJudgeResult,
  type TokenUsage,
} from "./evaluator";
export { 
  MCPEvalReporter, 
  getReporter, 
  printBatchSummary,
  getGlobalCollector,
  clearGlobalCollector,
  printGlobalSummary,
  type CollectedResult,
} from "./reporter";
export { createSession, type MCPSession } from "./session";
export {
  withRetry,
  withTimeout,
  createResilientWrapper,
  RateLimiter,
  type RetryConfig,
  type RateLimitConfig,
  type ResilienceConfig,
} from "./retry";
export {
  wrapWithErrorInjection,
  type ToolErrorConfig,
  type ErrorInjectionConfig,
} from "./error-injection";
export {
  runBatch,
  extendWithBatch,
  type BatchEvalCase,
  type BatchCaseResult,
  type BatchSummary,
  type BatchResult,
  type BatchOptions,
} from "./batch";

// Provider exports
export {
  createProvider,
  createOpenAIProvider,
  createAnthropicProvider,
  getProviderApiKey,
  hasProviderKey,
  getDefaultModel,
  detectProvider,
  type ProviderType,
  type LLMProvider,
  type ProviderConfig,
  type ProviderMessage,
  type ProviderTool,
  type ProviderResponse,
  type ProviderToolCall,
} from "./providers";
