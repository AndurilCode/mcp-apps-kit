/**
 * Integration tests for Vitest matchers
 *
 * These tests verify that Vitest matchers work correctly
 * when set up in a test environment.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { setupVitestMatchers } from "../../src/adapters/vitest";
import type { ToolResult } from "../../src/types";

// Setup matchers before tests
beforeAll(() => {
  setupVitestMatchers();
});

describe("Vitest Matchers Integration", () => {
  it("should have matchers available after setup", () => {
    const result: ToolResult = {
      content: [{ type: "text", text: "Success" }],
      isError: false,
    };

    // These should not throw and should be type-checked
    expect(result).toBeSuccessfulToolResult();
    expect(result).not.toHaveToolError();
  });

  it("should work with toMatchToolSchema", async () => {
    const { z } = await import("zod");
    const result: ToolResult = {
      content: [{ type: "text", text: '{"message":"Hello"}' }],
      isError: false,
    };
    const schema = z.object({ message: z.string() });

    expect(result).toMatchToolSchema(schema);
  });

  it("should work with toContainToolText", () => {
    const result: ToolResult = {
      content: [{ type: "text", text: "Hello, Alice!" }],
      isError: false,
    };

    expect(result).toContainToolText("Alice");
  });

  it("should work with toHaveToolError", () => {
    const result: ToolResult = {
      content: [{ type: "text", text: "VALIDATION_ERROR: Invalid" }],
      isError: true,
    };

    expect(result).toHaveToolError();
    expect(result).toHaveToolError("VALIDATION_ERROR");
  });
});
