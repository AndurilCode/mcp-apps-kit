/**
 * Property-based test runner
 *
 * Executes property tests using fast-check with shrinking support.
 */

import type { PropertyTestOptions } from "../../types";
import { PropertyFailureError } from "../../errors";
import { propertyLogger } from "../../debug";

// Lazy-loaded fast-check module
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fastCheckModule: any = null;

/**
 * Load fast-check module (lazy, throws if not available)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getFastCheck(): any {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
type Arbitrary<_T> = any;

/**
 * Run property-based tests
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runnerOptions: any = { numRuns };
  if (seed !== undefined) runnerOptions.seed = seed;
  if (timeout !== undefined) runnerOptions.timeout = timeout;

  try {
    await fc.assert(property, runnerOptions);
    propertyLogger("Property test passed after %d runs", numRuns);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const failingInputMatch = errorMessage.match(/Got error: (.+)/);
    const failingInput = failingInputMatch ? failingInputMatch[1] : undefined;

    throw new PropertyFailureError(
      failingInput ?? errorMessage,
      failingInput ?? errorMessage,
      `Property test failed after ${numRuns} runs: ${errorMessage}`
    );
  }
}
