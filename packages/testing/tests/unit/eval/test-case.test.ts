/**
 * Unit tests for test case definitions
 */

import { describe, it, expect } from "vitest";
import { defineTestSuite } from "../../../src/eval/behavior";

describe("defineTestSuite", () => {
  it("should create a test suite with valid config", () => {
    const suite = defineTestSuite({
      name: "test suite",
      tool: "greet",
      cases: [
        { name: "test 1", input: { name: "Alice" } },
        { name: "test 2", input: { name: "Bob" } },
      ],
    });

    expect(suite.name).toBe("test suite");
    expect(suite.tool).toBe("greet");
    expect(suite.cases).toHaveLength(2);
  });

  it("should throw when no cases provided", () => {
    expect(() => {
      defineTestSuite({
        name: "test suite",
        tool: "greet",
        cases: [],
      });
    }).toThrow("Test suite must have at least one test case");
  });

  it("should throw when case has no name", () => {
    expect(() => {
      defineTestSuite({
        name: "test suite",
        tool: "greet",
        cases: [{ name: "", input: {} }],
      });
    }).toThrow("All test cases must have a name");
  });

  it("should include beforeEach and afterEach hooks", () => {
    const beforeEach = async () => {};
    const afterEach = async () => {};

    const suite = defineTestSuite({
      name: "test suite",
      tool: "greet",
      cases: [{ name: "test 1", input: {} }],
      beforeEach,
      afterEach,
    });

    expect(suite.beforeEach).toBe(beforeEach);
    expect(suite.afterEach).toBe(afterEach);
  });
});
