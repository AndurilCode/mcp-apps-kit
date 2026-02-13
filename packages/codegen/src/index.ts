/**
 * @mcp-apps-kit/codegen
 *
 * Vite plugin for file-based MCP application development.
 *
 * Discovers tool, workflow, and UI definitions from conventional file locations
 * and generates a typed manifest for use with `createFileBasedApp`.
 *
 * @example
 * ```typescript
 * // vite.config.ts
 * import { defineConfig } from "vite";
 * import { mcpAppsPlugin } from "@mcp-apps-kit/codegen";
 *
 * export default defineConfig({
 *   plugins: [
 *     mcpAppsPlugin({
 *       configPath: "./mcp.config.ts",
 *       outDir: "__generated__",
 *       watch: true,
 *     }),
 *   ],
 * });
 * ```
 *
 * @example
 * ```typescript
 * // mcp.config.ts
 * import { defineConfig } from "@mcp-apps-kit/codegen";
 *
 * export default defineConfig({
 *   name: "my-app",
 *   version: "1.0.0",
 *   config: {
 *     protocol: "mcp",
 *     cors: { origin: true },
 *   },
 * });
 * ```
 */

import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";
import * as path from "node:path";
import type { McpAppsPluginOptions, FileBasedConfigInput, McpAppsPlugin } from "./types";
import {
  generateManifest,
  writeManifest,
  generateVersionedManifests,
  writeVersionedManifests,
  writeVersionsManifest,
  writeVersionedServer,
} from "./generator";
import { setupWatcher } from "./watcher";
import { loadConfig, defineConfig as defineConfigFn, isVersionedConfig } from "./config";
import { defaultLogger } from "./utils/logger";

// Re-export types
export type {
  McpAppsPluginOptions,
  FileBasedConfig,
  FileBasedConfigInput,
  DirectoriesConfig,
  DiscoveredFile,
  ManifestResult,
  PluginLogger,
  McpAppsPlugin,
  // Versioned config types
  VersionKey,
  VersionDirectoriesConfig,
  FileBasedVersionConfig,
  VersionedFileBasedConfig,
  VersionSpecificConfig,
  // Re-export from core for convenience (avoid needing to import from both packages)
  GlobalConfig,
  Icon,
  // Renamed to avoid collision with Vite's Plugin type
  Plugin as McpPlugin,
} from "./types";

// Re-export utilities
export { defineConfig, isVersionedConfig } from "./config";
export {
  generateManifest,
  writeManifest,
  runCodegen,
  // Versioned manifest generation
  generateVersionedManifests,
  writeVersionedManifests,
  writeVersionsManifest,
  writeVersionedServer,
  getVersionDirectories,
} from "./generator";
export type { GenerateManifestOptions } from "./generator";
export type { RunCodegenOptions, VersionedManifestResult } from "./generator";
export { defineApp } from "./app";
export type { CreateAppOptions, FileBasedAppInstance } from "./app";
export {
  pathToIdentifier,
  segmentToSnakeCase,
  shouldSkipFile,
  hasValidExtension,
  findNameCollisions,
  getRelativeImportPath,
  VALID_EXTENSIONS,
} from "./naming";

// File-based middleware and event handler helpers
export {
  defineMiddleware,
  defineOrderedMiddleware,
  defineHandler,
  Events,
  // Middleware sorting utilities
  DEFAULT_MIDDLEWARE_ORDER,
  isOrderedMiddleware,
  getMiddlewareOrder,
  getMiddlewareFn,
  sortMiddleware,
} from "./helpers";
export type {
  MiddlewareDefinition,
  BeforeHook,
  AfterHook,
  WrapMiddleware,
  FileBasedMiddlewareDefinition,
  OrderedMiddleware,
  HandlerDefinition,
  MiddlewareItem,
} from "./helpers";

/**
 * Vite plugin for file-based MCP application development
 *
 * This plugin:
 * 1. Loads configuration from mcp.config.ts
 * 2. Scans tools/, workflows/, and ui/ directories for definitions
 * 3. Generates a typed manifest at __generated__/app-manifest.ts
 * 4. Watches for file changes and regenerates the manifest (in dev mode)
 *
 * @param options - Plugin options
 * @returns Vite plugin
 *
 * @example
 * ```typescript
 * import { mcpAppsPlugin } from "@mcp-apps-kit/codegen";
 *
 * export default defineConfig({
 *   plugins: [
 *     mcpAppsPlugin({
 *       configPath: "./mcp.config.ts",
 *       outDir: "__generated__",
 *       watch: true,
 *     }),
 *   ],
 * });
 * ```
 */
export function mcpAppsPlugin(options: McpAppsPluginOptions = {}): McpAppsPlugin {
  const { configPath = "./mcp.config.ts", outDir = "__generated__", watch = true } = options;

  let config: ResolvedConfig;
  let fileBasedConfig: FileBasedConfigInput | null = null;
  let cleanupWatcher: (() => void) | null = null;

  const logger = defaultLogger;

  /**
   * Generate the manifest file(s)
   *
   * Handles both single-version and versioned configurations.
   */
  async function generate(): Promise<void> {
    if (!fileBasedConfig) {
      logger.error("Config not loaded, skipping manifest generation");
      return;
    }

    const projectRoot = config.root;

    // Handle versioned vs single-version config
    if (isVersionedConfig(fileBasedConfig)) {
      // Versioned config: generate per-version manifests + aggregator
      const versionKeys = Object.keys(fileBasedConfig.versions);
      logger.info(
        `Generating manifests for ${versionKeys.length} version(s): ${versionKeys.join(", ")}`
      );

      const results = await generateVersionedManifests(
        fileBasedConfig,
        projectRoot,
        outDir,
        logger
      );

      if (results.errors.length > 0) {
        for (const error of results.errors) {
          logger.error(error);
        }
        throw new Error(`Manifest generation failed with ${results.errors.length} error(s)`);
      }

      // Write all manifests
      await writeVersionedManifests(results, outDir, projectRoot);
      await writeVersionsManifest(versionKeys, outDir, projectRoot);
      await writeVersionedServer(versionKeys, outDir, projectRoot, configPath);

      logger.info(`Wrote versioned manifests to ${outDir}/`);
    } else {
      // Single-version config: generate single manifest
      const result = await generateManifest({
        projectRoot,
        directories: fileBasedConfig.directories,
        outDir,
        logger,
      });

      if (result.errors.length > 0) {
        for (const error of result.errors) {
          logger.error(error);
        }
        throw new Error(`Manifest generation failed with ${result.errors.length} error(s)`);
      }

      await writeManifest(result.code, outDir, projectRoot);
      logger.info(`Wrote manifest to ${outDir}/app-manifest.ts`);
    }
  }

  const plugin: Plugin = {
    name: "mcp-apps-plugin",

    /**
     * Store resolved Vite config
     */
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },

    /**
     * Load config and generate initial manifest at build start
     */
    async buildStart() {
      const projectRoot = config.root;

      // Load the configuration file
      try {
        fileBasedConfig = await loadConfig(configPath, projectRoot, logger);
      } catch (error) {
        logger.error(
          error instanceof Error ? error.message : `Failed to load config: ${String(error)}`
        );
        throw error;
      }

      // Generate the initial manifest(s)
      await generate();
    },

    /**
     * Set up file watching in dev mode
     */
    configureServer(server: ViteDevServer) {
      if (!watch) {
        return;
      }

      // Set up watcher after config is loaded
      server.httpServer?.once("listening", () => {
        if (!fileBasedConfig) {
          return;
        }

        // Pass the full config for version-aware watching
        const directories = isVersionedConfig(fileBasedConfig)
          ? undefined
          : fileBasedConfig.directories;

        cleanupWatcher = setupWatcher(server, {
          projectRoot: config.root,
          directories,
          config: fileBasedConfig,
          onRegenerate: generate,
          logger,
        });

        if (isVersionedConfig(fileBasedConfig)) {
          const versionKeys = Object.keys(fileBasedConfig.versions);
          logger.info(`File watcher started for versions: ${versionKeys.join(", ")}`);
        } else {
          logger.info("File watcher started for tools/, workflows/, ui/");
        }
      });
    },

    /**
     * Clean up watcher on server close
     */
    buildEnd() {
      if (cleanupWatcher) {
        cleanupWatcher();
        cleanupWatcher = null;
      }
    },

    /**
     * Resolve virtual module for the generated manifest
     */
    resolveId(id) {
      // Handle imports to the generated manifest (single-version)
      if (id === "@generated/app-manifest" || id === "~generated/app-manifest") {
        return path.resolve(config.root, outDir, "app-manifest.ts");
      }
      // Handle imports to the versions manifest (multi-version)
      if (id === "@generated/versions-manifest" || id === "~generated/versions-manifest") {
        return path.resolve(config.root, outDir, "versions-manifest.ts");
      }
      return null;
    },
  };

  return plugin;
}

// Default export for convenience
export default mcpAppsPlugin;

// Re-export defineConfig for convenience (aliased import to avoid conflict)
export { defineConfigFn as defineFileBasedConfig };
