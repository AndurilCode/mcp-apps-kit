/**
 * Plugin Manager
 *
 * Orchestrates plugin lifecycle and hook execution.
 *
 * Features:
 * - Plugin registration and initialization
 * - Lifecycle hook execution (onInit, onStart, onShutdown)
 * - Tool execution hooks (beforeToolCall, afterToolCall, onToolError)
 * - HTTP hooks (onRequest, onResponse)
 * - UI hooks (onUILoad)
 * - Error isolation for all hooks except onInit
 * - Shutdown timeout enforcement
 *
 * @module plugins/PluginManager
 */

import type { Plugin } from "./types";

/**
 * PluginManager class
 *
 * Manages plugin lifecycle and hook execution with error isolation.
 */
export class PluginManager {
  private plugins: Plugin[];

  /**
   * Create plugin manager with registered plugins
   *
   * @param plugins - Array of plugins to manage
   */
  constructor(plugins: Plugin[]) {
    this.plugins = plugins;
  }

  /**
   * Initialize all plugins
   *
   * Calls onInit hook on all plugins in registration order.
   * Fails fast if any plugin throws during init.
   *
   * @param context - Initialization context
   * @throws Error if any plugin onInit fails
   */
  async init(context: Parameters<NonNullable<Plugin["onInit"]>>[0]): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.onInit) {
        try {
          await plugin.onInit(context);
        } catch (error) {
          throw new Error(
            `Plugin '${plugin.name}' onInit failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }
  }

  /**
   * Start all plugins
   *
   * Calls onStart hook on all plugins in registration order.
   * Errors are logged but don't stop other plugins.
   *
   * @param context - Start context
   */
  async start(context: Parameters<NonNullable<Plugin["onStart"]>>[0]): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.onStart) {
        try {
          await plugin.onStart(context);
        } catch (error) {
          console.error(
            `Plugin '${plugin.name}' onStart failed:`,
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    }
  }

  /**
   * Shutdown all plugins
   *
   * Calls onShutdown hook on all plugins in registration order.
   * Enforces shutdown timeout.
   *
   * @param context - Shutdown context
   */
  async shutdown(context: Parameters<NonNullable<Plugin["onShutdown"]>>[0]): Promise<void> {
    const shutdownPromises = this.plugins.map(async (plugin) => {
      if (plugin.onShutdown) {
        const timeoutPromise = new Promise<void>((resolve) => {
          setTimeout(() => {
            console.warn(`Plugin '${plugin.name}' onShutdown timed out after ${context.timeoutMs}ms`);
            resolve();
          }, context.timeoutMs);
        });

        const shutdownPromise = plugin.onShutdown(context).catch((error) => {
          console.error(
            `Plugin '${plugin.name}' onShutdown failed:`,
            error instanceof Error ? error.message : String(error)
          );
        });

        await Promise.race([shutdownPromise, timeoutPromise]);
      }
    });

    await Promise.all(shutdownPromises);
  }

  /**
   * Execute a specific hook on all plugins
   *
   * Errors are isolated - one plugin's error doesn't affect others.
   *
   * @param hookName - Name of hook to execute
   * @param args - Arguments to pass to hook
   */
  async executeHook<K extends keyof Plugin>(
    hookName: K,
    ...args: Parameters<NonNullable<Plugin[K]>>
  ): Promise<void> {
    for (const plugin of this.plugins) {
      const hook = plugin[hookName];
      if (hook && typeof hook === "function") {
        try {
          await (hook as any).apply(plugin, args);
        } catch (error) {
          console.error(
            `Plugin '${plugin.name}' ${String(hookName)} failed:`,
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    }
  }
}
