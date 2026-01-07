/**
 * Property-based test runner
 *
 * Executes property tests using fast-check with shrinking support.
 */

import type { PropertyTestOptions } from "../../types";
import { PropertyFailureError } from "../../errors";
import { propertyLogger } from "../../debug";

// Lazy-loaded fast-check module
let fastCheckModule: typeof import("fast-check") | null = null;

/**
 * Load fast-check module (lazy, throws if not available)
 */
function getFastCheck(): typeof import("fast-check") {
  if (!fastCheckModule) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      fastCheckModule = require("fast-check");
    } catch {
      throw new Error(
        "fast-check is required for property testing. Install it with: npm install -D fast-check"
      );
    }
  }
  return fastCheckModule;
}

// Type for fast-check Arbitrary
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Arbitrary<T> = any;

/**
 * Run property-based tests
 *
 * @param generator - Fast-check arbitrary generator
 * @param predicate - Property to test (returns true if property holds)
 * @param options - Test options
 * @throws PropertyFailureError if property fails
 *
 * @example
 * ```typescript
 * await forAllInputs(
 *   generators.fromSchema(inputSchema),
 *   async (input) => {
 *     const result = await client.callTool('greet', input);
 *     return result.content[0].text.includes(input.name);
 *   },
 *   { numRuns: 100, seed: 12345 }
 * );
 * ```
 */
export async function forAllInputs<T>(
  generator: Arbitrary<T>,
  predicate: (input: T) => boolean | Promise<boolean>,
  options: PropertyTestOptions = {}
): Promise<void> {
  const { numRuns = 100, seed, timeout } = options;

  propertyLogger("Running property test with %d runs%s", numRuns, seed ? ` (seed: ${seed})` : "");

  const fc = getFastCheck();

  // Create the property
  const property = fc.asyncProperty(generator, async (input: T) => {
    const result = await predicate(input);
    if (!result) {
      throw new Error("Property failed");
    }
  });

  // Configure runner
  const runnerOptions: {
    numRuns?: number;
    seed?: number;
    timeout?: number;
  } = {
    numRuns,
  };

  if (seed !== undefined) {
    runnerOptions.seed = seed;
  }

  if (timeout !== undefined) {
    runnerOptions.timeout = timeout;
  }

  try {
    // Run the property test
    await fc.assert(property, runnerOptions);
    propertyLogger("Property test passed after %d runs", numRuns);
  } catch (error) {
    // fast-check throws an Error with details about the failure
    // We need to extract the failing input and shrunk input from the error
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Try to extract input from error message (fast-check format)
    // This is a simplified extraction - in practice, fast-check provides
    // more structured error information
    const failingInputMatch = errorMessage.match(/Got error: (.+)/);
    const failingInput = failingInputMatch ? failingInputMatch[1] : undefined;

    // For now, we'll use the error message as the failing input
    // In a real implementation, we'd parse fast-check's error structure
    throw new PropertyFailureError(
      failingInput ?? errorMessage,
      failingInput ?? errorMessage, // Shrunk input (same for now)
      `Property test failed after ${numRuns} runs: ${errorMessage}`
    );
  }
}
