/**
 * Test suite runner
 *
 * Executes test suites against a test client and collects results.
 */

import type { TestClient, TestSuite, TestCase, TestCaseResult, TestSuiteResult } from "../../types";
import { expectToolResult } from "./matchers";
import { behaviorLogger } from "../../debug";

/**
 * Run a test suite against a test client
 *
 * @param client - Test client to use for tool calls
 * @param suite - Test suite to execute
 * @returns Test suite results
 *
 * @example
 * ```typescript
 * const results = await runTestSuite(client, suite);
 * console.log(`${results.passed}/${results.total} passed`);
 * ```
 */
export async function runTestSuite(
  client: TestClient,
  suite: TestSuite
): Promise<TestSuiteResult> {
  behaviorLogger("Running test suite: %s", suite.name);

  const startTime = Date.now();
  const caseResults: TestCaseResult[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  // Filter cases based on only/skip flags
  let casesToRun = suite.cases;

  // Check if any case has only=true
  const onlyCases = casesToRun.filter((c) => c.only);
  if (onlyCases.length > 0) {
    casesToRun = onlyCases;
    behaviorLogger("Running only %d cases (only flag set)", onlyCases.length);
  }

  // Run each test case
  for (const testCase of casesToRun) {
    // Skip if marked
    if (testCase.skip) {
      skipped++;
      caseResults.push({
        name: testCase.name,
        status: "skipped",
        duration: 0,
      });
      continue;
    }

    const caseStartTime = Date.now();
    let caseResult: TestCaseResult;

    try {
      // Run beforeEach if provided
      if (suite.beforeEach) {
        await suite.beforeEach();
      }

      // Execute the test case
      const result = await runTestCase(client, suite.tool, testCase);

      // Run afterEach if provided
      if (suite.afterEach) {
        await suite.afterEach();
      }

      const duration = Date.now() - caseStartTime;
      passed++;
      caseResult = {
        name: testCase.name,
        status: "passed",
        duration,
        actual: result,
        expected: testCase.expected,
      };
    } catch (error) {
      const duration = Date.now() - caseStartTime;
      failed++;
      caseResult = {
        name: testCase.name,
        status: "failed",
        duration,
        error: error instanceof Error ? error : new Error(String(error)),
        actual: undefined,
        expected: testCase.expected,
      };
    }

    caseResults.push(caseResult);
  }

  const duration = Date.now() - startTime;

  behaviorLogger(
    "Test suite completed: %d passed, %d failed, %d skipped in %dms",
    passed,
    failed,
    skipped,
    duration
  );

  return {
    name: suite.name,
    total: casesToRun.length,
    passed,
    failed,
    skipped,
    cases: caseResults,
    duration,
  };
}

/**
 * Run a single test case
 */
async function runTestCase(
  client: TestClient,
  toolName: string,
  testCase: TestCase
): Promise<unknown> {
  behaviorLogger("Running test case: %s", testCase.name);

  // Set up timeout if specified
  const timeout = testCase.timeout;
  let timeoutId: NodeJS.Timeout | undefined;

  const timeoutPromise = timeout
    ? new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Test case timed out after ${timeout}ms`));
        }, timeout);
      })
    : null;

  try {
    // Call the tool
    const callPromise = client.callTool(toolName, testCase.input);
    const result = timeoutPromise
      ? await Promise.race([callPromise, timeoutPromise])
      : await callPromise;

    // Clear timeout if it was set
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Check for expected error
    if (testCase.expectError) {
      const assertion = expectToolResult(result);
      if (testCase.expectError.code) {
        assertion.toHaveError(testCase.expectError.code);
      } else {
        assertion.toHaveError();
      }
      return result;
    }

    // Check for expected output
    if (testCase.expected !== undefined) {
      const assertion = expectToolResult(result);
      assertion.toHaveNoError();
      assertion.toMatchObject(testCase.expected);
    } else {
      // Just check for no error
      const assertion = expectToolResult(result);
      assertion.toHaveNoError();
    }

    return result;
  } catch (error) {
    // Clear timeout if it was set
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // If we expected an error, check if it matches
    if (testCase.expectError) {
      // Error was expected, but we need to verify it matches
      // The error might be in the result or thrown
      if (error instanceof Error && testCase.expectError.message) {
        if (!testCase.expectError.message.test(error.message)) {
          throw new Error(
            `Expected error message to match ${testCase.expectError.message}, but got: ${error.message}`
          );
        }
      }
      // If error was expected and we got one, that's fine
      return { error: error instanceof Error ? error.message : String(error) };
    }

    // Error was not expected, rethrow
    throw error;
  }
}
