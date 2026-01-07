/**
 * Test case and suite definitions
 *
 * Provides functions for defining reusable test suites.
 */

import type { TestSuite, TestCase } from "../../types";
import { behaviorLogger } from "../../debug";

/**
 * Configuration for defining a test suite
 */
export interface TestSuiteConfig {
  /** Suite name */
  name: string;
  /** Tool being tested */
  tool: string;
  /** Test cases */
  cases: TestCase[];
  /** Setup function run before each case */
  beforeEach?: () => Promise<void>;
  /** Teardown function run after each case */
  afterEach?: () => Promise<void>;
}

/**
 * Define a reusable test suite
 *
 * @param config - Test suite configuration
 * @returns Test suite instance
 *
 * @example
 * ```typescript
 * const suite = defineTestSuite({
 *   name: 'greet tool',
 *   tool: 'greet',
 *   cases: [
 *     { name: 'greets by name', input: { name: 'Alice' }, expected: { message: 'Hello, Alice!' } },
 *     { name: 'handles empty', input: { name: '' }, expectError: { code: 'VALIDATION_ERROR' } },
 *   ],
 * });
 * ```
 */
export function defineTestSuite(config: TestSuiteConfig): TestSuite {
  behaviorLogger("Defining test suite: %s for tool: %s", config.name, config.tool);

  // Validate that we have at least one test case
  if (!config.cases || config.cases.length === 0) {
    throw new Error("Test suite must have at least one test case");
  }

  // Validate that all cases have names
  for (const testCase of config.cases) {
    if (!testCase.name || typeof testCase.name !== "string") {
      throw new Error("All test cases must have a name");
    }
  }

  return {
    name: config.name,
    tool: config.tool,
    cases: config.cases,
    beforeEach: config.beforeEach,
    afterEach: config.afterEach,
  };
}
