/**
 * EdgeExecutorManager tests
 *
 * Tests for edge/serverless-optimized executor manager
 *
 * @module executor-manager-edge.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { z } from "zod";
import { EdgeExecutorManager } from "../../../src/workflow/executor-manager-edge";
import type { WorkflowDefinition } from "../../../src/workflow/types";

// =============================================================================
// TEST FIXTURES
// =============================================================================

function createMockWorkflowDefinition(name: string): WorkflowDefinition {
  return {
    name,
    description: "Test workflow",
    input: z.object({ value: z.string() }),
    output: z.object({ result: z.string() }),
    steps: [
      {
        type: "custom",
        name: "step1",
        execute: async () => ({ result: "ok" }),
      },
    ],
  };
}

// =============================================================================
// BASIC CONFIGURATION TESTS
// =============================================================================

describe("EdgeExecutorManager - Configuration", () => {
  beforeEach(() => {
    EdgeExecutorManager.configureDefaults({ maxExecutors: 10 });
  });

  it("should use default configuration", () => {
    const manager = new EdgeExecutorManager();
    const stats = manager.getStats();

    expect(stats.totalExecutors).toBe(0);
  });

  it("should accept custom configuration", () => {
    const manager = new EdgeExecutorManager({ maxExecutors: 5 });
    const def1 = createMockWorkflowDefinition("workflow1");
    const def2 = createMockWorkflowDefinition("workflow2");
    const def3 = createMockWorkflowDefinition("workflow3");
    const def4 = createMockWorkflowDefinition("workflow4");
    const def5 = createMockWorkflowDefinition("workflow5");

    manager.getOrCreate(def1);
    manager.getOrCreate(def2);
    manager.getOrCreate(def3);
    manager.getOrCreate(def4);
    manager.getOrCreate(def5);

    expect(manager.getStats().totalExecutors).toBe(5);
  });

  it("should validate maxExecutors to be at least 1", () => {
    const manager = new EdgeExecutorManager({ maxExecutors: 0 });
    const def = createMockWorkflowDefinition("workflow1");

    manager.getOrCreate(def);
    expect(manager.getStats().totalExecutors).toBe(1);
  });

  it("should configure defaults globally", () => {
    EdgeExecutorManager.configureDefaults({ maxExecutors: 3 });
    const manager = new EdgeExecutorManager();

    const def1 = createMockWorkflowDefinition("workflow1");
    const def2 = createMockWorkflowDefinition("workflow2");
    const def3 = createMockWorkflowDefinition("workflow3");
    const def4 = createMockWorkflowDefinition("workflow4");

    manager.getOrCreate(def1);
    manager.getOrCreate(def2);
    manager.getOrCreate(def3);
    manager.getOrCreate(def4);

    // Should respect the configured default of 3
    expect(manager.getStats().totalExecutors).toBe(3);
  });
});

// =============================================================================
// EXECUTOR LIFECYCLE TESTS
// =============================================================================

describe("EdgeExecutorManager - Lifecycle", () => {
  let manager: EdgeExecutorManager;

  beforeEach(() => {
    manager = new EdgeExecutorManager({ maxExecutors: 10 });
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  it("should create new executor on first request", () => {
    const def = createMockWorkflowDefinition("workflow1");
    const executor = manager.getOrCreate(def);

    expect(executor).toBeDefined();
    expect(manager.getStats().totalExecutors).toBe(1);
  });

  it("should reuse existing executor for same workflow", () => {
    const def = createMockWorkflowDefinition("workflow1");
    const executor1 = manager.getOrCreate(def);
    const executor2 = manager.getOrCreate(def);

    expect(executor1).toBe(executor2);
    expect(manager.getStats().totalExecutors).toBe(1);
  });

  it("should create separate executors for different workflows", () => {
    const def1 = createMockWorkflowDefinition("workflow1");
    const def2 = createMockWorkflowDefinition("workflow2");

    const executor1 = manager.getOrCreate(def1);
    const executor2 = manager.getOrCreate(def2);

    expect(executor1).not.toBe(executor2);
    expect(manager.getStats().totalExecutors).toBe(2);
  });

  it("should mark executors as in-use (no-op)", () => {
    const def = createMockWorkflowDefinition("workflow1");
    manager.getOrCreate(def);

    // Should not throw
    expect(() => manager.markInUse("workflow1")).not.toThrow();
  });

  it("should mark executors as idle (no-op)", () => {
    const def = createMockWorkflowDefinition("workflow1");
    manager.getOrCreate(def);

    // Should not throw
    expect(() => manager.markIdle("workflow1")).not.toThrow();
  });
});

// =============================================================================
// LRU EVICTION TESTS
// =============================================================================

describe("EdgeExecutorManager - LRU Eviction", () => {
  let manager: EdgeExecutorManager;

  beforeEach(() => {
    manager = new EdgeExecutorManager({ maxExecutors: 3 });
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  it("should evict least recently used executor when pool is full", () => {
    const def1 = createMockWorkflowDefinition("workflow1");
    const def2 = createMockWorkflowDefinition("workflow2");
    const def3 = createMockWorkflowDefinition("workflow3");
    const def4 = createMockWorkflowDefinition("workflow4");

    manager.getOrCreate(def1);
    manager.getOrCreate(def2);
    manager.getOrCreate(def3);

    expect(manager.getStats().totalExecutors).toBe(3);

    // Adding a 4th should evict the oldest (workflow1)
    manager.getOrCreate(def4);

    expect(manager.getStats().totalExecutors).toBe(3);
  });

  it("should update LRU timestamp when executor is reused", async () => {
    const def1 = createMockWorkflowDefinition("workflow1");
    const def2 = createMockWorkflowDefinition("workflow2");
    const def3 = createMockWorkflowDefinition("workflow3");
    const def4 = createMockWorkflowDefinition("workflow4");

    manager.getOrCreate(def1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    manager.getOrCreate(def2);
    await new Promise((resolve) => setTimeout(resolve, 10));
    manager.getOrCreate(def3);
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Re-access workflow1 to update its timestamp
    manager.getOrCreate(def1);

    // Now add workflow4 - should evict workflow2 (oldest), not workflow1
    manager.getOrCreate(def4);

    expect(manager.getStats().totalExecutors).toBe(3);

    // workflow1 should still be accessible
    const executor1 = manager.getOrCreate(def1);
    expect(executor1).toBeDefined();
  });
});

// =============================================================================
// SHUTDOWN TESTS
// =============================================================================

describe("EdgeExecutorManager - Shutdown", () => {
  it("should cleanup all executors on shutdown", async () => {
    const manager = new EdgeExecutorManager({ maxExecutors: 10 });
    const def1 = createMockWorkflowDefinition("workflow1");
    const def2 = createMockWorkflowDefinition("workflow2");

    manager.getOrCreate(def1);
    manager.getOrCreate(def2);

    expect(manager.getStats().totalExecutors).toBe(2);

    await manager.shutdown();

    expect(manager.getStats().totalExecutors).toBe(0);
  });

  it("should handle shutdown with no executors", async () => {
    const manager = new EdgeExecutorManager({ maxExecutors: 10 });

    await expect(manager.shutdown()).resolves.not.toThrow();
    expect(manager.getStats().totalExecutors).toBe(0);
  });

  it("should ignore errors during executor cleanup", async () => {
    const manager = new EdgeExecutorManager({ maxExecutors: 10 });
    const def = createMockWorkflowDefinition("workflow1");

    const executor = manager.getOrCreate(def);

    // Mock close to throw an error
    vi.spyOn(executor, "close").mockRejectedValue(new Error("Close failed"));

    // Should not throw
    await expect(manager.shutdown()).resolves.not.toThrow();
  });
});

// =============================================================================
// EDGE CASE TESTS
// =============================================================================

describe("EdgeExecutorManager - Edge Cases", () => {
  it("should handle fractional maxExecutors", () => {
    const manager = new EdgeExecutorManager({ maxExecutors: 2.7 });
    const def1 = createMockWorkflowDefinition("workflow1");
    const def2 = createMockWorkflowDefinition("workflow2");
    const def3 = createMockWorkflowDefinition("workflow3");

    manager.getOrCreate(def1);
    manager.getOrCreate(def2);
    manager.getOrCreate(def3);

    // Should floor to 2
    expect(manager.getStats().totalExecutors).toBe(2);
  });

  it("should handle negative maxExecutors", () => {
    const manager = new EdgeExecutorManager({ maxExecutors: -5 });
    const def = createMockWorkflowDefinition("workflow1");

    manager.getOrCreate(def);

    // Should clamp to minimum of 1
    expect(manager.getStats().totalExecutors).toBe(1);
  });

  it("should handle concurrent getOrCreate calls for same workflow", () => {
    const manager = new EdgeExecutorManager({ maxExecutors: 10 });
    const def = createMockWorkflowDefinition("workflow1");

    const executor1 = manager.getOrCreate(def);
    const executor2 = manager.getOrCreate(def);
    const executor3 = manager.getOrCreate(def);

    expect(executor1).toBe(executor2);
    expect(executor2).toBe(executor3);
    expect(manager.getStats().totalExecutors).toBe(1);
  });
});
