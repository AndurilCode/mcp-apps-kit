/**
 * File watcher for HMR support
 *
 * Watches the tools/, workflows/, and ui/ directories for changes
 * and triggers manifest regeneration when files are added or removed.
 */

import * as path from "node:path";
import type { FSWatcher as ChokidarFSWatcher } from "chokidar";
import type { ViteDevServer } from "vite";
import type {
  DirectoriesConfig,
  PluginLogger,
  VersionedFileBasedConfig,
  FileBasedConfigInput,
} from "./types";
import { hasValidExtension, shouldSkipFile } from "./naming";
import { getVersionDirectories } from "./generator";

/**
 * Default logger
 */
const defaultLogger: PluginLogger = {
  info: (message: string) => {
    console.log(`[mcp-apps-plugin] ${message}`);
  },
  warn: (message: string) => {
    console.warn(`[mcp-apps-plugin] ${message}`);
  },
  error: (message: string) => {
    console.error(`[mcp-apps-plugin] ${message}`);
  },
};

/**
 * Options for setting up the watcher
 */
export interface WatcherOptions {
  /** Project root directory */
  projectRoot: string;
  /** Directory configuration (for single-version) */
  directories?: DirectoriesConfig;
  /** Full config (for versioned config detection) */
  config?: FileBasedConfigInput;
  /** Callback when manifest needs regeneration */
  onRegenerate: () => Promise<void>;
  /** Logger */
  logger?: PluginLogger;
}

/**
 * Check if config is versioned
 */
function isVersionedConfig(
  config: FileBasedConfigInput | undefined
): config is VersionedFileBasedConfig {
  return config !== undefined && "versions" in config && !("version" in config);
}

/**
 * Get all directories to watch for a versioned config
 */
function getVersionedWatchDirs(config: VersionedFileBasedConfig, projectRoot: string): string[] {
  const dirs: string[] = [];

  for (const [versionKey, versionConfig] of Object.entries(config.versions)) {
    const versionDirs = getVersionDirectories(versionKey, versionConfig);
    dirs.push(path.resolve(projectRoot, versionDirs.tools ?? `versions/${versionKey}/tools`));
    dirs.push(
      path.resolve(projectRoot, versionDirs.workflows ?? `versions/${versionKey}/workflows`)
    );
    dirs.push(path.resolve(projectRoot, versionDirs.ui ?? `versions/${versionKey}/ui`));
    if (versionDirs.uiWidgets) {
      dirs.push(path.resolve(projectRoot, versionDirs.uiWidgets));
    }
    if (versionDirs.middleware) {
      dirs.push(path.resolve(projectRoot, versionDirs.middleware));
    }
    if (versionDirs.handlers) {
      dirs.push(path.resolve(projectRoot, versionDirs.handlers));
    }
  }

  return dirs;
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

  // Check core directories
  if (
    absolutePath.startsWith(toolsDir + path.sep) ||
    absolutePath === toolsDir ||
    absolutePath.startsWith(workflowsDir + path.sep) ||
    absolutePath === workflowsDir ||
    absolutePath.startsWith(uiDir + path.sep) ||
    absolutePath === uiDir
  ) {
    return true;
  }

  // Check optional directories
  if (directories.uiWidgets) {
    const uiWidgetsDir = path.resolve(projectRoot, directories.uiWidgets);
    if (absolutePath.startsWith(uiWidgetsDir + path.sep) || absolutePath === uiWidgetsDir) {
      return true;
    }
  }

  if (directories.middleware) {
    const middlewareDir = path.resolve(projectRoot, directories.middleware);
    if (absolutePath.startsWith(middlewareDir + path.sep) || absolutePath === middlewareDir) {
      return true;
    }
  }

  if (directories.handlers) {
    const handlersDir = path.resolve(projectRoot, directories.handlers);
    if (absolutePath.startsWith(handlersDir + path.sep) || absolutePath === handlersDir) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a path is within any of the versioned directories
 */
function isInVersionedWatchDirectory(filePath: string, watchDirs: string[]): boolean {
  const absolutePath = path.resolve(filePath);

  return watchDirs.some((dir) => absolutePath.startsWith(dir + path.sep) || absolutePath === dir);
}

/**
 * Set up file watching using Vite's built-in watcher
 *
 * Uses Vite's chokidar instance for consistency with other Vite plugins.
 * Supports both single-version and versioned configurations.
 *
 * @param server - Vite dev server instance
 * @param options - Watcher options
 * @returns Cleanup function to stop watching
 */
export function setupWatcher(server: ViteDevServer, options: WatcherOptions): () => void {
  const { projectRoot, directories = {}, config, onRegenerate, logger = defaultLogger } = options;

  // Determine directories to watch based on config type
  let dirsToWatch: string[];
  let isVersioned = false;

  if (isVersionedConfig(config)) {
    isVersioned = true;
    dirsToWatch = getVersionedWatchDirs(config, projectRoot);
    logger.info(`Watching versioned directories: ${dirsToWatch.length} paths`);
  } else {
    const toolsDir = path.resolve(projectRoot, directories.tools ?? "tools");
    const workflowsDir = path.resolve(projectRoot, directories.workflows ?? "workflows");
    const uiDir = path.resolve(projectRoot, directories.ui ?? "ui");
    dirsToWatch = [toolsDir, workflowsDir, uiDir];
    // Add optional directories if configured
    if (directories.uiWidgets) {
      dirsToWatch.push(path.resolve(projectRoot, directories.uiWidgets));
    }
    if (directories.middleware) {
      dirsToWatch.push(path.resolve(projectRoot, directories.middleware));
    }
    if (directories.handlers) {
      dirsToWatch.push(path.resolve(projectRoot, directories.handlers));
    }
  }

  // Debounce regeneration to avoid multiple rapid regenerations
  // Set-based approach: track pending file changes to ensure none are lost
  let regenerateTimeout: ReturnType<typeof setTimeout> | null = null;
  let isRegenerating = false;
  const pendingChanges = new Set<string>();

  // Retry configuration for error recovery
  const MAX_RETRY_ATTEMPTS = 3;
  const BASE_RETRY_DELAY_MS = 500;
  let consecutiveFailures = 0;

  const executeRegeneration = async (): Promise<void> => {
    isRegenerating = true;

    // Capture and clear pending changes atomically
    const changesToProcess = Array.from(pendingChanges);
    pendingChanges.clear();

    try {
      await onRegenerate();

      // Reset failure counter on success
      consecutiveFailures = 0;

      // Trigger HMR by invalidating the manifest module(s)
      if (isVersioned) {
        // For versioned configs, invalidate the versions-manifest
        const versionsManifestModule = server.moduleGraph.getModuleById(
          path.resolve(projectRoot, "__generated__/versions-manifest.ts")
        );
        if (versionsManifestModule) {
          server.moduleGraph.invalidateModule(versionsManifestModule);
        }
      } else {
        // For single-version, invalidate app-manifest
        const manifestModule = server.moduleGraph.getModuleById(
          path.resolve(projectRoot, "__generated__/app-manifest.ts")
        );
        if (manifestModule) {
          server.moduleGraph.invalidateModule(manifestModule);
        }
      }
      server.ws.send({
        type: "full-reload",
        path: "*",
      });
    } catch (error: unknown) {
      consecutiveFailures++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to regenerate manifest: ${errorMessage}`);

      // Exponential backoff retry
      if (consecutiveFailures <= MAX_RETRY_ATTEMPTS) {
        const retryDelay = BASE_RETRY_DELAY_MS * Math.pow(2, consecutiveFailures - 1);
        logger.warn(
          `Retrying regeneration in ${retryDelay}ms (attempt ${consecutiveFailures}/${MAX_RETRY_ATTEMPTS})`
        );

        // Re-add the changes that failed to process
        for (const change of changesToProcess) {
          pendingChanges.add(change);
        }

        // Schedule retry with exponential backoff
        setTimeout(() => {
          if (!isRegenerating && pendingChanges.size > 0) {
            void executeRegeneration();
          }
        }, retryDelay);
      } else {
        logger.error(
          `Regeneration failed after ${MAX_RETRY_ATTEMPTS} attempts. Manual restart may be required.`
        );
      }
    } finally {
      isRegenerating = false;
      // If new changes arrived while we were processing, execute another regeneration
      if (pendingChanges.size > 0) {
        void executeRegeneration();
      }
    }
  };

  const debouncedRegenerate = (filePath: string) => {
    // Track the file change
    pendingChanges.add(filePath);

    if (regenerateTimeout) {
      clearTimeout(regenerateTimeout);
    }

    regenerateTimeout = setTimeout(() => {
      if (isRegenerating) {
        // Changes are already tracked in pendingChanges, they'll be processed next
        return;
      }
      void executeRegeneration();
    }, 100);
  };

  // Watch directories using Vite's watcher
  const watcher = server.watcher;

  // Add directories to watch
  watcher.add(dirsToWatch);

  // Handler for file changes
  const handleFileChange = (eventType: "add" | "unlink" | "change") => (filePath: string) => {
    // Check if file is in watched directories
    const inWatchedDir = isVersioned
      ? isInVersionedWatchDirectory(filePath, dirsToWatch)
      : isInWatchedDirectory(filePath, projectRoot, directories);

    if (!inWatchedDir) {
      return;
    }

    if (shouldTriggerRegeneration(eventType, filePath)) {
      logger.info(`File ${eventType}: ${path.relative(projectRoot, filePath)}`);
      debouncedRegenerate(filePath);
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
 * Uses chokidar for cross-platform file watching (including Linux).
 * This is useful for CLI tools or build scripts.
 * Supports both single-version and versioned configurations.
 *
 * @param options - Watcher options
 * @returns Object with cleanup function
 */
export async function createStandaloneWatcher(
  options: WatcherOptions
): Promise<{ close: () => void }> {
  const { projectRoot, directories = {}, config, onRegenerate, logger = defaultLogger } = options;

  // Dynamically import chokidar for cross-platform file watching
  const chokidar = await import("chokidar");

  // Determine directories to watch based on config type
  let dirsToWatch: string[];

  if (isVersionedConfig(config)) {
    dirsToWatch = getVersionedWatchDirs(config, projectRoot);
    logger.info(`Watching versioned directories: ${dirsToWatch.length} paths`);
  } else {
    const toolsDir = path.resolve(projectRoot, directories.tools ?? "tools");
    const workflowsDir = path.resolve(projectRoot, directories.workflows ?? "workflows");
    const uiDir = path.resolve(projectRoot, directories.ui ?? "ui");
    dirsToWatch = [toolsDir, workflowsDir, uiDir];
    // Add optional directories if configured
    if (directories.uiWidgets) {
      dirsToWatch.push(path.resolve(projectRoot, directories.uiWidgets));
    }
    if (directories.middleware) {
      dirsToWatch.push(path.resolve(projectRoot, directories.middleware));
    }
    if (directories.handlers) {
      dirsToWatch.push(path.resolve(projectRoot, directories.handlers));
    }
  }

  // Debounce regeneration with retry support
  let regenerateTimeout: ReturnType<typeof setTimeout> | null = null;
  let isRegenerating = false;
  const pendingChanges = new Set<string>();

  // Retry configuration for error recovery
  const MAX_RETRY_ATTEMPTS = 3;
  const BASE_RETRY_DELAY_MS = 500;
  let consecutiveFailures = 0;

  const executeRegeneration = async (): Promise<void> => {
    isRegenerating = true;

    // Capture and clear pending changes atomically
    const changesToProcess = Array.from(pendingChanges);
    pendingChanges.clear();

    try {
      await onRegenerate();
      consecutiveFailures = 0; // Reset on success
    } catch (error: unknown) {
      consecutiveFailures++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to regenerate manifest: ${errorMessage}`);

      // Exponential backoff retry
      if (consecutiveFailures <= MAX_RETRY_ATTEMPTS) {
        const retryDelay = BASE_RETRY_DELAY_MS * Math.pow(2, consecutiveFailures - 1);
        logger.warn(
          `Retrying regeneration in ${retryDelay}ms (attempt ${consecutiveFailures}/${MAX_RETRY_ATTEMPTS})`
        );

        // Re-add the changes that failed to process
        for (const change of changesToProcess) {
          pendingChanges.add(change);
        }

        // Schedule retry with exponential backoff
        setTimeout(() => {
          if (!isRegenerating && pendingChanges.size > 0) {
            void executeRegeneration();
          }
        }, retryDelay);
      } else {
        logger.error(
          `Regeneration failed after ${MAX_RETRY_ATTEMPTS} attempts. Manual restart may be required.`
        );
      }
    } finally {
      isRegenerating = false;
      // If new changes arrived while we were processing, execute another regeneration
      if (pendingChanges.size > 0) {
        void executeRegeneration();
      }
    }
  };

  const debouncedRegenerate = (filePath: string) => {
    pendingChanges.add(filePath);

    if (regenerateTimeout) {
      clearTimeout(regenerateTimeout);
    }
    regenerateTimeout = setTimeout(() => {
      if (isRegenerating) {
        return; // Changes are tracked in pendingChanges
      }
      void executeRegeneration();
    }, 100);
  };

  // Filter to only include directories that exist (async to avoid blocking event loop)
  const fsPromises = await import("node:fs/promises");
  const existenceChecks = await Promise.all(
    dirsToWatch.map(async (dir) => {
      try {
        await fsPromises.access(dir);
        return { dir, exists: true };
      } catch {
        return { dir, exists: false };
      }
    })
  );
  const existingDirs = existenceChecks.filter((check) => check.exists).map((check) => check.dir);

  // Create chokidar watcher with cross-platform settings
  // Use pattern-based ignoring to avoid synchronous file operations
  const watcher: ChokidarFSWatcher = chokidar.watch(existingDirs, {
    ignored: (filePath: string, stats) => {
      // Skip files we shouldn't process (e.g., hidden files, node_modules)
      if (shouldSkipFile(filePath)) return true;
      // If stats are provided, use them to check if it's a directory (avoids sync fs call)
      // Directories are always watched, only filter out non-matching file extensions
      if (stats?.isDirectory()) return false;
      // For files without stats, only filter by extension (safe since chokidar resolves dirs)
      if (!hasValidExtension(filePath)) return true;
      return false;
    },
    persistent: true,
    ignoreInitial: true, // Don't fire events for existing files on startup
    // Enable stats to avoid sync file operations in ignored callback
    alwaysStat: true,
  });

  // Handle file add/unlink events
  watcher.on("add", (filePath: string) => {
    logger.info(`File added: ${path.relative(projectRoot, filePath)}`);
    debouncedRegenerate(filePath);
  });

  watcher.on("unlink", (filePath: string) => {
    logger.info(`File removed: ${path.relative(projectRoot, filePath)}`);
    debouncedRegenerate(filePath);
  });

  watcher.on("error", (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Watcher error: ${message}`);
  });

  return {
    close: () => {
      if (regenerateTimeout) {
        clearTimeout(regenerateTimeout);
      }
      void watcher.close();
    },
  };
}
