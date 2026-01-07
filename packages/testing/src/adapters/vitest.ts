/**
 * Vitest adapter for custom matchers
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

// ZodType is the modern replacement for ZodSchema in Zod v4+
type ZodType = import("zod").ZodType;

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
    toMatchToolSchema(received: ToolResult, schema: ZodType) {
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

// Type augmentation for Vitest custom matchers
declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Assertion<T> {
    toMatchToolSchema(schema: ZodType): void;
    toBeSuccessfulToolResult(): void;
    toHaveToolError(code?: string): void;
    toContainToolText(text: string): void;
    toMatchToolObject(expected: unknown): void;
  }

  interface AsymmetricMatchersContaining {
    toMatchToolSchema(schema: ZodType): void;
    toBeSuccessfulToolResult(): void;
    toHaveToolError(code?: string): void;
    toContainToolText(text: string): void;
    toMatchToolObject(expected: unknown): void;
  }
}
