/**
 * Unit tests for cost-utils
 *
 * Tests parseCostToDollars and formatCostAsDollars utility functions.
 */

import { describe, it, expect } from "vitest";
import { parseCostToDollars, formatCostAsDollars } from "../../../src/eval/mcp/cost-utils";

describe("parseCostToDollars", () => {
  it("parses dollar strings", () => {
    expect(parseCostToDollars("$0.001234")).toBe(0.001234);
    expect(parseCostToDollars("$1.50")).toBe(1.5);
    expect(parseCostToDollars("$0")).toBe(0);
    expect(parseCostToDollars("$100")).toBe(100);
  });

  it("parses cent strings and converts to dollars", () => {
    expect(parseCostToDollars("0.5¢")).toBeCloseTo(0.005, 6);
    expect(parseCostToDollars("50¢")).toBeCloseTo(0.5, 6);
    expect(parseCostToDollars("1¢")).toBeCloseTo(0.01, 6);
    expect(parseCostToDollars("100¢")).toBeCloseTo(1, 6);
  });

  it("returns 0 for undefined or empty input", () => {
    expect(parseCostToDollars(undefined)).toBe(0);
    expect(parseCostToDollars("")).toBe(0);
  });

  it("returns 0 for non-numeric strings", () => {
    expect(parseCostToDollars("$abc")).toBe(0);
    expect(parseCostToDollars("not a number")).toBe(0);
    expect(parseCostToDollars("¢")).toBe(0);
  });

  it("handles strings without currency symbols", () => {
    // parseFloat strips leading non-numeric chars won't work, but bare numbers do
    expect(parseCostToDollars("1.5")).toBe(1.5);
    expect(parseCostToDollars("0")).toBe(0);
  });
});

describe("formatCostAsDollars", () => {
  it("formats with default precision (6)", () => {
    expect(formatCostAsDollars(0.001234)).toBe("$0.001234");
    expect(formatCostAsDollars(1.5)).toBe("$1.500000");
    expect(formatCostAsDollars(0)).toBe("$0.000000");
  });

  it("formats with custom precision", () => {
    expect(formatCostAsDollars(1.5, 2)).toBe("$1.50");
    expect(formatCostAsDollars(0.001234, 4)).toBe("$0.0012");
    expect(formatCostAsDollars(100, 0)).toBe("$100");
  });

  it("handles large values", () => {
    expect(formatCostAsDollars(999.999999)).toBe("$999.999999");
  });

  it("handles negative values", () => {
    expect(formatCostAsDollars(-0.5, 2)).toBe("$-0.50");
  });
});
