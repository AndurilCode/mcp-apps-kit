/**
 * Behavior testing matchers for tool results
 *
 * Provides standalone assertion functions for validating tool outputs.
 */

import type { ZodType } from "zod";
import type { ToolResult, ToolResultAssertion } from "../../types";
import { AssertionError } from "../../errors";
import { behaviorLogger } from "../../debug";

/**
 * Create an assertion interface for a tool result
 *
 * @param result - Tool result to assert against
 * @returns Assertion interface with various matcher methods
 *
 * @example
 * ```typescript
 * const result = await client.callTool('greet', { name: 'Alice' });
 * expectToolResult(result).toMatchObject({ message: 'Hello, Alice!' });
 * ```
 */
export function expectToolResult(result: ToolResult): ToolResultAssertion {
  behaviorLogger("Creating assertion for tool result: %o", result);

  return {
    /**
     * Match result against expected object (partial match)
     */
    toMatchObject(expected: unknown): void {
      behaviorLogger("Asserting result matches object: %o", expected);
      const actual = extractResultData(result);
      if (!deepMatch(actual, expected)) {
        throw new AssertionError(
          actual,
          expected,
          `Expected result to match object, but it didn't. Actual: ${JSON.stringify(actual)}, Expected: ${JSON.stringify(expected)}`
        );
      }
    },

    /**
     * Match result against Zod schema
     */
    toMatchSchema(schema: ZodType): void {
      behaviorLogger("Asserting result matches schema");
      const actual = extractResultData(result);
      const parseResult = schema.safeParse(actual);
      if (!parseResult.success) {
        throw new AssertionError(
          actual,
          schema,
          `Expected result to match schema, but validation failed: ${parseResult.error.message}`
        );
      }
    },

    /**
     * Assert that no error occurred
     */
    toHaveNoError(): void {
      behaviorLogger("Asserting result has no error");
      if (result.isError) {
        const errorText = result.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n");
        throw new AssertionError(
          result,
          { isError: false },
          `Expected result to have no error, but got error: ${errorText}`
        );
      }
    },

    /**
     * Assert that an error occurred (optionally with specific code)
     */
    toHaveError(code?: string): void {
      behaviorLogger("Asserting result has error%s", code ? ` with code ${code}` : "");
      if (!result.isError) {
        throw new AssertionError(
          result,
          { isError: true, code },
          `Expected result to have error${code ? ` with code ${code}` : ""}, but no error occurred`
        );
      }

      if (code) {
        // Try to extract error code from result content
        const errorText = result.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n");
        // Simple check - in practice, error codes might be in structured format
        if (!errorText.includes(code)) {
          throw new AssertionError(
            result,
            { isError: true, code },
            `Expected error code ${code}, but error text doesn't contain it: ${errorText}`
          );
        }
      }
    },

    /**
     * Assert that result contains specific text
     */
    toContainText(text: string): void {
      behaviorLogger("Asserting result contains text: %s", text);
      const allText = result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("\n");
      if (!allText.includes(text)) {
        throw new AssertionError(
          allText,
          text,
          `Expected result to contain text "${text}", but it didn't. Actual text: ${allText}`
        );
      }
    },
  };
}

/**
 * Extract data from tool result for comparison
 *
 * Attempts to parse JSON from text content, falls back to raw text.
 * The text content should contain JSON when structuredContent was used.
 */
export function extractResultData(result: ToolResult): unknown {
  const textContent = result.content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");

  if (!textContent) {
    return null;
  }

  // Try to parse as JSON first
  try {
    const parsed: unknown = JSON.parse(textContent);
    // If it's a string that looks like JSON was stringified, try parsing again
    if (typeof parsed === "string") {
      try {
        return JSON.parse(parsed);
      } catch {
        return parsed;
      }
    }
    return parsed;
  } catch {
    // Not JSON, return as string
    return textContent;
  }
}

/**
 * Deep match function for partial object matching
 *
 * Checks if actual object contains all properties from expected object
 * with matching values (recursive for nested objects).
 */
export function deepMatch(actual: unknown, expected: unknown): boolean {
  // Exact match
  if (actual === expected) {
    return true;
  }

  // Both null or undefined
  if ((actual === null || actual === undefined) && (expected === null || expected === undefined)) {
    return true;
  }

  // One is null/undefined, other isn't
  if (actual === null || actual === undefined || expected === null || expected === undefined) {
    return false;
  }

  // Type mismatch
  if (typeof actual !== typeof expected) {
    return false;
  }

  // Primitive types
  if (typeof actual !== "object") {
    return actual === expected;
  }

  // Arrays
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (expected.length === 0) {
      return actual.length === 0;
    }
    // For arrays, check if all expected elements exist in actual
    return expected.every((expItem) => actual.some((actItem) => deepMatch(actItem, expItem)));
  }

  // One is array, other isn't
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return false;
  }

  // Objects - check if actual contains all expected properties
  const actualObj = actual as Record<string, unknown>;
  const expectedObj = expected as Record<string, unknown>;

  return Object.keys(expectedObj).every((key) => {
    if (!(key in actualObj)) {
      return false;
    }
    return deepMatch(actualObj[key], expectedObj[key]);
  });
}