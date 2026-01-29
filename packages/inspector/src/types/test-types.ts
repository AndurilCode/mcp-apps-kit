/**
 * Test Types
 *
 * Types for test suite definition and execution.
 */

// =============================================================================
// TEST SUITE TYPES
// =============================================================================

/**
 * Test case in a suite
 */
export interface TestCaseInput {
  name: string;
  input: Record<string, unknown>;
  expected?: Record<string, unknown>;
  skip?: boolean;
}

/**
 * Test suite input
 */
export interface TestSuiteInput {
  name: string;
  tool: string;
  cases: TestCaseInput[];
}

/**
 * Input for run_test_suite
 */
export interface RunTestSuiteInput {
  suite: TestSuiteInput;
}

/**
 * Test case result
 */
export interface TestCaseResultOutput {
  name: string;
  status: "passed" | "failed" | "skipped";
  duration: number;
  error?: string;
  actual?: unknown;
  expected?: unknown;
}

/**
 * Output from run_test_suite
 */
export interface RunTestSuiteOutput {
  suiteName: string;
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  duration: number;
  results: TestCaseResultOutput[];
}
