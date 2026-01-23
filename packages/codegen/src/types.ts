/**
 * Type definitions for @mcp-apps-kit/codegen
 */

import type { Plugin as VitePlugin } from "vite";
import type { GlobalConfig, Icon, Plugin as CorePlugin } from "@mcp-apps-kit/core";

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
  type: "tool" | "workflow" | "ui";
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
