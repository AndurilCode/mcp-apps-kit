/**
 * Resource matchers for MCP resource testing
 *
 * Provides standalone assertion functions for validating resource outputs.
 */

import type { ZodType } from "zod";
import type { ResourceResult, ResourceResultAssertion, ContentBlock } from "../types";
import { AssertionError } from "../errors";
import { matcherLogger } from "../debug";

/**
 * Create an assertion interface for a resource result
 *
 * @param result - Resource result to assert against
 * @returns Assertion interface with various matcher methods
 *
 * @example
 * ```typescript
 * const result = await client.readResource('file:///config.json');
 * expectResource(result).toHaveContent();
 * expectResource(result).toContainText('apiKey');
 * ```
 */
export function expectResource(result: ResourceResult): ResourceResultAssertion {
  matcherLogger("Creating assertion for resource result: %o", result);

  return {
    /**
     * Assert resource has content
     */
    toHaveContent(): void {
      matcherLogger("Asserting resource has content");
      if (!result.contents || result.contents.length === 0) {
        throw new AssertionError(
          result.contents,
          "non-empty contents",
          "Expected resource to have content, but it was empty"
        );
      }
    },

    /**
     * Assert resource contains specific text
     */
    toContainText(text: string): void {
      matcherLogger("Asserting resource contains text: %s", text);
      const allText = extractTextContent(result.contents);
      if (!allText.includes(text)) {
        throw new AssertionError(
          allText,
          text,
          `Expected resource to contain text "${text}", but it didn't. Actual text: ${allText}`
        );
      }
    },

    /**
     * Assert resource matches MIME type
     */
    toHaveMimeType(mimeType: string): void {
      matcherLogger("Asserting resource has MIME type: %s", mimeType);
      const hasMimeType = result.contents.some((c) => c.mimeType === mimeType);
      if (!hasMimeType) {
        const actualMimeTypes = result.contents
          .map((c) => c.mimeType)
          .filter(Boolean)
          .join(", ");
        throw new AssertionError(
          actualMimeTypes || "none",
          mimeType,
          `Expected resource to have MIME type "${mimeType}", but found: ${actualMimeTypes || "none"}`
        );
      }
    },

    /**
     * Match resource content against Zod schema (for JSON resources)
     */
    toMatchSchema(schema: ZodType): void {
      matcherLogger("Asserting resource matches schema");
      const data = extractResourceData(result.contents);
      const parseResult = schema.safeParse(data);
      if (!parseResult.success) {
        throw new AssertionError(
          data,
          schema,
          `Expected resource to match schema, but validation failed: ${parseResult.error.message}`
        );
      }
    },

    /**
     * Assert resource content matches expected object (partial)
     */
    toMatchObject(expected: unknown): void {
      matcherLogger("Asserting resource matches object: %o", expected);
      const data = extractResourceData(result.contents);
      if (!deepMatch(data, expected)) {
        throw new AssertionError(
          data,
          expected,
          `Expected resource to match object, but it didn't. Actual: ${JSON.stringify(data)}, Expected: ${JSON.stringify(expected)}`
        );
      }
    },
  };
}

/**
 * Extract all text content from content blocks
 */
function extractTextContent(contents: ContentBlock[]): string {
  return contents
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
}

/**
 * Extract data from resource contents for comparison
 * Tries to parse JSON if the content looks like JSON
 */
function extractResourceData(contents: ContentBlock[]): unknown {
  const textBlocks = contents.filter((c) => c.type === "text");

  if (textBlocks.length === 0) {
    return null;
  }

  if (textBlocks.length === 1) {
    const text = textBlocks[0]?.text ?? "";
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  // Multiple text blocks - return as array
  return textBlocks.map((c) => {
    const text = c.text ?? "";
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  });
}

/**
 * Deep match function for partial object matching
 */
function deepMatch(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;

  if ((actual === null || actual === undefined) && (expected === null || expected === undefined)) {
    return true;
  }

  if (actual === null || actual === undefined || expected === null || expected === undefined) {
    return false;
  }

  if (typeof actual !== typeof expected) return false;
  if (typeof actual !== "object") return actual === expected;

  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (expected.length === 0) return actual.length === 0;
    return expected.every((expItem) => actual.some((actItem) => deepMatch(actItem, expItem)));
  }

  if (Array.isArray(actual) || Array.isArray(expected)) return false;

  const actualObj = actual as Record<string, unknown>;
  const expectedObj = expected as Record<string, unknown>;

  return Object.keys(expectedObj).every((key) => {
    if (!(key in actualObj)) return false;
    return deepMatch(actualObj[key], expectedObj[key]);
  });
}
