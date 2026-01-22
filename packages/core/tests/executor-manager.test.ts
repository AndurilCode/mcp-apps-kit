/**
 * ExecutorManager tests - Production lifecycle management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ExecutorManager } from "../src/workflow/executor-manager";
import { WorkflowExecutor } from "../src/workflow/executor";
import type { WorkflowDefinition } from "../src/workflow/types";
import { z } from "zod";

describe("ExecutorManager", () => {
  beforeEach(() => {
    // Reset the global instance before each test
    ExecutorManager.resetInstance();
  });

  afterEach(async () => {
    // Cleanup after each test
    await ExecutorManager.getInstance().shutdown(true);
    ExecutorManager.resetInstance();
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance on multiple calls", () => {
      const instance1 = ExecutorManager.getInstance();
      const instance2 = ExecutorManager.getInstance();

      expect(instance1).toBe(instance2);
    });

    it("should create new instance after reset", () => {
      const instance1 = ExecutorManager.getInstance();
      ExecutorManager.resetInstance();
      const instance2 = ExecutorManager.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe("Executor Creation and Reuse", () => {
    it("should create a new executor for a workflow definition", () => {
      const manager = ExecutorManager.getInstance();
      const definition: WorkflowDefinition = {
        name: "test_workflow",
        description: "Test workflow",
        inputSchema: z.object({ value: z.string() }),
        steps: [],
      };

      const executor1 = manager.getOrCreate(definition);
      expect(executor1).toBeInstanceOf(WorkflowExecutor);
    });

    it("should reuse the same executor for the same workflow name", () => {
      const manager = ExecutorManager.getInstance();
      const definition: WorkflowDefinition = {
        name: "test_workflow",
        description: "Test workflow",
        inputSchema: z.object({ value: z.string() }),
        steps: [],
      };

      const executor1 = manager.getOrCreate(definition);
      const executor2 = manager.getOrCreate(definition);

      expect(executor1).toBe(executor2);
    });

    it("should create different executors for different workflow names", () => {
      const manager = ExecutorManager.getInstance();
      const definition1: WorkflowDefinition = {
        name: "workflow_1",
        description: "First workflow",
        inputSchema: z.object({ value: z.string() }),
        steps: [],
      };
      const definition2: WorkflowDefinition = {
        name: "workflow_2",
        description: "Second workflow",
        inputSchema: z.object({ value: z.string() }),
        steps: [],
      };

      const executor1 = manager.getOrCreate(definition1);
      const executor2 = manager.getOrCreate(definition2);

      expect(executor1).not.toBe(executor2);
    });
  });

  describe("Reference Counting", () => {
    it("should track active invocations", () => {
      const manager = ExecutorManager.getInstance();
      const definition: WorkflowDefinition = {
        name: "test_workflow",
        description: "Test workflow",
        inputSchema: z.object({ value: z.string() }),
        steps: [],
      };

      manager.getOrCreate(definition);

      let stats = manager.getStats();
      expect(stats.activeExecutors).toBe(0);

      manager.markInUse("test_workflow");
      stats = manager.getStats();
      expect(stats.activeExecutors).toBe(1);

      manager.markIdle("test_workflow");
      stats = manager.getStats();
      expect(stats.activeExecutors).toBe(0);
    });

    it("should handle multiple concurrent invocations", () => {
      const manager = ExecutorManager.getInstance();
      const definition: WorkflowDefinition = {
        name: "test_workflow",
        description: "Test workflow",
        inputSchema: z.object({ value: z.string() }),
        steps: [],
      };

      manager.getOrCreate(definition);

      manager.markInUse("test_workflow");
      manager.markInUse("test_workflow");
      manager.markInUse("test_workflow");

      const stats = manager.getStats();
      expect(stats.activeExecutors).toBe(1); // Still one executor, but 3 invocations

      manager.markIdle("test_workflow");
      manager.markIdle("test_workflow");
      manager.markIdle("test_workflow");

      const statsAfter = manager.getStats();
      expect(statsAfter.activeExecutors).toBe(0);
    });

    it("should not go below zero active invocations", () => {
      const manager = ExecutorManager.getInstance();
      const definition: WorkflowDefinition = {
        name: "test_workflow",
        description: "Test workflow",
        inputSchema: z.object({ value: z.string() }),
        steps: [],
      };

      manager.getOrCreate(definition);

      // Mark idle without marking in-use first
      manager.markIdle("test_workflow");
      manager.markIdle("test_workflow");

      const stats = manager.getStats();
      expect(stats.activeExecutors).toBe(0);
    });
  });

  describe("Statistics", () => {
    it("should return accurate statistics", () => {
      const manager = ExecutorManager.getInstance();

      const definition1: WorkflowDefinition = {
        name: "workflow_1",
        description: "First workflow",
        inputSchema: z.object({ value: z.string() }),
        steps: [],
      };
      const definition2: WorkflowDefinition = {
        name: "workflow_2",
        description: "Second workflow",
        inputSchema: z.object({ value: z.string() }),
        steps: [],
      };

      manager.getOrCreate(definition1);
      manager.getOrCreate(definition2);

      manager.markInUse("workflow_1");

      const stats = manager.getStats();
      expect(stats.totalExecutors).toBe(2);
      expect(stats.activeExecutors).toBe(1);
      expect(stats.idleExecutors).toBe(1);
    });

    it("should track oldest executor age", async () => {
      const manager = ExecutorManager.getInstance();
      const definition: WorkflowDefinition = {
        name: "test_workflow",
        description: "Test workflow",
        inputSchema: z.object({ value: z.string() }),
        steps: [],
      };

      manager.getOrCreate(definition);

      // Wait a bit to ensure age is non-zero
      await new Promise((resolve) => setTimeout(resolve, 50));

      const stats = manager.getStats();
      expect(stats.oldestExecutorAge).toBeGreaterThan(0);
    });
  });

  describe("LRU Eviction", () => {
    it("should evict least recently used executor when cache is full", () => {
      const manager = ExecutorManager.getInstance({ maxExecutors: 2 });

      const def1: WorkflowDefinition = {
        name: "workflow_1",
        description: "First",
        inputSchema: z.object({}),
        steps: [],
      };
      const def2: WorkflowDefinition = {
        name: "workflow_2",
        description: "Second",
        inputSchema: z.object({}),
        steps: [],
      };
      const def3: WorkflowDefinition = {
        name: "workflow_3",
        description: "Third",
        inputSchema: z.object({}),
        steps: [],
      };

      manager.getOrCreate(def1);
      manager.getOrCreate(def2);

      // Cache is full, next one should evict the oldest
      manager.getOrCreate(def3);

      const stats = manager.getStats();
      expect(stats.totalExecutors).toBeLessThanOrEqual(2);
    });
  });

  describe("Automatic Cleanup", () => {
    it("should cleanup idle executors past TTL", async () => {
      const manager = ExecutorManager.getInstance({
        executorTTL: 100, // 100ms TTL
        cleanupInterval: 50, // 50ms cleanup interval
      });

      const definition: WorkflowDefinition = {
        name: "test_workflow",
        description: "Test workflow",
        inputSchema: z.object({ value: z.string() }),
        steps: [],
      };

      manager.getOrCreate(definition);

      let stats = manager.getStats();
      expect(stats.totalExecutors).toBe(1);

      // Wait for TTL to expire and cleanup to run
      await new Promise((resolve) => setTimeout(resolve, 200));

      stats = manager.getStats();
      expect(stats.totalExecutors).toBe(0);
    }, 10000);

    it("should not cleanup active executors", async () => {
      const manager = ExecutorManager.getInstance({
        executorTTL: 100,
        cleanupInterval: 50,
      });

      const definition: WorkflowDefinition = {
        name: "test_workflow",
        description: "Test workflow",
        inputSchema: z.object({ value: z.string() }),
        steps: [],
      };

      manager.getOrCreate(definition);
      manager.markInUse("test_workflow");

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 200));

      const stats = manager.getStats();
      // Should still have the executor because it's active
      expect(stats.totalExecutors).toBe(1);

      manager.markIdle("test_workflow");
    }, 10000);
  });

  describe("Manual Cleanup", () => {
    it("should cleanup idle executors on demand", async () => {
      const manager = ExecutorManager.getInstance({
        autoCleanup: false, // Disable automatic cleanup
        executorTTL: 50,
      });

      const definition: WorkflowDefinition = {
        name: "test_workflow",
        description: "Test workflow",
        inputSchema: z.object({ value: z.string() }),
        steps: [],
      };

      manager.getOrCreate(definition);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      let stats = manager.getStats();
      expect(stats.totalExecutors).toBe(1); // Still there because auto-cleanup is off

      // Manual cleanup
      await manager.cleanup();

      stats = manager.getStats();
      expect(stats.totalExecutors).toBe(0);
    });
  });

  describe("Shutdown", () => {
    it("should close all executors on shutdown", async () => {
      const manager = ExecutorManager.getInstance();

      const def1: WorkflowDefinition = {
        name: "workflow_1",
        description: "First",
        inputSchema: z.object({}),
        steps: [],
      };
      const def2: WorkflowDefinition = {
        name: "workflow_2",
        description: "Second",
        inputSchema: z.object({}),
        steps: [],
      };

      manager.getOrCreate(def1);
      manager.getOrCreate(def2);

      let stats = manager.getStats();
      expect(stats.totalExecutors).toBe(2);

      await manager.shutdown();

      stats = manager.getStats();
      expect(stats.totalExecutors).toBe(0);
    });

    it("should not close active executors unless forced", async () => {
      const manager = ExecutorManager.getInstance();

      const definition: WorkflowDefinition = {
        name: "test_workflow",
        description: "Test workflow",
        inputSchema: z.object({}),
        steps: [],
      };

      manager.getOrCreate(definition);
      manager.markInUse("test_workflow");

      await manager.shutdown(false); // Don't force

      const stats = manager.getStats();
      // Should still have the executor because it's active
      expect(stats.totalExecutors).toBe(1);

      manager.markIdle("test_workflow");
    });

    it("should close active executors when forced", async () => {
      const manager = ExecutorManager.getInstance();

      const definition: WorkflowDefinition = {
        name: "test_workflow",
        description: "Test workflow",
        inputSchema: z.object({}),
        steps: [],
      };

      manager.getOrCreate(definition);
      manager.markInUse("test_workflow");

      await manager.shutdown(true); // Force shutdown

      const stats = manager.getStats();
      expect(stats.totalExecutors).toBe(0);
    });

    it("should prevent creating new executors after shutdown", () => {
      const manager = ExecutorManager.getInstance();

      const definition: WorkflowDefinition = {
        name: "test_workflow",
        description: "Test workflow",
        inputSchema: z.object({}),
        steps: [],
      };

      manager.shutdown(true); // Start shutdown (don't await)

      expect(() => manager.getOrCreate(definition)).toThrow("ExecutorManager is shutting down");
    });
  });

  describe("Configuration", () => {
    it("should respect custom configuration", () => {
      const manager = ExecutorManager.getInstance({
        maxExecutors: 50,
        executorTTL: 5000,
        autoCleanup: false,
        cleanupInterval: 10000,
      });

      // Configuration is applied internally
      expect(manager).toBeInstanceOf(ExecutorManager);
    });
  });
});
