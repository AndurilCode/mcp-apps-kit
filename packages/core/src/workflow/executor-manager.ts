/**
 * Executor Manager - Production-ready lifecycle management for workflow executors
 *
 * @module workflow/executor-manager
 */

import { WorkflowExecutor } from "./executor";
import type { WorkflowDefinition } from "./types";
import { debugLogger } from "../debug/logger";

/**
 * Configuration for the ExecutorManager
 */
export interface ExecutorManagerConfig {
  /**
   * Maximum number of executors to cache
   * @default 100
   */
  maxExecutors?: number;

  /**
   * Time-to-live for idle executors in milliseconds
   * @default 600000 (10 minutes)
   */
  executorTTL?: number;

  /**
   * Enable automatic cleanup of idle executors
   * @default true
   */
  autoCleanup?: boolean;

  /**
   * Cleanup interval in milliseconds
   * @default 60000 (1 minute)
   */
  cleanupInterval?: number;
}

interface ManagedExecutor {
  executor: WorkflowExecutor;
  definition: WorkflowDefinition;
  lastUsed: number;
  activeInvocations: number;
}

/**
 * ExecutorManager provides centralized lifecycle management for workflow executors
 *
 * Features:
 * - Executor pooling and reuse across invocations
 * - Automatic cleanup of idle executors
 * - LRU eviction when pool is full
 * - Reference counting to prevent premature cleanup
 * - Graceful shutdown with resource cleanup
 *
 * @example
 * ```typescript
 * // Get the global instance
 * const manager = ExecutorManager.getInstance();
 *
 * // Get or create an executor
 * const executor = manager.getOrCreate(workflowDef);
 *
 * // Mark as in-use during execution
 * manager.markInUse(workflowDef.name);
 * try {
 *   const result = await executor.execute(input, context);
 * } finally {
 *   manager.markIdle(workflowDef.name);
 * }
 *
 * // Cleanup on server shutdown
 * await manager.shutdown();
 * ```
 */
export class ExecutorManager {
  private static instance: ExecutorManager | undefined;
  private executors: Map<string, ManagedExecutor> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | undefined;
  private config: Required<ExecutorManagerConfig>;
  private isShuttingDown = false;

  /**
   * Get the global ExecutorManager instance
   *
   * This ensures a single manager is shared across the entire application,
   * maximizing executor reuse and connection pooling efficiency.
   */
  static getInstance(config?: ExecutorManagerConfig): ExecutorManager {
    ExecutorManager.instance ??= new ExecutorManager(config);
    return ExecutorManager.instance;
  }

  /**
   * Reset the global instance (primarily for testing)
   * @internal
   */
  static resetInstance(): void {
    if (ExecutorManager.instance) {
      // Don't await - fire and forget cleanup
      ExecutorManager.instance.shutdown().catch(() => {
        // Ignore errors during reset
      });
      ExecutorManager.instance = undefined;
    }
  }

  private constructor(config: ExecutorManagerConfig = {}) {
    this.config = {
      maxExecutors: config.maxExecutors ?? 100,
      executorTTL: config.executorTTL ?? 10 * 60 * 1000, // 10 minutes
      autoCleanup: config.autoCleanup ?? true,
      cleanupInterval: config.cleanupInterval ?? 60 * 1000, // 1 minute
    };

    if (this.config.autoCleanup) {
      this.startCleanupTimer();
    }
  }

  /**
   * Get or create an executor for a workflow definition
   *
   * If an executor already exists for this workflow name, it is reused.
   * Otherwise, a new executor is created and cached.
   *
   * @param definition - Workflow definition
   * @returns Workflow executor instance
   */
  getOrCreate(definition: WorkflowDefinition): WorkflowExecutor {
    if (this.isShuttingDown) {
      throw new Error("ExecutorManager is shutting down, cannot create new executors");
    }

    const key = definition.name;
    const existing = this.executors.get(key);

    if (existing) {
      // Update last used timestamp
      existing.lastUsed = Date.now();
      return existing.executor;
    }

    // Evict old executors if cache is full
    if (this.executors.size >= this.config.maxExecutors) {
      const evicted = this.evictIdleLRU();
      if (!evicted) {
        // All executors are active - fail fast rather than break running workflows
        throw new Error(
          `ExecutorManager capacity exceeded: all ${this.config.maxExecutors} executors are active. ` +
            `Increase maxExecutors or wait for active workflows to complete.`
        );
      }
    }

    // Create new executor
    const executor = new WorkflowExecutor(definition);
    this.executors.set(key, {
      executor,
      definition,
      lastUsed: Date.now(),
      activeInvocations: 0,
    });

    debugLogger.debug(`Created workflow executor: ${key}`, {
      totalExecutors: this.executors.size,
    });

    return executor;
  }

  /**
   * Mark an executor as in-use (increment reference count)
   *
   * Call this before executing a workflow to prevent the executor
   * from being cleaned up during execution.
   *
   * @param workflowName - Name of the workflow
   */
  markInUse(workflowName: string): void {
    const managed = this.executors.get(workflowName);
    if (managed) {
      managed.activeInvocations++;
    }
  }

  /**
   * Mark an executor as idle (decrement reference count)
   *
   * Call this after workflow execution completes to allow
   * the executor to be cleaned up if idle for too long.
   *
   * @param workflowName - Name of the workflow
   */
  markIdle(workflowName: string): void {
    const managed = this.executors.get(workflowName);
    if (managed) {
      managed.activeInvocations = Math.max(0, managed.activeInvocations - 1);
      managed.lastUsed = Date.now();
    }
  }

  /**
   * Get statistics about the executor pool
   */
  getStats(): {
    totalExecutors: number;
    activeExecutors: number;
    idleExecutors: number;
    oldestExecutorAge: number;
  } {
    const now = Date.now();
    let activeCount = 0;
    let oldestAge = 0;

    for (const managed of this.executors.values()) {
      if (managed.activeInvocations > 0) {
        activeCount++;
      }
      const age = now - managed.lastUsed;
      if (age > oldestAge) {
        oldestAge = age;
      }
    }

    return {
      totalExecutors: this.executors.size,
      activeExecutors: activeCount,
      idleExecutors: this.executors.size - activeCount,
      oldestExecutorAge: oldestAge,
    };
  }

  /**
   * Manually trigger cleanup of idle executors
   *
   * This is called automatically by the cleanup timer if autoCleanup is enabled.
   * You can also call it manually for fine-grained control.
   */
  async cleanup(): Promise<void> {
    const now = Date.now();
    const toCleanup: string[] = [];

    // Find idle executors past TTL
    for (const [key, managed] of this.executors.entries()) {
      const isIdle = managed.activeInvocations === 0;
      const isPastTTL = now - managed.lastUsed > this.config.executorTTL;

      if (isIdle && isPastTTL) {
        toCleanup.push(key);
      }
    }

    // Cleanup executors
    for (const key of toCleanup) {
      await this.closeExecutor(key);
    }

    if (toCleanup.length > 0) {
      debugLogger.debug(`Cleaned up ${toCleanup.length} idle executor(s)`, {
        remaining: this.executors.size,
      });
    }
  }

  /**
   * Shutdown the executor manager and cleanup all resources
   *
   * This should be called during server shutdown to ensure all
   * external MCP connections are properly closed.
   *
   * @param force - If true, close executors even if they have active invocations
   */
  async shutdown(force = false): Promise<void> {
    this.isShuttingDown = true;

    // Stop the cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    debugLogger.info("Shutting down ExecutorManager", {
      totalExecutors: this.executors.size,
      force,
    });

    // Close all executors
    const closePromises: Promise<void>[] = [];
    for (const [key, managed] of this.executors.entries()) {
      if (force || managed.activeInvocations === 0) {
        closePromises.push(
          this.closeExecutor(key).catch((error: unknown) => {
            debugLogger.error(`Failed to close executor: ${key}`, { error });
          })
        );
      } else {
        debugLogger.warn(`Executor has active invocations, skipping: ${key}`, {
          activeInvocations: managed.activeInvocations,
        });
      }
    }

    await Promise.all(closePromises);

    debugLogger.info("ExecutorManager shutdown complete", {
      remainingExecutors: this.executors.size,
    });
  }

  /**
   * Evict the least recently used idle executor
   *
   * Only evicts idle executors (activeInvocations === 0) to avoid
   * breaking running workflows. Returns false if no idle executor
   * is available for eviction.
   *
   * @returns true if an executor was evicted, false if all are active
   */
  private evictIdleLRU(): boolean {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    // Find the oldest idle executor only
    for (const [key, managed] of this.executors.entries()) {
      if (managed.activeInvocations === 0 && managed.lastUsed < oldestTime) {
        oldestTime = managed.lastUsed;
        oldestKey = key;
      }
    }

    // If no idle executor found, don't evict active ones
    if (!oldestKey) {
      debugLogger.debug("No idle executors available for eviction");
      return false;
    }

    debugLogger.debug(`Evicting LRU idle executor: ${oldestKey}`);
    // Fire and forget - don't block on cleanup
    this.closeExecutor(oldestKey).catch(() => {
      // Ignore errors during eviction
    });
    return true;
  }

  /**
   * Close and remove an executor
   */
  private async closeExecutor(key: string): Promise<void> {
    const managed = this.executors.get(key);
    if (!managed) return;

    this.executors.delete(key);

    try {
      await managed.executor.close();
    } catch (error) {
      debugLogger.error(`Error closing executor: ${key}`, { error });
      throw error;
    }
  }

  /**
   * Start the automatic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch((error: unknown) => {
        debugLogger.error("Error during automatic executor cleanup", { error });
      });
    }, this.config.cleanupInterval);

    // Don't prevent Node.js from exiting
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }
}
