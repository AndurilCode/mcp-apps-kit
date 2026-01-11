/**
 * Unit tests for property testing generators
 *
 * Note: These tests require fast-check to be installed.
 * They will be skipped if the dependency is not available.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  generators,
  ensureFastCheckLoaded,
  isLazyArbitrary,
  resolveArbitrary,
} from "../../../src/eval/property";

// Detect whether fast-check is available
let isFastCheckAvailable = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("fast-check");
  isFastCheckAvailable = true;
} catch {
  isFastCheckAvailable = false;
}

describe("generators", () => {
  it("does not throw ConfigurationError when fast-check is installed", () => {
    // This test verifies that generators work when fast-check is available
    // Since fast-check is installed in this project, we verify normal operation
    if (isFastCheckAvailable) {
      expect(() => {
        generators.string();
      }).not.toThrow();
    }
  });

  it.skipIf(!isFastCheckAvailable)("should create generators when fast-check is available", () => {
    const stringGen = generators.string({ minLength: 1, maxLength: 10 });
    expect(stringGen).toBeDefined();
  });

  describe("string generator", () => {
    it("should create string generator with default options", () => {
      const gen = generators.string();
      expect(gen).toBeDefined();
      expect(gen.__lazyArbitrary).toBe(true);
    });

    it("should create string generator with options", () => {
      const gen = generators.string({ minLength: 5, maxLength: 20 });
      expect(gen).toBeDefined();
    });
  });

  describe("integer generator", () => {
    it("should create integer generator with no bounds", () => {
      const gen = generators.integer();
      expect(gen).toBeDefined();
    });

    it("should create integer generator with min only", () => {
      const gen = generators.integer(5);
      expect(gen).toBeDefined();
    });

    it("should create integer generator with max only", () => {
      const gen = generators.integer(undefined, 100);
      expect(gen).toBeDefined();
    });

    it("should create integer generator with both bounds", () => {
      const gen = generators.integer(5, 100);
      expect(gen).toBeDefined();
    });
  });

  describe("float generator", () => {
    it("should create float generator with no bounds", () => {
      const gen = generators.float();
      expect(gen).toBeDefined();
    });

    it("should create float generator with min only", () => {
      const gen = generators.float(0);
      expect(gen).toBeDefined();
    });

    it("should create float generator with max only", () => {
      const gen = generators.float(undefined, 1.0);
      expect(gen).toBeDefined();
    });

    it("should create float generator with both bounds", () => {
      const gen = generators.float(0, 1.0);
      expect(gen).toBeDefined();
    });
  });

  describe("boolean generator", () => {
    it("should create boolean generator", () => {
      const gen = generators.boolean();
      expect(gen).toBeDefined();
    });
  });

  describe("array generator", () => {
    it("should create array generator with default options", () => {
      const gen = generators.array(generators.string());
      expect(gen).toBeDefined();
    });

    it("should create array generator with options", () => {
      const gen = generators.array(generators.string(), { minLength: 1, maxLength: 5 });
      expect(gen).toBeDefined();
    });
  });

  describe("object generator", () => {
    it("should create object generator", () => {
      const gen = generators.object({
        name: generators.string(),
        age: generators.integer(0, 120),
      });
      expect(gen).toBeDefined();
    });
  });

  describe("oneOf generator", () => {
    it("should create oneOf generator", () => {
      const gen = generators.oneOf("a", "b", "c");
      expect(gen).toBeDefined();
    });
  });

  describe("optional generator", () => {
    it("should create optional generator", () => {
      const gen = generators.optional(generators.string());
      expect(gen).toBeDefined();
    });
  });
});

describe("isLazyArbitrary", () => {
  it("should return true for lazy arbitraries", () => {
    const gen = generators.string();
    expect(isLazyArbitrary(gen)).toBe(true);
  });

  it("should return false for null", () => {
    expect(isLazyArbitrary(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(isLazyArbitrary(undefined)).toBe(false);
  });

  it("should return false for primitives", () => {
    expect(isLazyArbitrary("string")).toBe(false);
    expect(isLazyArbitrary(123)).toBe(false);
    expect(isLazyArbitrary(true)).toBe(false);
  });

  it("should return false for regular objects", () => {
    expect(isLazyArbitrary({})).toBe(false);
    expect(isLazyArbitrary({ __lazyArbitrary: false })).toBe(false);
  });
});

describe.skipIf(!isFastCheckAvailable)("resolving generators with fast-check", () => {
  beforeAll(async () => {
    await ensureFastCheckLoaded();
  });

  it("should resolve lazy arbitrary", async () => {
    const gen = generators.string();
    const resolved = await resolveArbitrary(gen);
    expect(resolved).toBeDefined();
    expect(typeof resolved.generate).toBe("function");
  });

  it("should resolve integer generator with min and max", async () => {
    const gen = generators.integer(0, 100);
    const resolved = await resolveArbitrary(gen);
    expect(resolved).toBeDefined();
  });

  it("should resolve integer generator with min only", async () => {
    const gen = generators.integer(0, undefined);
    const resolved = await resolveArbitrary(gen);
    expect(resolved).toBeDefined();
  });

  it("should resolve integer generator with max only", async () => {
    const gen = generators.integer(undefined, 100);
    const resolved = await resolveArbitrary(gen);
    expect(resolved).toBeDefined();
  });

  it("should resolve float generator with min and max", async () => {
    const gen = generators.float(0, 1);
    const resolved = await resolveArbitrary(gen);
    expect(resolved).toBeDefined();
  });

  it("should resolve float generator with min only", async () => {
    const gen = generators.float(0, undefined);
    const resolved = await resolveArbitrary(gen);
    expect(resolved).toBeDefined();
  });

  it("should resolve float generator with max only", async () => {
    const gen = generators.float(undefined, 1);
    const resolved = await resolveArbitrary(gen);
    expect(resolved).toBeDefined();
  });

  it("should resolve array generator with lazy inner arbitrary", async () => {
    const gen = generators.array(generators.integer(0, 10), { minLength: 1, maxLength: 5 });
    const resolved = await resolveArbitrary(gen);
    expect(resolved).toBeDefined();
  });

  it("should resolve object generator with lazy inner arbitraries", async () => {
    const gen = generators.object({
      name: generators.string(),
      count: generators.integer(0, 100),
    });
    const resolved = await resolveArbitrary(gen);
    expect(resolved).toBeDefined();
  });

  it("should resolve optional generator", async () => {
    const gen = generators.optional(generators.boolean());
    const resolved = await resolveArbitrary(gen);
    expect(resolved).toBeDefined();
  });
});

describe.skipIf(!isFastCheckAvailable)("generated value validation", () => {
  let fc: typeof import("fast-check");

  beforeAll(async () => {
    await ensureFastCheckLoaded();
    fc = await import("fast-check");
  });

  it("should generate strings within length bounds", async () => {
    const gen = generators.string({ minLength: 5, maxLength: 10 });
    const resolved = await resolveArbitrary(gen);
    const samples = fc.sample(resolved, 50);
    expect(samples.every((s) => s.length >= 5 && s.length <= 10)).toBe(true);
  });

  it("should generate integers within bounds", async () => {
    const gen = generators.integer(10, 20);
    const resolved = await resolveArbitrary(gen);
    const samples = fc.sample(resolved, 50);
    expect(samples.every((n) => n >= 10 && n <= 20 && Number.isInteger(n))).toBe(true);
  });

  it("should generate floats within bounds", async () => {
    const gen = generators.float(0, 1);
    const resolved = await resolveArbitrary(gen);
    const samples = fc.sample(resolved, 50);
    expect(samples.every((n) => n >= 0 && n <= 1)).toBe(true);
  });

  it("should generate booleans", async () => {
    const gen = generators.boolean();
    const resolved = await resolveArbitrary(gen);
    const samples = fc.sample(resolved, 50);
    expect(samples.every((b) => typeof b === "boolean")).toBe(true);
    // With 50 samples, we should see both true and false
    expect(samples.some((b) => b === true)).toBe(true);
    expect(samples.some((b) => b === false)).toBe(true);
  });

  it("should generate arrays within length bounds", async () => {
    const gen = generators.array(generators.integer(0, 10), { minLength: 2, maxLength: 4 });
    const resolved = await resolveArbitrary(gen);
    const samples = fc.sample(resolved, 20);
    expect(samples.every((arr) => arr.length >= 2 && arr.length <= 4)).toBe(true);
    expect(samples.every((arr) => arr.every((n) => n >= 0 && n <= 10))).toBe(true);
  });

  it("should generate objects with correct shape", async () => {
    const gen = generators.object({
      name: generators.string({ minLength: 1 }),
      age: generators.integer(0, 120),
    });
    const resolved = await resolveArbitrary(gen);
    const samples = fc.sample(resolved, 20);
    expect(
      samples.every(
        (obj) =>
          typeof obj.name === "string" &&
          obj.name.length >= 1 &&
          typeof obj.age === "number" &&
          obj.age >= 0 &&
          obj.age <= 120
      )
    ).toBe(true);
  });

  it("should generate oneOf values from provided options", async () => {
    const gen = generators.oneOf("red", "green", "blue");
    const resolved = await resolveArbitrary(gen);
    const samples = fc.sample(resolved, 50);
    const validValues = new Set(["red", "green", "blue"]);
    expect(samples.every((v) => validValues.has(v))).toBe(true);
  });

  it("should generate optional values including undefined", async () => {
    const gen = generators.optional(generators.string());
    const resolved = await resolveArbitrary(gen);
    const samples = fc.sample(resolved, 100);
    expect(samples.every((v) => v === undefined || typeof v === "string")).toBe(true);
    // With 100 samples, we should see some undefined values
    expect(samples.some((v) => v === undefined)).toBe(true);
    expect(samples.some((v) => typeof v === "string")).toBe(true);
  });
});
