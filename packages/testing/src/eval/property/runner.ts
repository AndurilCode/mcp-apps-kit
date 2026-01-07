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
      fastCheckModule = require("fast-check") as typeof import("fast-check");
    } catch {
      throw new Error(
        "fast-check is required for property testing. Install it with: npm install -D fast-check"
      );
    }
  }
  return fastCheckModule;
}

// Type for fast-check Arbitrary - use proper import type
type Arbitrary<T> = import("fast-check").Arbitrary<T>;

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
  const runnerOptions: Parameters<typeof fc.assert>[1] = { numRuns };
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
