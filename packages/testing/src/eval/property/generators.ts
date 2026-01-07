/**
 * Property testing generators
 *
 * Provides generators for creating random test inputs using fast-check.
 * Requires fast-check as a peer dependency.
 */

import { ConfigurationError } from "../../errors";
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
      throw new ConfigurationError(
        "fast-check",
        "fast-check is required for property testing. Install it with: npm install -D fast-check"
      );
    }
  }
  return fastCheckModule;
}

// Type for fast-check Arbitrary - use proper import type
type Arbitrary<T> = import("fast-check").Arbitrary<T>;

/**
 * Built-in value generators for property testing
 */
export const generators = {
  /**
   * Generate random strings
   */
  string(options?: { minLength?: number; maxLength?: number }): Arbitrary<string> {
    propertyLogger("Creating string generator with options: %o", options);
    const fc = getFastCheck();
    return fc.string({
      minLength: options?.minLength,
      maxLength: options?.maxLength,
    });
  },

  /**
   * Generate random integers
   */
  integer(min?: number, max?: number): Arbitrary<number> {
    propertyLogger("Creating integer generator: %d to %d", min ?? "unbounded", max ?? "unbounded");
    const fc = getFastCheck();
    if (min !== undefined && max !== undefined) {
      return fc.integer({ min, max });
    } else if (min !== undefined) {
      return fc.integer({ min });
    } else if (max !== undefined) {
      return fc.integer({ max });
    }
    return fc.integer();
  },

  /**
   * Generate random floats
   */
  float(min?: number, max?: number): Arbitrary<number> {
    propertyLogger("Creating float generator: %d to %d", min ?? "unbounded", max ?? "unbounded");
    const fc = getFastCheck();
    if (min !== undefined && max !== undefined) {
      return fc.float({ min, max });
    } else if (min !== undefined) {
      return fc.float({ min });
    } else if (max !== undefined) {
      return fc.float({ max });
    }
    return fc.float();
  },

  /**
   * Generate random booleans
   */
  boolean(): Arbitrary<boolean> {
    propertyLogger("Creating boolean generator");
    const fc = getFastCheck();
    return fc.boolean();
  },

  /**
   * Generate random arrays
   */
  array<T>(
    gen: Arbitrary<T>,
    options?: { minLength?: number; maxLength?: number }
  ): Arbitrary<T[]> {
    propertyLogger("Creating array generator with options: %o", options);
    const fc = getFastCheck();
    return fc.array(gen, {
      minLength: options?.minLength,
      maxLength: options?.maxLength,
    });
  },

  /**
   * Generate random objects
   */
  object<T extends Record<string, unknown>>(shape: {
    [K in keyof T]: Arbitrary<T[K]>;
  }): Arbitrary<T> {
    propertyLogger("Creating object generator");
    const fc = getFastCheck();
    return fc.record(shape);
  },

  /**
   * Generate one of the provided values
   */
  oneOf<T>(...values: T[]): Arbitrary<T> {
    propertyLogger("Creating oneOf generator with %d values", values.length);
    const fc = getFastCheck();
    return fc.oneof(...values.map((v: T) => fc.constant(v)));
  },

  /**
   * Generate optional values
   */
  optional<T>(gen: Arbitrary<T>): Arbitrary<T | undefined> {
    propertyLogger("Creating optional generator");
    const fc = getFastCheck();
    return fc.option(gen, { nil: undefined });
  },
};
