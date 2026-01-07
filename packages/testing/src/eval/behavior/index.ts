/**
 * Behavior testing module
 *
 * Provides tools for testing tool behavior with assertions and test suites.
 */

export { expectToolResult } from "./matchers";
export { defineTestSuite } from "./test-case";
export type { TestSuiteConfig } from "./test-case";
export { runTestSuite } from "./runner";
