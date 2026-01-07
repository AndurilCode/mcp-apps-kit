/**
 * LLM provider interface
 *
 * Defines the interface for LLM providers used in evaluation.
 */

import type {
  EvaluationResult,
  EvalOptions,
  CustomEvalOptions,
} from "../../../types";

/**
 * Interface for LLM providers
 */
export interface LLMProvider {
  /**
   * Evaluate a result against criteria
   */
  evaluate(result: unknown, options: EvalOptions): Promise<EvaluationResult>;

  /**
   * Evaluate with a custom prompt
   */
  evaluateWithPrompt(
    result: unknown,
    options: CustomEvalOptions
  ): Promise<unknown>;
}
