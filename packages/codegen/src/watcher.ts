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
 * Check if a file is inside a UI widgets directory
 *
 * Widget files (.tsx/.jsx components) don't affect the server manifest —
 * they are built separately by the UI builder (Vite plugin). Changes to
 * widget files should NOT trigger manifest regeneration or tool hot-reload,
 * as that would cause unnecessary server churn and interfere with widget HMR.
 *
 * @param filePath - Absolute file path to check
 * @param projectRoot - Project root directory
 * @param directories - Directory configuration
 * @returns true if the file is inside a uiWidgets directory
 */
function isInUIWidgetsDir(
  filePath: string,
  projectRoot: string,
  directories: DirectoriesConfig
): boolean {
  const absolutePath = path.resolve(filePath);

  // Check explicit uiWidgets directory
  if (directories.uiWidgets) {
    const uiWidgetsDir = path.resolve(projectRoot, directories.uiWidgets);
    if (absolutePath.startsWith(uiWidgetsDir + path.sep) || absolutePath === uiWidgetsDir) {
      return true;
    }
  }

  return false;
}

/**
 * Resolve all UI widget directories from a versioned config
 *
 * @param config - Versioned file-based config
 * @param projectRoot - Project root directory
 * @returns Array of absolute paths for all uiWidgets directories
 */
function getVersionedUIWidgetDirs(config: VersionedFileBasedConfig, projectRoot: string): string[] {
  const dirs: string[] = [];

  for (const [versionKey, versionConfig] of Object.entries(config.versions)) {
    const versionDirs = getVersionDirectories(versionKey, versionConfig);
    if (versionDirs.uiWidgets) {
      dirs.push(path.resolve(projectRoot, versionDirs.uiWidgets));
    }
  }

  return dirs;
}

/**
 * Check if a file is inside any versioned UI widgets directory
 *
 * @param filePath - Absolute file path to check
 * @param uiWidgetDirs - Array of absolute uiWidgets directory paths
 * @returns true if the file is inside any uiWidgets directory
 */
function isInVersionedUIWidgetsDir(filePath: string, uiWidgetDirs: string[]): boolean {
  const absolutePath = path.resolve(filePath);

  return uiWidgetDirs.some(
    (dir) => absolutePath.startsWith(dir + path.sep) || absolutePath === dir
  );
}

/**
 * Tracks known widget files to distinguish genuine add/remove from
 * editor atomic-save operations (which appear as unlink + add).
 *
 * - `unlink` for a known file → content edit (atomic save step 1), skip regeneration
 * - `add` for an already-known file → content edit (atomic save step 2), skip regeneration
 * - `add` for an unknown file → genuinely new widget, trigger regeneration
 * - `unlink` for a file not re-added within a short window → genuine deletion, trigger regeneration
 *
 * We use a simpler deterministic approach: track the full set of known files.
 * On `add`, if the file is already known it's an atomic save — skip.
 * On `unlink`, remove from known and schedule a delayed check; if it's re-added
 * (atomic save) the add handler will cancel the pending deletion regeneration.
 */
class WidgetFileTracker {
  private knownFiles = new Set<string>();
  private pendingUnlinks = new Map<string, ReturnType<typeof setTimeout>>();

  /** Delay before treating an unlink as a genuine deletion (ms) */
  private static readonly UNLINK_GRACE_MS = 150;

  /**
   * Initialize with existing files from widget directories
   */
  async init(widgetDirs: string[]): Promise<void> {
    const fsPromises = await import("node:fs/promises");
    for (const dir of widgetDirs) {
      try {
        const entries = await fsPromises.readdir(dir, { recursive: true });
        for (const entry of entries) {
          const fullPath = path.resolve(dir, entry);
          if (hasValidExtension(fullPath) && !shouldSkipFile(fullPath)) {
            this.knownFiles.add(fullPath);
          }
        }
      } catch {
        // Directory might not exist yet — that's fine
      }
    }
  }

  /**
   * Handle an `add` event for a widget file.
   * @returns true if regeneration should be triggered (genuinely new file)
   */
  handleAdd(filePath: string): boolean {
    const absolutePath = path.resolve(filePath);

    // Cancel any pending unlink timer — this is the second half of an atomic save
    const pendingTimer = this.pendingUnlinks.get(absolutePath);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.pendingUnlinks.delete(absolutePath);
    }

    if (this.knownFiles.has(absolutePath)) {
      // Already known → atomic save (editor re-created the file), skip
      return false;
    }

    // Genuinely new file
    this.knownFiles.add(absolutePath);
    return true;
  }

  /**
   * Handle an `unlink` event for a widget file.
   * Schedules a delayed check — if the file is re-added (atomic save),
   * the add handler cancels this. If not, fires the callback.
   *
   * @param filePath - The file that was unlinked
   * @param onGenuineDelete - Callback if this turns out to be a real deletion
   */
  handleUnlink(filePath: string, onGenuineDelete: () => void): void {
    const absolutePath = path.resolve(filePath);

    // Schedule a delayed check — if add comes in within the grace period,
    // it's an atomic save and the timer gets cancelled
    const timer = setTimeout(() => {
      this.pendingUnlinks.delete(absolutePath);
      this.knownFiles.delete(absolutePath);
      onGenuineDelete();
    }, WidgetFileTracker.UNLINK_GRACE_MS);

    this.pendingUnlinks.set(absolutePath, timer);
  }

  /**
   * Clean up pending timers
   */
  dispose(): void {
    for (const timer of this.pendingUnlinks.values()) {
      clearTimeout(timer);
    }
    this.pendingUnlinks.clear();
  }
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
  let versionedUIWidgetDirs: string[] = [];

  if (isVersionedConfig(config)) {
    isVersioned = true;
    dirsToWatch = getVersionedWatchDirs(config, projectRoot);
    versionedUIWidgetDirs = getVersionedUIWidgetDirs(config, projectRoot);
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

  // Track known widget files to distinguish atomic saves from genuine add/remove.
  // Resolves the widget dirs to track — supports both single and versioned configs.
  const widgetDirs: string[] = isVersioned
    ? versionedUIWidgetDirs
    : directories.uiWidgets
      ? [path.resolve(projectRoot, directories.uiWidgets)]
      : [];

  const widgetTracker = new WidgetFileTracker();
  // Fire-and-forget init — tracker is ready before first file events since
  // Vite's watcher uses ignoreInitial:true and httpServer hasn't started yet.
  if (widgetDirs.length > 0) {
    void widgetTracker.init(widgetDirs);
  }

  // Helper to check if a file is in a UI widgets directory
  const isWidgetFile = (filePath: string): boolean => {
    return isVersioned
      ? isInVersionedUIWidgetsDir(filePath, versionedUIWidgetDirs)
      : isInUIWidgetsDir(filePath, projectRoot, directories);
  };

  // Handler for file changes
  const handleFileChange = (eventType: "add" | "unlink" | "change") => (filePath: string) => {
    // Check if file is in watched directories
    const inWatchedDir = isVersioned
      ? isInVersionedWatchDirectory(filePath, dirsToWatch)
      : isInWatchedDirectory(filePath, projectRoot, directories);

    if (!inWatchedDir) {
      return;
    }

    if (!shouldTriggerRegeneration(eventType, filePath)) {
      return;
    }

    // For widget files, use the tracker to distinguish atomic saves from
    // genuine file additions/deletions. Content edits (atomic saves) should
    // NOT trigger manifest regeneration — only the UI builder handles those.
    if (isWidgetFile(filePath)) {
      if (eventType === "add") {
        const isNew = widgetTracker.handleAdd(filePath);
        if (!isNew) return; // Atomic save — skip
        logger.info(`Widget added: ${path.relative(projectRoot, filePath)}`);
      } else if (eventType === "unlink") {
        widgetTracker.handleUnlink(filePath, () => {
          // Genuine deletion — trigger regeneration after grace period
          logger.info(`Widget removed: ${path.relative(projectRoot, filePath)}`);
          debouncedRegenerate(filePath);
        });
        return; // Wait for grace period
      }
    } else {
      logger.info(`File ${eventType}: ${path.relative(projectRoot, filePath)}`);
    }

    debouncedRegenerate(filePath);
  };

  // Set up event listeners
  watcher.on("add", handleFileChange("add"));
  watcher.on("unlink", handleFileChange("unlink"));

  // Return cleanup function
  return () => {
    if (regenerateTimeout) {
      clearTimeout(regenerateTimeout);
    }
    widgetTracker.dispose();
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
  let isVersioned = false;
  let versionedUIWidgetDirs: string[] = [];

  if (isVersionedConfig(config)) {
    isVersioned = true;
    dirsToWatch = getVersionedWatchDirs(config, projectRoot);
    versionedUIWidgetDirs = getVersionedUIWidgetDirs(config, projectRoot);
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

  // Track known widget files to distinguish atomic saves from genuine add/remove
  const widgetDirs: string[] = isVersioned
    ? versionedUIWidgetDirs
    : directories.uiWidgets
      ? [path.resolve(projectRoot, directories.uiWidgets)]
      : [];

  const widgetTracker = new WidgetFileTracker();
  if (widgetDirs.length > 0) {
    await widgetTracker.init(widgetDirs);
  }

  // Helper to check if a file is in a UI widgets directory
  const isWidgetFile = (filePath: string): boolean => {
    return isVersioned
      ? isInVersionedUIWidgetsDir(filePath, versionedUIWidgetDirs)
      : isInUIWidgetsDir(filePath, projectRoot, directories);
  };

  // Handle file add/unlink events
  // For widget files, use tracker to distinguish atomic saves from genuine changes.
  watcher.on("add", (filePath: string) => {
    if (isWidgetFile(filePath)) {
      const isNew = widgetTracker.handleAdd(filePath);
      if (!isNew) return; // Atomic save — skip
      logger.info(`Widget added: ${path.relative(projectRoot, filePath)}`);
      debouncedRegenerate(filePath);
      return;
    }
    logger.info(`File added: ${path.relative(projectRoot, filePath)}`);
    debouncedRegenerate(filePath);
  });

  watcher.on("unlink", (filePath: string) => {
    if (isWidgetFile(filePath)) {
      widgetTracker.handleUnlink(filePath, () => {
        // Genuine deletion — trigger regeneration after grace period
        logger.info(`Widget removed: ${path.relative(projectRoot, filePath)}`);
        debouncedRegenerate(filePath);
      });
      return;
    }
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
      widgetTracker.dispose();
      void watcher.close();
    },
  };
}
