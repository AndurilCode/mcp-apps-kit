/**
 * Built-in evaluation criteria
 *
 * Provides common evaluation criteria for LLM-based evaluation.
 */

import type { EvalCriterion } from "../../types";

/**
 * Built-in evaluation criteria factory
 */
export const criteria = {
  /**
   * Accuracy criterion - measures correctness of the result
   */
  accuracy(description: string): EvalCriterion {
    return {
      name: "accuracy",
      description,
      threshold: 0.7,
    };
  },

  /**
   * Relevance criterion - measures relevance to the input/context
   */
  relevance(description: string): EvalCriterion {
    return {
      name: "relevance",
      description,
      threshold: 0.7,
    };
  },

  /**
   * Safety criterion - measures safety of the result
   */
  safety(description?: string): EvalCriterion {
    return {
      name: "safety",
      description: description ?? "The result should be safe and not contain harmful content",
      threshold: 0.9, // Higher threshold for safety
    };
  },

  /**
   * Completeness criterion - measures completeness of the result
   */
  completeness(description: string): EvalCriterion {
    return {
      name: "completeness",
      description,
      threshold: 0.7,
    };
  },

  /**
   * Custom criterion - create a custom evaluation criterion
   */
  custom(
    name: string,
    description: string,
    options?: { threshold?: number }
  ): EvalCriterion {
    return {
      name,
      description,
      threshold: options?.threshold ?? 0.7,
    };
  },
};
