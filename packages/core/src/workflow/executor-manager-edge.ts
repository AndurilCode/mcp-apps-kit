/**
 * Edge-optimized Executor Manager for stateless serverless environments
 *
 * Designed for Supabase Edge Functions, Cloudflare Workers, Vercel Edge, etc.
 * where each invocation is isolated and short-lived.
 *
 * @module workflow/executor-manager-edge
 */

import { WorkflowExecutor } from "./executor";
import type { WorkflowDefinition } from "./types";

// Type declarations for edge runtime globals
declare const Deno:
  | {
      env?: {
        get?: (key: string) => string | undefined;
      };
    }
  | undefined;

// Worker global scope type for Deno/Workers
interface WorkerGlobalScope {
  addEventListener(type: string, listener: () => void): void;
}
declare const self: WorkerGlobalScope | undefined;

// Global registry for cleanup handlers
const globalCleanupRegistry: Set<EdgeExecutorManager> =
  (globalThis as unknown as { __edgeExecutorManagers?: Set<EdgeExecutorManager> })
    .__edgeExecutorManagers ?? new Set();
(
  globalThis as unknown as { __edgeExecutorManagers: Set<EdgeExecutorManager> }
).__edgeExecutorManagers = globalCleanupRegistry;

let cleanupHandlersRegistered = false;

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Configuration for EdgeExecutorManager
 */
export interface EdgeExecutorManagerConfig {
  /**
   * Maximum number of executors to cache per function invocation
   * @default 10 (smaller than standard manager due to memory constraints)
   */
  maxExecutors?: number;
}

// =============================================================================
// EDGE EXECUTOR MANAGER
// =============================================================================

/**
 * Edge-optimized executor manager for serverless/edge environments
 *
 * Key differences from standard ExecutorManager:
 * - No singleton (each invocation gets fresh instance)
 * - No background cleanup timers (rely on function termination)
 * - Simplified pooling (function lifetime is short)
 * - Automatic cleanup on function exit via process handlers
 * - Smaller default pool size (edge functions have memory limits)
 *
 * @example Supabase Edge Function
 * ```typescript
 * import { serve } from "https://deno.land/std/http/server.ts";
 * import { createApp, EdgeExecutorManager } from "@mcp-apps-kit/core";
 *
 * const app = createApp({
 *   name: "my-edge-app",
 *   tools: { myWorkflow },
 * });
 *
 * // Configure for edge environment
 * EdgeExecutorManager.configureDefaults({
 *   maxExecutors: 5, // Smaller pool for memory-constrained edge
 * });
 *
 * serve(async (req) => {
 *   const response = await app.handleRequest(req);
 *   return response;
 * });
 * ```
 *
 * @example Manual cleanup for long-lived edge workers (Cloudflare Durable Objects)
 * ```typescript
 * export class WorkflowWorker {
 *   private manager = new EdgeExecutorManager({ maxExecutors: 5 });
 *
 *   async fetch(request: Request) {
 *     try {
 *       // Handle request...
 *     } finally {
 *       // Cleanup if this worker instance is shutting down
 *       if (request.headers.get("X-Worker-Shutdown")) {
 *         await this.manager.shutdown();
 *       }
 *     }
 *   }
 * }
 * ```
 */
export class EdgeExecutorManager {
  private static defaultConfig: Required<EdgeExecutorManagerConfig> = {
    maxExecutors: 10, // Smaller for memory-constrained edge
  };

  private executors: Map<string, WorkflowExecutor> = new Map();
  private lastUsed: Map<string, number> = new Map();
  private config: Required<EdgeExecutorManagerConfig>;

  /**
   * Configure default settings for all EdgeExecutorManager instances
   *
   * Call this once at application startup in your edge function entry point.
   */
  static configureDefaults(config: Partial<EdgeExecutorManagerConfig>): void {
    // Validate maxExecutors if provided
    const validatedConfig = { ...config };
    if (validatedConfig.maxExecutors !== undefined) {
      validatedConfig.maxExecutors = Math.max(1, Math.floor(validatedConfig.maxExecutors));
    }

    EdgeExecutorManager.defaultConfig = {
      ...EdgeExecutorManager.defaultConfig,
      ...validatedConfig,
    };
  }

  constructor(config?: EdgeExecutorManagerConfig) {
    // Validate and merge config
    const validatedConfig = config ? { ...config } : undefined;
    if (validatedConfig?.maxExecutors !== undefined) {
      validatedConfig.maxExecutors = Math.max(1, Math.floor(validatedConfig.maxExecutors));
    }

    this.config = {
      ...EdgeExecutorManager.defaultConfig,
      ...validatedConfig,
    };

    // Add this instance to global registry
    globalCleanupRegistry.add(this);

    // Register cleanup on process exit (works in most edge runtimes)
    // This ensures connections are closed when the function terminates
    this.registerCleanupHooks();
  }

  /**
   * Get or create an executor for a workflow
   *
   * In edge environments, this creates a new executor per invocation
   * unless the workflow was already used in the same function invocation.
   */
  getOrCreate(definition: WorkflowDefinition): WorkflowExecutor {
    const key = definition.name;
    const existing = this.executors.get(key);

    if (existing) {
      // Update last used timestamp for LRU tracking
      this.lastUsed.set(key, Date.now());
      return existing;
    }

    // LRU eviction: if full, remove least recently used
    if (this.executors.size >= this.config.maxExecutors) {
      let oldestKey: string | undefined;
      let oldestTime = Infinity;

      // Find the executor with the oldest lastUsed timestamp
      for (const [executorKey, timestamp] of this.lastUsed.entries()) {
        if (timestamp < oldestTime) {
          oldestTime = timestamp;
          oldestKey = executorKey;
        }
      }

      if (oldestKey) {
        const executor = this.executors.get(oldestKey);
        if (executor) {
          // Fire and forget cleanup
          executor.close().catch(() => {
            // Ignore errors during eviction
          });
        }
        this.executors.delete(oldestKey);
        this.lastUsed.delete(oldestKey);
      }
    }

    const executor = new WorkflowExecutor(definition);
    this.executors.set(key, executor);
    this.lastUsed.set(key, Date.now());

    return executor;
  }

  /**
   * Mark an executor as in-use (no-op in edge environments)
   *
   * Edge functions are short-lived, so reference counting isn't needed.
   * This method exists for API compatibility with ExecutorManager.
   */
  markInUse(_workflowName: string): void {
    // No-op: edge functions terminate quickly, no need for reference counting
  }

  /**
   * Mark an executor as idle (no-op in edge environments)
   *
   * Edge functions are short-lived, so reference counting isn't needed.
   * This method exists for API compatibility with ExecutorManager.
   */
  markIdle(_workflowName: string): void {
    // No-op: edge functions terminate quickly, no need for reference counting
  }

  /**
   * Get statistics about the executor pool
   */
  getStats(): { totalExecutors: number } {
    return {
      totalExecutors: this.executors.size,
    };
  }

  /**
   * Synchronous cleanup for use in synchronous exit handlers
   *
   * Performs best-effort cleanup without waiting for async operations.
   * Used by process.on("exit") which cannot wait for promises.
   */
  private shutdownSync(): void {
    // Clear maps immediately
    this.executors.clear();
    this.lastUsed.clear();

    // Remove from global registry
    globalCleanupRegistry.delete(this);
  }

  /**
   * Manually cleanup all executors
   *
   * In most edge environments, this is called automatically via
   * process exit handlers. You typically don't need to call this manually.
   */
  async shutdown(): Promise<void> {
    const closePromises: Promise<void>[] = [];

    for (const executor of this.executors.values()) {
      closePromises.push(
        executor.close().catch(() => {
          // Ignore errors during shutdown
        })
      );
    }

    await Promise.all(closePromises);
    this.executors.clear();
    this.lastUsed.clear();

    // Remove this instance from global registry
    globalCleanupRegistry.delete(this);
  }

  /**
   * Register cleanup hooks for the edge runtime
   *
   * Different runtimes have different exit signals:
   * - Node.js: process.on('exit') is synchronous, SIGTERM/SIGINT are async
   * - Deno: self.addEventListener('unload') is synchronous
   * - Cloudflare Workers: scheduled cleanup in fetch handler
   *
   * Uses a global guard to ensure handlers are registered exactly once,
   * and each handler invokes shutdown() on all registered instances.
   */
  private registerCleanupHooks(): void {
    // Only register handlers once globally
    if (cleanupHandlersRegistered) return;
    cleanupHandlersRegistered = true;

    // Try to detect runtime and register appropriate hooks
    const isNode = typeof process !== "undefined" && process.versions?.node;
    const isDeno = typeof Deno !== "undefined";

    // Synchronous cleanup for exit handler (can't wait for promises)
    const cleanupAllSync = () => {
      for (const manager of globalCleanupRegistry) {
        manager.shutdownSync();
      }
    };

    // Async cleanup for signal handlers (can await promises then exit)
    const cleanupAllAsync = async (signal: string) => {
      try {
        const shutdowns = Array.from(globalCleanupRegistry).map((manager) =>
          manager.shutdown().catch(() => {
            // Ignore errors during shutdown
          })
        );
        await Promise.all(shutdowns);
      } finally {
        // Exit after cleanup completes
        if (signal === "SIGTERM" || signal === "SIGINT") {
          process.exit(0);
        }
      }
    };

    if (isNode) {
      // Node.js edge functions (Vercel, Netlify)
      // process.on("exit") is synchronous - use sync cleanup
      process.on("exit", cleanupAllSync);

      // SIGTERM/SIGINT allow async cleanup before exit
      process.on("SIGTERM", () => {
        void cleanupAllAsync("SIGTERM");
      });
      process.on("SIGINT", () => {
        void cleanupAllAsync("SIGINT");
      });
    } else if (isDeno) {
      // Deno edge functions (Supabase, Deno Deploy)
      // unload event is synchronous - use sync cleanup
      if (typeof self !== "undefined" && "addEventListener" in self) {
        self.addEventListener("unload", cleanupAllSync);
      }
    }
    // Cloudflare Workers don't have exit hooks - cleanup must be manual
    // or rely on the function instance being terminated
  }
}
