/**
 * Evaluation module
 *
 * Provides various evaluation and testing utilities.
 */

// Behavior testing
export {
  expectToolResult,
  defineTestSuite,
  runTestSuite,
} from "./behavior";
export type { TestSuiteConfig } from "./behavior";

// Property testing - Phase 6
export { generators, forAllInputs } from "./property";

// LLM evaluation - Phase 8
export { createLLMEvaluator, criteria } from "./llm";
