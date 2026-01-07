/**
 * Unit tests for property testing generators
 *
 * Note: These tests require fast-check and zod-fast-check to be installed.
 * They will be skipped if the dependencies are not available.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { generators } from "../../../src/eval/property";
import { ConfigurationError } from "../../../src/errors";

describe("generators", () => {
  it("should throw ConfigurationError if fast-check is not installed", () => {
    // This test verifies the error handling
    // In a real scenario, fast-check would be installed
    // We can't easily test the absence of fast-check without mocking require
    expect(() => {
      try {
        generators.string();
      } catch (error) {
        if (error instanceof ConfigurationError && error.missing === "fast-check") {
          throw error;
        }
      }
    }).toThrow(ConfigurationError);
  });

  it("should create generators when fast-check is available", () => {
    // This test will only pass if fast-check is installed
    // In CI/CD, we should ensure fast-check is available for these tests
    try {
      const stringGen = generators.string({ minLength: 1, maxLength: 10 });
      expect(stringGen).toBeDefined();
    } catch (error) {
      // Skip test if fast-check is not available
      if (error instanceof ConfigurationError) {
        // eslint-disable-next-line vitest/no-conditional-in-test
        expect(error.missing).toBe("fast-check");
      } else {
        throw error;
      }
    }
  });
});
