/**
 * Jest adapter for custom matchers
 *
 * Extends Jest's expect with tool result matchers.
 */

import {
  matchesToolSchema,
  isSuccessfulToolResult,
  hasToolError,
  containsToolText,
  matchesToolObject,
} from "../matchers/core";
import type { ToolResult } from "../types";
import type { ZodSchema } from "zod";

// Jest's expect is available globally, but we need to type it
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const expect: any;

/**
 * Setup Jest matchers for tool results
 *
 * Call this in your jest.setup.js file:
 *
 * ```typescript
 * import { setupJestMatchers } from '@mcp-apps-kit/testing/jest';
 * setupJestMatchers();
 * ```
 */
export function setupJestMatchers(): void {
  if (typeof expect === "undefined") {
    throw new Error(
      "Jest expect is not available. Make sure Jest is installed and this is called in a Jest test environment."
    );
  }

  expect.extend({
    toMatchToolSchema(received: ToolResult, schema: ZodSchema) {
      return matchesToolSchema(received, schema);
    },
    toBeSuccessfulToolResult(received: ToolResult) {
      return isSuccessfulToolResult(received);
    },
    toHaveToolError(received: ToolResult, code?: string) {
      return hasToolError(received, code);
    },
    toContainToolText(received: ToolResult, text: string) {
      return containsToolText(received, text);
    },
    toMatchToolObject(received: ToolResult, expected: unknown) {
      return matchesToolObject(received, expected);
    },
  });
}

// Type augmentation for Jest
declare namespace jest {
  interface Matchers<R> {
    toMatchToolSchema(schema: ZodSchema): R;
    toBeSuccessfulToolResult(): R;
    toHaveToolError(code?: string): R;
    toContainToolText(text: string): R;
    toMatchToolObject(expected: unknown): R;
  }
}
