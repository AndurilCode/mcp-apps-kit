/**
 * Unit tests for lazy loader utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createLazyLoader,
  createCachedClientFactory,
  isModuleAvailable,
} from "../../../src/utils/lazy-loader";
import { ConfigurationError } from "../../../src/errors";

describe("createLazyLoader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should load module lazily on first call", async () => {
    const mockModule = { foo: "bar" };
    const importFn = vi.fn().mockResolvedValue(mockModule);

    const getModule = createLazyLoader(importFn, {
      packageName: "test-package",
      installHint: "npm install test-package",
    });

    // Import should not be called until we call getModule
    expect(importFn).not.toHaveBeenCalled();

    const result = await getModule();

    expect(importFn).toHaveBeenCalledTimes(1);
    expect(result).toBe(mockModule);
  });

  it("should cache module after first load", async () => {
    const mockModule = { foo: "bar" };
    const importFn = vi.fn().mockResolvedValue(mockModule);

    const getModule = createLazyLoader(importFn, {
      packageName: "test-package",
      installHint: "npm install test-package",
    });

    // Call multiple times
    await getModule();
    await getModule();
    await getModule();

    // Import should only be called once
    expect(importFn).toHaveBeenCalledTimes(1);
  });

  it("should handle concurrent calls without duplicate imports", async () => {
    let resolvePromise: (value: unknown) => void;
    const importPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    const mockModule = { foo: "bar" };
    const importFn = vi.fn().mockReturnValue(importPromise);

    const getModule = createLazyLoader(importFn, {
      packageName: "test-package",
      installHint: "npm install test-package",
    });

    // Start multiple concurrent calls
    const promise1 = getModule();
    const promise2 = getModule();
    const promise3 = getModule();

    // All should be waiting on the same import
    expect(importFn).toHaveBeenCalledTimes(1);

    // Resolve the import
    resolvePromise!(mockModule);

    // All promises should resolve to the same module
    const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);
    expect(result1).toBe(mockModule);
    expect(result2).toBe(mockModule);
    expect(result3).toBe(mockModule);
  });

  it("should throw ConfigurationError when module is not available", async () => {
    const importFn = vi.fn().mockRejectedValue(new Error("Module not found"));

    const getModule = createLazyLoader(importFn, {
      packageName: "missing-package",
      installHint: "npm install -D missing-package",
    });

    await expect(getModule()).rejects.toThrow(ConfigurationError);
    await expect(getModule()).rejects.toThrow("missing-package");
    await expect(getModule()).rejects.toThrow("npm install -D missing-package");
  });
});

describe("createCachedClientFactory", () => {
  it("should create client on first call", async () => {
    const mockClient = { id: "client1" };
    const createClient = vi.fn().mockResolvedValue(mockClient);

    const factory = createCachedClientFactory(createClient);

    const result = await factory.get("api-key-123");

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith("api-key-123");
    expect(result).toBe(mockClient);
  });

  it("should return cached client for same API key", async () => {
    const mockClient = { id: "client1" };
    const createClient = vi.fn().mockResolvedValue(mockClient);

    const factory = createCachedClientFactory(createClient);

    // Call multiple times with same API key
    await factory.get("api-key-123");
    await factory.get("api-key-123");
    const result = await factory.get("api-key-123");

    // Should only create once
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(result).toBe(mockClient);
  });

  it("should create new client when API key changes", async () => {
    const mockClient1 = { id: "client1" };
    const mockClient2 = { id: "client2" };
    const createClient = vi
      .fn()
      .mockResolvedValueOnce(mockClient1)
      .mockResolvedValueOnce(mockClient2);

    const factory = createCachedClientFactory(createClient);

    const result1 = await factory.get("api-key-1");
    const result2 = await factory.get("api-key-2");

    expect(createClient).toHaveBeenCalledTimes(2);
    expect(result1).toBe(mockClient1);
    expect(result2).toBe(mockClient2);
  });

  it("should clear cache when clear() is called", async () => {
    const mockClient1 = { id: "client1" };
    const mockClient2 = { id: "client2" };
    const createClient = vi
      .fn()
      .mockResolvedValueOnce(mockClient1)
      .mockResolvedValueOnce(mockClient2);

    const factory = createCachedClientFactory(createClient);

    await factory.get("api-key-123");
    factory.clear();
    await factory.get("api-key-123");

    // Should create twice because cache was cleared
    expect(createClient).toHaveBeenCalledTimes(2);
  });
});

describe("isModuleAvailable", () => {
  it("should return true when module is available", async () => {
    const importFn = vi.fn().mockResolvedValue({ foo: "bar" });

    const result = await isModuleAvailable(importFn);

    expect(result).toBe(true);
  });

  it("should return false when module is not available", async () => {
    const importFn = vi.fn().mockRejectedValue(new Error("Module not found"));

    const result = await isModuleAvailable(importFn);

    expect(result).toBe(false);
  });
});
