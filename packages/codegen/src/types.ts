/**
 * Type definitions for @mcp-apps-kit/codegen
 */

import type { Plugin as VitePlugin } from "vite";
import type {
  GlobalConfig,
  Icon,
  Plugin as CorePlugin,
  VersionSpecificConfig,
} from "@mcp-apps-kit/core";

/**
 * Directory configuration for file-based discovery
 */
export interface DirectoriesConfig {
  /** Directory containing tool files. Default: "tools" */
  tools?: string;
  /** Directory containing workflow files. Default: "workflows" */
  workflows?: string;
  /** Directory containing UI files. Default: "ui" */
  ui?: string;
  /** Directory containing UI widget files for convention-based binding. Default: undefined (disabled) */
  uiWidgets?: string;
  /** Directory containing middleware files. Default: undefined (disabled) */
  middleware?: string;
  /** Directory containing event handler files. Default: undefined (disabled) */
  handlers?: string;
}

// Re-export types from core for convenience
export type { GlobalConfig, Icon };
export type { CorePlugin as Plugin };

/**
 * @deprecated Use GlobalConfig from @mcp-apps-kit/core instead
 */
export type FileBasedGlobalConfig = GlobalConfig;

/**
 * @deprecated Use Icon from @mcp-apps-kit/core instead
 */
export type IconConfig = Icon;

/**
 * Configuration for file-based MCP app
 *
 * Used with `defineConfig()` in `mcp.config.ts`.
 *
 * @example
 * ```typescript
 * import { defineConfig } from "@mcp-apps-kit/codegen";
 *
 * export default defineConfig({
 *   name: "my-app",
 *   version: "1.0.0",
 *   directories: {
 *     tools: "tools",
 *     workflows: "workflows",
 *     ui: "ui",
 *   },
 *   config: {
 *     protocol: "mcp",
 *     cors: { origin: true },
 *   },
 * });
 * ```
 */
export interface FileBasedConfig {
  /** App name (required) */
  name: string;

  /** App version (required) */
  version: string;

  /** Override default directories */
  directories?: DirectoriesConfig;

  /** Global config passed to createFileBasedApp (uses core GlobalConfig type) */
  config?: GlobalConfig;

  /** Plugins array (uses core Plugin type) */
  plugins?: CorePlugin[];

  /** App icon (shorthand for single icon) */
  icon?: string;

  /** App icons for MCP client display (uses core Icon type) */
  icons?: Icon[];
}

// =============================================================================
// VERSIONED CONFIGURATION
// =============================================================================

/**
 * Version key pattern for multi-version configuration.
 *
 * Keys must match the pattern `v{number}` (e.g., "v1", "v2", "v10").
 *
 * @example "v1", "v2", "v10"
 */
export type VersionKey = `v${number}`;

/**
 * Per-version directory configuration
 *
 * Allows customizing the directory structure for each version's resources.
 * Defaults are based on the version key (e.g., "versions/v1/tools" for v1).
 *
 * @example
 * ```typescript
 * directories: {
 *   root: "versions/v1",      // Base directory for this version
 *   tools: "versions/v1/tools",
 *   workflows: "versions/v1/workflows",
 *   ui: "versions/v1/ui",
 * }
 * ```
 */
export interface VersionDirectoriesConfig {
  /**
   * Root directory for this version's resources.
   * Default: "versions/{versionKey}"
   */
  root?: string;

  /**
   * Directory containing tool files for this version.
   * Default: "{root}/tools"
   */
  tools?: string;

  /**
   * Directory containing workflow files for this version.
   * Default: "{root}/workflows"
   */
  workflows?: string;

  /**
   * Directory containing UI files for this version.
   * Default: "{root}/ui"
   */
  ui?: string;

  /**
   * Directory containing UI widget files for convention-based binding.
   * Default: undefined (disabled)
   */
  uiWidgets?: string;

  /**
   * Directory containing middleware files for this version.
   * Default: undefined (disabled)
   */
  middleware?: string;

  /**
   * Directory containing event handler files for this version.
   * Default: undefined (disabled)
   */
  handlers?: string;
}

/**
 * Version-specific configuration for file-based discovery
 *
 * Each version can have its own tools, workflows, and UI resources
 * with optional configuration overrides.
 *
 * @example
 * ```typescript
 * v1: {
 *   version: "1.0.0",
 *   directories: {
 *     root: "versions/v1",
 *   },
 *   config: {
 *     debug: { level: "info" },
 *   },
 * }
 * ```
 */
export interface FileBasedVersionConfig {
  /**
   * Semantic version for this API version.
   *
   * @example "1.0.0"
   */
  version: string;

  /**
   * Optional directory configuration for this version.
   * If not specified, defaults based on the version key are used.
   */
  directories?: VersionDirectoriesConfig;

  /**
   * Optional configuration overrides for this version.
   * Deep-merged with global config, with version-specific taking precedence.
   *
   * Uses VersionSpecificConfig from core which supports null to disable.
   */
  config?: VersionSpecificConfig;

  /**
   * Optional version-specific plugins.
   * Merged with global plugins.
   */
  plugins?: CorePlugin[];
}

/**
 * Multi-version configuration for file-based MCP apps
 *
 * Used with `defineConfig()` to create apps that support multiple API versions.
 * Each version has its own tool, workflow, and UI directories under `versions/`.
 *
 * @example
 * ```typescript
 * import { defineConfig } from "@mcp-apps-kit/codegen";
 *
 * export default defineConfig({
 *   name: "my-api",
 *   config: {
 *     cors: { origin: true },
 *     debug: { level: "info" },
 *   },
 *   versions: {
 *     v1: {
 *       version: "1.0.0",
 *       // Uses default: versions/v1/tools, versions/v1/workflows, etc.
 *     },
 *     v2: {
 *       version: "2.0.0",
 *       config: {
 *         debug: { level: "debug" },  // Override for v2
 *       },
 *     },
 *   },
 * });
 * ```
 */
export interface VersionedFileBasedConfig {
  /** App name (required) */
  name: string;

  /**
   * Version definitions.
   * Keys should match pattern `/^v\d+$/` (e.g., "v1", "v2").
   * Each version will be exposed at `/{versionKey}/mcp`.
   */
  versions: Record<string, FileBasedVersionConfig>;

  /**
   * Shared global configuration.
   * Merged with each version's config, with version-specific taking precedence.
   */
  config?: GlobalConfig;

  /**
   * Shared plugins applied to all versions.
   * Merged with each version's plugins.
   */
  plugins?: CorePlugin[];

  /**
   * App icon (shorthand for single icon).
   * Applied to all versions.
   */
  icon?: string;

  /**
   * App icons for MCP client display.
   * Applied to all versions.
   */
  icons?: Icon[];
}

/**
 * Union type for defineConfig - supports both single-version and multi-version configs
 *
 * Single-version: FileBasedConfig (has `version: string`)
 * Multi-version: VersionedFileBasedConfig (has `versions: Record<...>`)
 */
export type FileBasedConfigInput = FileBasedConfig | VersionedFileBasedConfig;

// Re-export VersionSpecificConfig for convenience
export type { VersionSpecificConfig };

/**
 * Options for the MCP Apps Vite plugin
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
export interface McpAppsPluginOptions {
  /** Path to mcp.config.ts. Default: "./mcp.config.ts" */
  configPath?: string;

  /** Output directory for generated manifest. Default: "__generated__" */
  outDir?: string;

  /** Enable file watching for HMR. Default: true */
  watch?: boolean;
}

/**
 * Discovered file information
 */
export interface DiscoveredFile {
  /** Absolute path to the file */
  filePath: string;
  /** Relative path from the directory root */
  relativePath: string;
  /** Generated identifier (snake_case) */
  identifier: string;
  /** Has a valid default export */
  hasDefaultExport: boolean;
  /** Has a named 'ui' export (for colocated UI) */
  hasUiExport: boolean;
  /** Type of resource */
  type: "tool" | "workflow" | "ui" | "ui-widget" | "middleware" | "handler";
}

/**
 * Manifest generation result
 */
export interface ManifestResult {
  /** Generated TypeScript code */
  code: string;
  /** List of discovered files */
  files: DiscoveredFile[];
  /** Any warnings encountered */
  warnings: string[];
  /** Any errors encountered (if errors, code is empty) */
  errors: string[];
}

/**
 * Logger interface for the plugin
 */
export interface PluginLogger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

/**
 * Vite plugin type export
 */
export type McpAppsPlugin = VitePlugin;
