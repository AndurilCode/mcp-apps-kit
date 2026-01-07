/**
 * Property testing generators
 *
 * Provides generators for creating random test inputs using fast-check.
 * Requires fast-check and zod-fast-check as peer dependencies.
 */

import type { ZodSchema } from "zod";
import { ConfigurationError } from "../../errors";
import { propertyLogger } from "../../debug";

// Lazy-loaded modules (use any type to avoid strict typing issues)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fastCheckModule: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let zodFastCheckModule: any = null;

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
      throw new ConfigurationError(
        "fast-check",
        "fast-check is required for property testing. Install it with: npm install -D fast-check"
      );
    }
  }
  return fastCheckModule;
}

/**
 * Load zod-fast-check module (lazy, throws if not available)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getZodFastCheck(): any {
  if (!zodFastCheckModule) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      zodFastCheckModule = require("zod-fast-check");
    } catch {
      throw new ConfigurationError(
        "zod-fast-check",
        "zod-fast-check is required for Zod schema generation. Install it with: npm install -D zod-fast-check"
      );
    }
  }
  return zodFastCheckModule;
}

// Type for fast-check Arbitrary
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
type Arbitrary<_T> = any;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  array<T>(gen: Arbitrary<T>, options?: { minLength?: number; maxLength?: number }): Arbitrary<T[]> {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  object<T>(shape: { [K in keyof T]: Arbitrary<T[K]> }): Arbitrary<T> {
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
    return fc.option(gen);
  },

  /**
   * Generate values from a Zod schema
   */
  fromSchema<T>(schema: ZodSchema<T>): Arbitrary<T> {
    propertyLogger("Creating generator from Zod schema");
    const zodFastCheck = getZodFastCheck();
    const fc = getFastCheck();
    // zod-fast-check exports ZodFastCheck with an arbitrary method
    return zodFastCheck.ZodFastCheck().arbitrary(schema, { fc });
  },
};
