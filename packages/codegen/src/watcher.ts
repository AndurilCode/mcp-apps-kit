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
  // Queue-based approach: if a regeneration is in progress and new changes come in,
  // we mark that another regeneration is needed after the current one completes.
  let regenerateTimeout: ReturnType<typeof setTimeout> | null = null;
  let isRegenerating = false;
  let regenerationQueued = false;

  const executeRegeneration = async (): Promise<void> => {
    isRegenerating = true;
    regenerationQueued = false;

    try {
      await onRegenerate();
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
      logger.error(
        `Failed to regenerate manifest: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      isRegenerating = false;
      // If another regeneration was requested while we were running, execute it now
      if (regenerationQueued) {
        void executeRegeneration();
      }
    }
  };

  const debouncedRegenerate = () => {
    if (regenerateTimeout) {
      clearTimeout(regenerateTimeout);
    }

    regenerateTimeout = setTimeout(() => {
      if (isRegenerating) {
        // A regeneration is already in progress, queue another one
        regenerationQueued = true;
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
      debouncedRegenerate();
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

  // Filter to only include directories that exist
  const fs = await import("node:fs");
  const existingDirs = dirsToWatch.filter((dir) => {
    try {
      return fs.existsSync(dir);
    } catch {
      return false;
    }
  });

  // Create chokidar watcher with cross-platform settings
  const watcher: ChokidarFSWatcher = chokidar.watch(existingDirs, {
    ignored: (filePath: string) => {
      // Skip files we shouldn't process
      if (shouldSkipFile(filePath)) return true;
      // Only watch files with valid extensions (or directories)
      const isDir = fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
      if (!isDir && !hasValidExtension(filePath)) return true;
      return false;
    },
    persistent: true,
    ignoreInitial: true, // Don't fire events for existing files on startup
  });

  // Handle file add/unlink events
  watcher.on("add", (filePath: string) => {
    logger.info(`File added: ${path.relative(projectRoot, filePath)}`);
    debouncedRegenerate();
  });

  watcher.on("unlink", (filePath: string) => {
    logger.info(`File removed: ${path.relative(projectRoot, filePath)}`);
    debouncedRegenerate();
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
