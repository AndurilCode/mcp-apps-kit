/**
 * LLM evaluator factory
 *
 * Creates evaluators for different LLM providers.
 */

import type { LLMEvaluator, LLMEvaluatorConfig } from "../../types";
import { createOpenAIProvider } from "./providers/openai";
import { createAnthropicProvider } from "./providers/anthropic";
import { llmLogger } from "../../debug";

/**
 * Create an LLM-based evaluator
 *
 * @param config - Evaluator configuration
 * @returns LLM evaluator instance
 *
 * @example
 * ```typescript
 * const evaluator = createLLMEvaluator({
 *   provider: 'openai',
 *   model: 'gpt-4o-mini',
 * });
 * ```
 */
export function createLLMEvaluator(config: LLMEvaluatorConfig): LLMEvaluator {
  llmLogger("Creating LLM evaluator: %s with model: %s", config.provider, config.model);

  let provider: ReturnType<typeof createOpenAIProvider>;

  switch (config.provider) {
    case "openai":
      provider = createOpenAIProvider(config.model);
      break;
    case "anthropic":
      provider = createAnthropicProvider(config.model);
      break;
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }

  return {
    async evaluate(result: unknown, options) {
      return provider.evaluate(result, options);
    },
    async evaluateWithPrompt(result: unknown, options) {
      return provider.evaluateWithPrompt(result, options);
    },
  };
}
