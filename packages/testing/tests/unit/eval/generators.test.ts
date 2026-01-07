/**
 * Unit tests for property testing generators
 *
 * Note: These tests require fast-check to be installed.
 * They will be skipped if the dependency is not available.
 */

import { describe, it, expect } from "vitest";
import { generators } from "../../../src/eval/property";

// Detect whether fast-check is available
let isFastCheckAvailable = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("fast-check");
  isFastCheckAvailable = true;
} catch {
  isFastCheckAvailable = false;
}

describe("generators", () => {
  it("does not throw ConfigurationError when fast-check is installed", () => {
    // This test verifies that generators work when fast-check is available
    // Since fast-check is installed in this project, we verify normal operation
    if (isFastCheckAvailable) {
      expect(() => {
        generators.string();
      }).not.toThrow();
    }
  });

  it.skipIf(!isFastCheckAvailable)("should create generators when fast-check is available", () => {
    const stringGen = generators.string({ minLength: 1, maxLength: 10 });
    expect(stringGen).toBeDefined();
  });
});
