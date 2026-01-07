/**
 * Matchers module
 *
 * Provides framework-agnostic core matchers.
 */

export {
  matchesToolSchema,
  isSuccessfulToolResult,
  hasToolError,
  containsToolText,
  matchesToolObject,
} from "./core";
export type { MatcherResult } from "./core";

// Resource matchers
export { expectResource } from "./resource";

// Prompt matchers
export { expectPrompt } from "./prompt";
