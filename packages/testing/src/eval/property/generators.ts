/**
 * Property testing generators
 *
 * Provides generators for creating random test inputs using fast-check.
 * Requires fast-check as an optional peer dependency.
 */

import { createLazyLoader } from "../../utils/lazy-loader";
import { propertyLogger } from "../../debug";

/**
 * Lazy loader for fast-check module
 */
const getFastCheck = createLazyLoader(() => import("fast-check"), {
  packageName: "fast-check",
  installHint: "npm install -D fast-check",
});

/**
 * Ensure fast-check is loaded before using generators.
 * Call this once at the start of your test suite.
 *
 * @example
 * ```typescript
 * import { ensureFastCheckLoaded, generators, forAllInputs } from '@mcp-apps-kit/testing';
 *
 * beforeAll(async () => {
 *   await ensureFastCheckLoaded();
 * });
 *
 * it('should test property', async () => {
 *   const stringGen = generators.string({ minLength: 1 });
 *   await forAllInputs(stringGen, (input) => input.length >= 1);
 * });
 * ```
 */
export async function ensureFastCheckLoaded(): Promise<void> {
  await getFastCheck();
}

// Type for fast-check Arbitrary - use proper import type
type Arbitrary<T> = import("fast-check").Arbitrary<T>;

/**
 * Lazy arbitrary that defers fast-check calls until resolution.
 * This allows generators to be created before fast-check is loaded.
 */
export interface LazyArbitrary<T> {
  readonly __lazyArbitrary: true;
  readonly __type: T;
  resolve(fc: typeof import("fast-check")): Arbitrary<T>;
}

/**
 * Check if a value is a LazyArbitrary
 */
export function isLazyArbitrary<T>(value: unknown): value is LazyArbitrary<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "__lazyArbitrary" in value &&
    (value as LazyArbitrary<T>).__lazyArbitrary
  );
}

/**
 * Resolve a generator to an Arbitrary, loading fast-check if needed.
 * Handles both LazyArbitrary and direct Arbitrary values.
 */
export async function resolveArbitrary<T>(
  gen: LazyArbitrary<T> | Arbitrary<T>
): Promise<Arbitrary<T>> {
  if (isLazyArbitrary(gen)) {
    const fc = await getFastCheck();
    return gen.resolve(fc);
  }
  return gen;
}

/**
 * Create a lazy arbitrary
 */
function lazy<T>(resolver: (fc: typeof import("fast-check")) => Arbitrary<T>): LazyArbitrary<T> {
  return {
    __lazyArbitrary: true,
    __type: undefined as unknown as T,
    resolve: resolver,
  };
}

/**
 * Built-in value generators for property testing.
 *
 * Generators return LazyArbitrary instances that are resolved when
 * passed to forAllInputs(). This allows generators to be created
 * before fast-check is loaded (ESM-compatible lazy loading).
 */
export const generators = {
  /**
   * Generate random strings
   */
  string(options?: { minLength?: number; maxLength?: number }): LazyArbitrary<string> {
    propertyLogger("Creating string generator with options: %o", options);
    return lazy((fc) =>
      fc.string({
        minLength: options?.minLength,
        maxLength: options?.maxLength,
      })
    );
  },

  /**
   * Generate random integers
   */
  integer(min?: number, max?: number): LazyArbitrary<number> {
    propertyLogger("Creating integer generator: %d to %d", min ?? "unbounded", max ?? "unbounded");
    return lazy((fc) => {
      if (min !== undefined && max !== undefined) {
        return fc.integer({ min, max });
      } else if (min !== undefined) {
        return fc.integer({ min });
      } else if (max !== undefined) {
        return fc.integer({ max });
      }
      return fc.integer();
    });
  },

  /**
   * Generate random floats
   */
  float(min?: number, max?: number): LazyArbitrary<number> {
    propertyLogger("Creating float generator: %d to %d", min ?? "unbounded", max ?? "unbounded");
    return lazy((fc) => {
      if (min !== undefined && max !== undefined) {
        return fc.float({ min, max });
      } else if (min !== undefined) {
        return fc.float({ min });
      } else if (max !== undefined) {
        return fc.float({ max });
      }
      return fc.float();
    });
  },

  /**
   * Generate random booleans
   */
  boolean(): LazyArbitrary<boolean> {
    propertyLogger("Creating boolean generator");
    return lazy((fc) => fc.boolean());
  },

  /**
   * Generate random arrays
   */
  array<T>(
    gen: LazyArbitrary<T> | Arbitrary<T>,
    options?: { minLength?: number; maxLength?: number }
  ): LazyArbitrary<T[]> {
    propertyLogger("Creating array generator with options: %o", options);
    return lazy((fc) => {
      const innerArb = isLazyArbitrary(gen) ? gen.resolve(fc) : gen;
      return fc.array(innerArb, {
        minLength: options?.minLength,
        maxLength: options?.maxLength,
      });
    });
  },

  /**
   * Generate random objects
   */
  object<T extends Record<string, unknown>>(shape: {
    [K in keyof T]: LazyArbitrary<T[K]> | Arbitrary<T[K]>;
  }): LazyArbitrary<T> {
    propertyLogger("Creating object generator");
    return lazy((fc) => {
      // Build resolved shape by resolving any lazy arbitraries
      const resolvedShape: Record<string, Arbitrary<unknown>> = {};
      for (const key of Object.keys(shape)) {
        const gen = shape[key as keyof T];
        if (isLazyArbitrary(gen)) {
          resolvedShape[key] = gen.resolve(fc);
        } else {
          resolvedShape[key] = gen;
        }
      }
      return fc.record(resolvedShape) as Arbitrary<T>;
    });
  },

  /**
   * Generate one of the provided values
   */
  oneOf<T>(...values: T[]): LazyArbitrary<T> {
    propertyLogger("Creating oneOf generator with %d values", values.length);
    return lazy((fc) => fc.oneof(...values.map((v: T) => fc.constant(v))));
  },

  /**
   * Generate optional values
   */
  optional<T>(gen: LazyArbitrary<T> | Arbitrary<T>): LazyArbitrary<T | undefined> {
    propertyLogger("Creating optional generator");
    return lazy((fc) => {
      const innerArb = isLazyArbitrary(gen) ? gen.resolve(fc) : gen;
      return fc.option(innerArb, { nil: undefined });
    });
  },
};
