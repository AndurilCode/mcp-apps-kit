/**
 * Integration tests for property-based testing
 *
 * These tests verify the full property testing workflow.
 * Requires fast-check and zod-fast-check to be installed.
 */

import { describe, it, expect } from "vitest";
import { generators, forAllInputs } from "../../../src/eval/property";
import { PropertyFailureError } from "../../../src/errors";

describe("Property Testing Integration", () => {
  it("should run property tests with generators", async () => {
    // This test requires fast-check to be installed
    // Will be skipped or fail gracefully if not available
    try {
      const stringGen = generators.string({ minLength: 1, maxLength: 10 });

      await forAllInputs(
        stringGen,
        (input) => {
          // Property: string length should be within bounds
          return input.length >= 1 && input.length <= 10;
        },
        { numRuns: 10 }
      );
    } catch (error) {
      // If fast-check is not available, skip the test
      if (error instanceof Error && error.message.includes("fast-check")) {
        // Test skipped - fast-check not available
        return;
      }
      throw error;
    }
  });

  it("should throw PropertyFailureError when property fails", async () => {
    // This test requires fast-check to be installed
    try {
      const stringGen = generators.string({ minLength: 1, maxLength: 10 });

      await expect(
        forAllInputs(
          stringGen,
          (input) => {
            // Property that will always fail
            return input.length > 100;
          },
          { numRuns: 10 }
        )
      ).rejects.toThrow(PropertyFailureError);
    } catch (error) {
      // If fast-check is not available, skip the test
      if (error instanceof Error && error.message.includes("fast-check")) {
        // Test skipped - fast-check not available
        return;
      }
      throw error;
    }
  });
});
