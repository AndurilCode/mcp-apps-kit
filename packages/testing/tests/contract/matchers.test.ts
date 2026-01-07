/**
 * Contract tests for behavior matchers
 *
 * These tests verify the public API contract of the matchers.
 */

import { describe, it, expect } from "vitest";
import { expectToolResult } from "../../src/eval/behavior";
import type { ToolResult } from "../../src/types";

describe("Behavior Matchers Contract", () => {
  it("should export expectToolResult function", () => {
    expect(typeof expectToolResult).toBe("function");
  });

  it("expectToolResult should return assertion interface", () => {
    const result: ToolResult = {
      content: [{ type: "text", text: "test" }],
      isError: false,
    };

    const assertion = expectToolResult(result);

    expect(typeof assertion.toMatchObject).toBe("function");
    expect(typeof assertion.toMatchSchema).toBe("function");
    expect(typeof assertion.toHaveNoError).toBe("function");
    expect(typeof assertion.toHaveError).toBe("function");
    expect(typeof assertion.toContainText).toBe("function");
  });
});
