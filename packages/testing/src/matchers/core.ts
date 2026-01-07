/**
 * Framework-agnostic core matchers
 *
 * Provides the core logic for matchers that can be used
 * by both Vitest and Jest adapters.
 */

import type { ZodType } from "zod";
import type { ToolResult } from "../types";
import { extractResultData, deepMatch } from "../eval/behavior/matchers";

/**
 * Matcher result interface
 */
export interface MatcherResult {
  pass: boolean;
  message: () => string;
}

/**
 * Check if tool result matches a Zod schema
 */
export function matchesToolSchema(result: ToolResult, schema: ZodType): MatcherResult {
  const actual = extractResultData(result);
  const parseResult = schema.safeParse(actual);

  return {
    pass: parseResult.success,
    message: () =>
      parseResult.success
        ? `Expected tool result not to match schema, but it did`
        : `Expected tool result to match schema, but validation failed: ${parseResult.error.message}`,
  };
}

/**
 * Check if tool result is successful (no error)
 */
export function isSuccessfulToolResult(result: ToolResult): MatcherResult {
  return {
    pass: !result.isError,
    message: () => {
      if (result.isError) {
        const errorText = result.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n");
        return `Expected tool result to be successful, but got error: ${errorText}`;
      }
      return `Expected tool result not to be successful, but it was`;
    },
  };
}

/**
 * Check if tool result has an error (optionally with specific code)
 */
export function hasToolError(result: ToolResult, code?: string): MatcherResult {
  if (!result.isError) {
    return {
      pass: false,
      message: () =>
        `Expected tool result to have error${code ? ` with code ${code}` : ""}, but no error occurred`,
    };
  }

  if (code) {
    const errorText = result.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    const hasCode = errorText.includes(code);

    return {
      pass: hasCode,
      message: () =>
        hasCode
          ? `Expected tool result not to have error code ${code}, but it did`
          : `Expected tool result to have error code ${code}, but error text doesn't contain it: ${errorText}`,
    };
  }

  return {
    pass: true,
    message: () => `Expected tool result not to have error, but it did`,
  };
}

/**
 * Check if tool result contains specific text
 */
export function containsToolText(result: ToolResult, text: string): MatcherResult {
  const allText = result.content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
  const contains = allText.includes(text);

  return {
    pass: contains,
    message: () =>
      contains
        ? `Expected tool result not to contain text "${text}", but it did`
        : `Expected tool result to contain text "${text}", but it didn't. Actual text: ${allText}`,
  };
}

/**
 * Check if tool result matches an object (partial match)
 */
export function matchesToolObject(result: ToolResult, expected: unknown): MatcherResult {
  const actual = extractResultData(result);

  // Use deepMatch for partial object matching
  const matches = deepMatch(actual, expected);

  return {
    pass: matches,
    message: () =>
      matches
        ? `Expected tool result not to partially match object, but it did`
        : `Expected tool result to partially match object, but it didn't. Actual: ${JSON.stringify(actual)}, Expected: ${JSON.stringify(expected)}`,
  };
}
