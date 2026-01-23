/**
 * File watcher for HMR support
 *
 * Watches the tools/, workflows/, and ui/ directories for changes
 * and triggers manifest regeneration when files are added or removed.
 */

import * as path from "node:path";
import type { FSWatcher } from "node:fs";
import type { ViteDevServer } from "vite";
import type { DirectoriesConfig, PluginLogger } from "./types";
import { hasValidExtension, shouldSkipFile } from "./naming";

/**
 * Default logger
 */
const defaultLogger: PluginLogger = {
  info: (message: string) => {
    console.log(`[mcp-apps-plugin] ${message}`); // eslint-disable-line no-console
  },
  warn: (message: string) => {
    console.warn(`[mcp-apps-plugin] ${message}`); // eslint-disable-line no-console
  },
  error: (message: string) => {
    console.error(`[mcp-apps-plugin] ${message}`); // eslint-disable-line no-console
  },
};

/**
 * Options for setting up the watcher
 */
export interface WatcherOptions {
  /** Project root directory */
  projectRoot: string;
  /** Directory configuration */
  directories?: DirectoriesConfig;
  /** Callback when manifest needs regeneration */
  onRegenerate: () => Promise<void>;
  /** Logger */
  logger?: PluginLogger;
}

/**
 * Check if a file change should trigger regeneration
 *
 * Regeneration is needed when:
 * - A file is added (new tool/workflow/UI)
 * - A file is removed (tool/workflow/UI deleted)
 * - A file is renamed
 *
 * Content changes within a file do NOT require regeneration
 * because the import paths don't change.
 */
function shouldTriggerRegeneration(
  eventType: "add" | "unlink" | "change",
  filePath: string
): boolean {
  // Only care about additions and deletions
  if (eventType !== "add" && eventType !== "unlink") {
    return false;
  }

  // Check if it's a valid file type
  if (!hasValidExtension(filePath)) {
    return false;
  }

  // Check if it's a file we should process
  if (shouldSkipFile(filePath)) {
    return false;
  }

  return true;
}

/**
 * Check if a path is within one of the watched directories
 */
function isInWatchedDirectory(
  filePath: string,
  projectRoot: string,
  directories: DirectoriesConfig
): boolean {
  const toolsDir = path.resolve(projectRoot, directories.tools ?? "tools");
  const workflowsDir = path.resolve(projectRoot, directories.workflows ?? "workflows");
  const uiDir = path.resolve(projectRoot, directories.ui ?? "ui");

  const absolutePath = path.resolve(filePath);

  return (
    absolutePath.startsWith(toolsDir + path.sep) ||
    absolutePath === toolsDir ||
    absolutePath.startsWith(workflowsDir + path.sep) ||
    absolutePath === workflowsDir ||
    absolutePath.startsWith(uiDir + path.sep) ||
    absolutePath === uiDir
  );
}

/**
 * Set up file watching using Vite's built-in watcher
 *
 * Uses Vite's chokidar instance for consistency with other Vite plugins.
 *
 * @param server - Vite dev server instance
 * @param options - Watcher options
 * @returns Cleanup function to stop watching
 */
export function setupWatcher(server: ViteDevServer, options: WatcherOptions): () => void {
  const { projectRoot, directories = {}, onRegenerate, logger = defaultLogger } = options;

  const toolsDir = path.resolve(projectRoot, directories.tools ?? "tools");
  const workflowsDir = path.resolve(projectRoot, directories.workflows ?? "workflows");
  const uiDir = path.resolve(projectRoot, directories.ui ?? "ui");

  // Debounce regeneration to avoid multiple rapid regenerations
  let regenerateTimeout: ReturnType<typeof setTimeout> | null = null;
  let pendingRegeneration = false;

  const debouncedRegenerate = async () => {
    if (regenerateTimeout) {
      clearTimeout(regenerateTimeout);
    }

    regenerateTimeout = setTimeout(() => {
      if (pendingRegeneration) {
        return;
      }
      pendingRegeneration = true;

      onRegenerate()
        .then(() => {
          // Trigger HMR by invalidating the manifest module
          const manifestModule = server.moduleGraph.getModuleById(
            path.resolve(projectRoot, "__generated__/app-manifest.ts")
          );
          if (manifestModule) {
            server.moduleGraph.invalidateModule(manifestModule);
            server.ws.send({
              type: "full-reload",
              path: "*",
            });
          }
        })
        .catch((error: unknown) => {
          logger.error(
            `Failed to regenerate manifest: ${error instanceof Error ? error.message : String(error)}`
          );
        })
        .finally(() => {
          pendingRegeneration = false;
        });
    }, 100);
  };

  // Watch directories using Vite's watcher
  const watcher = server.watcher;

  // Add directories to watch
  watcher.add([toolsDir, workflowsDir, uiDir]);

  // Handler for file changes
  const handleFileChange = (eventType: "add" | "unlink" | "change") => (filePath: string) => {
    if (!isInWatchedDirectory(filePath, projectRoot, directories)) {
      return;
    }

    if (shouldTriggerRegeneration(eventType, filePath)) {
      logger.info(`File ${eventType}: ${path.relative(projectRoot, filePath)}`);
      void debouncedRegenerate();
    }
  };

  // Set up event listeners
  watcher.on("add", handleFileChange("add"));
  watcher.on("unlink", handleFileChange("unlink"));

  // Return cleanup function
  return () => {
    if (regenerateTimeout) {
      clearTimeout(regenerateTimeout);
    }
    // Note: We don't need to remove listeners as Vite handles this
    // when the server is closed
  };
}

/**
 * Create a standalone watcher (for use outside of Vite)
 *
 * Uses Node.js fs.watch for standalone watching.
 * This is useful for CLI tools or build scripts.
 *
 * @param options - Watcher options
 * @returns Object with cleanup function
 */
export async function createStandaloneWatcher(
  options: WatcherOptions
): Promise<{ close: () => void }> {
  const { projectRoot, directories = {}, onRegenerate, logger = defaultLogger } = options;

  const fs = await import("node:fs");
  const watchers: FSWatcher[] = [];

  const toolsDir = path.resolve(projectRoot, directories.tools ?? "tools");
  const workflowsDir = path.resolve(projectRoot, directories.workflows ?? "workflows");
  const uiDir = path.resolve(projectRoot, directories.ui ?? "ui");

  // Debounce regeneration
  let regenerateTimeout: ReturnType<typeof setTimeout> | null = null;

  const debouncedRegenerate = () => {
    if (regenerateTimeout) {
      clearTimeout(regenerateTimeout);
    }
    regenerateTimeout = setTimeout(() => {
      void onRegenerate().catch((error: unknown) => {
        logger.error(
          `Failed to regenerate manifest: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    }, 100);
  };

  // Set up watchers for each directory
  const dirsToWatch = [toolsDir, workflowsDir, uiDir];

  for (const dir of dirsToWatch) {
    try {
      const watcher = fs.watch(dir, { recursive: true }, (_eventType, filename) => {
        if (!filename) return;

        const filePath = path.join(dir, filename);

        if (hasValidExtension(filePath) && !shouldSkipFile(filePath)) {
          logger.info(`File changed: ${path.relative(projectRoot, filePath)}`);
          debouncedRegenerate();
        }
      });

      watchers.push(watcher);
    } catch {
      // Directory doesn't exist - that's OK
    }
  }

  return {
    close: () => {
      if (regenerateTimeout) {
        clearTimeout(regenerateTimeout);
      }
      for (const watcher of watchers) {
        watcher.close();
      }
    },
  };
}
