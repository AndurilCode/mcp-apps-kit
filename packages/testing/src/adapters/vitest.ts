/**
 * Vitest adapter for custom matchers
 *
 * Extends Vitest's expect with tool result matchers.
 */

import { expect } from "vitest";
import {
  matchesToolSchema,
  isSuccessfulToolResult,
  hasToolError,
  containsToolText,
  matchesToolObject,
} from "../matchers/core";
import type { ToolResult } from "../types";
import type { ZodSchema } from "zod";

/**
 * Setup Vitest matchers for tool results
 *
 * Call this in your vitest.setup.ts file:
 *
 * ```typescript
 * import { setupVitestMatchers } from '@mcp-apps-kit/testing/vitest';
 * setupVitestMatchers();
 * ```
 */
export function setupVitestMatchers(): void {
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

// Type augmentation for Vitest
declare module "vitest" {
  interface Assertion<T = unknown> {
    toMatchToolSchema(schema: ZodSchema): T;
    toBeSuccessfulToolResult(): T;
    toHaveToolError(code?: string): T;
    toContainToolText(text: string): T;
    toMatchToolObject(expected: unknown): T;
  }

  interface AsymmetricMatchersContaining {
    toMatchToolSchema(schema: ZodSchema): void;
    toBeSuccessfulToolResult(): void;
    toHaveToolError(code?: string): void;
    toContainToolText(text: string): void;
    toMatchToolObject(expected: unknown): void;
  }
}
