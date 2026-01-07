/**
 * Property-based test runner
 *
 * Executes property tests using fast-check with shrinking support.
 */

import type { PropertyTestOptions } from "../../types";
import { PropertyFailureError } from "../../errors";
import { propertyLogger } from "../../debug";
import { createLazyLoader } from "../../utils/lazy-loader";
import { type LazyArbitrary, isLazyArbitrary } from "./generators";

/**
 * Lazy loader for fast-check module
 */
const getFastCheck = createLazyLoader(() => import("fast-check"), {
  packageName: "fast-check",
  installHint: "npm install -D fast-check",
});

// Type for fast-check Arbitrary - use proper import type
type Arbitrary<T> = import("fast-check").Arbitrary<T>;

/**
 * Run property-based tests
 *
 * @param generator - A LazyArbitrary from generators.* or a fast-check Arbitrary
 * @param predicate - Function that returns true if the property holds
 * @param options - Test options (numRuns, seed, timeout)
 */
export async function forAllInputs<T>(
  generator: LazyArbitrary<T> | Arbitrary<T>,
  predicate: (input: T) => boolean | Promise<boolean>,
  options: PropertyTestOptions = {}
): Promise<void> {
  const { numRuns = 100, seed, timeout } = options;

  propertyLogger("Running property test with %d runs%s", numRuns, seed ? ` (seed: ${seed})` : "");

  const fc = await getFastCheck();

  // Resolve lazy arbitrary if needed
  const resolvedGenerator = isLazyArbitrary(generator) ? generator.resolve(fc) : generator;

  // Create the property
  const property = fc.asyncProperty(resolvedGenerator, async (input: T) => {
    const result = await predicate(input);
    if (!result) {
      throw new Error("Property failed");
    }
  });

  // Configure runner with verbose mode for better error reporting
  const runnerOptions: Parameters<typeof fc.assert>[1] = {
    numRuns,
    verbose: true, // Enable verbose mode to get counterexample details
  };
  if (seed !== undefined) runnerOptions.seed = seed;
  if (timeout !== undefined) runnerOptions.timeout = timeout;

  try {
    await fc.assert(property, runnerOptions);
    propertyLogger("Property test passed after %d runs", numRuns);
  } catch (error) {
    // Extract detailed failure information from fast-check error
    const failureInfo = extractFailureInfo(error, numRuns);
    propertyLogger(
      "Property test failed. Counterexample: %o, Shrunk: %o",
      failureInfo.counterexample,
      failureInfo.shrunkCounterexample
    );

    throw new PropertyFailureError(
      failureInfo.counterexample,
      failureInfo.shrunkCounterexample,
      failureInfo.message,
      failureInfo.seed,
      failureInfo.numShrinks
    );
  }
}

/**
 * Failure information extracted from fast-check error
 */
interface FailureInfo {
  counterexample: unknown;
  shrunkCounterexample: unknown;
  message: string;
  seed?: number;
  numRuns?: number;
  numShrinks?: number;
}

/**
 * Extract detailed failure information from fast-check error
 */
function extractFailureInfo(error: unknown, numRuns: number): FailureInfo {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Default failure info
  let counterexample: unknown = errorMessage;
  let shrunkCounterexample: unknown = errorMessage;
  let seed: number | undefined;
  let actualNumRuns: number | undefined;
  let numShrinks: number | undefined;

  // Fast-check errors have a specific structure with counterexample info
  // Try to extract it from the error object if available
  if (error && typeof error === "object") {
    const fcError = error as {
      counterexample?: unknown[];
      counterexamplePath?: string;
      seed?: number;
      numRuns?: number;
      numShrinks?: number;
    };

    // Fast-check stores the counterexample as an array (one entry per arbitrary)
    if (fcError.counterexample !== undefined) {
      // For single arbitrary, unwrap the array
      counterexample =
        Array.isArray(fcError.counterexample) && fcError.counterexample.length === 1
          ? fcError.counterexample[0]
          : fcError.counterexample;
      // The shrunk counterexample is the same as counterexample after shrinking
      shrunkCounterexample = counterexample;
    }

    seed = fcError.seed;
    actualNumRuns = fcError.numRuns;
    numShrinks = fcError.numShrinks;
  }

  // Try to parse counterexample from error message as fallback
  if (counterexample === errorMessage) {
    // fast-check error messages often contain: "Counterexample: [value]"
    const counterexampleMatch = errorMessage.match(/Counterexample:\s*\[([^\]]+)\]/);
    if (counterexampleMatch) {
      try {
        counterexample = JSON.parse(`[${counterexampleMatch[1]}]`);
        if (Array.isArray(counterexample) && counterexample.length === 1) {
          counterexample = counterexample[0];
        }
        shrunkCounterexample = counterexample;
      } catch {
        // Keep as string if JSON parse fails
        counterexample = counterexampleMatch[1];
        shrunkCounterexample = counterexample;
      }
    }
  }

  // Build informative message
  let message = `Property test failed after ${actualNumRuns ?? numRuns} runs`;
  if (numShrinks !== undefined && numShrinks > 0) {
    message += ` (shrunk ${numShrinks} time${numShrinks === 1 ? "" : "s"})`;
  }
  if (seed !== undefined) {
    message += ` [seed: ${seed}]`;
  }
  message += `\nCounterexample: ${JSON.stringify(counterexample)}`;

  return {
    counterexample,
    shrunkCounterexample,
    message,
    seed,
    numRuns: actualNumRuns,
    numShrinks,
  };
}
