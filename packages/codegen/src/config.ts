/**
 * Configuration file loader
 *
 * Loads and validates mcp.config.ts files for file-based app development.
 * Uses jiti for native TypeScript support without requiring tsx.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createJiti } from "jiti";
import {
  GlobalConfigSchema,
  VersionDirectoriesSchema,
  PluginsArraySchema,
  formatConfigZodError,
} from "@mcp-apps-kit/core";
import type {
  FileBasedConfig,
  FileBasedConfigInput,
  FileBasedVersionConfig,
  PluginLogger,
  VersionedFileBasedConfig,
} from "./types";
import { defaultLogger as createDefaultLogger } from "./utils/logger";

/**
 * Default logger
 */
const defaultLogger: PluginLogger = createDefaultLogger;

/**
 * Allowed config file extensions for security
 */
const ALLOWED_CONFIG_EXTENSIONS = [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"];

/**
 * Validate that a config file path is safe to load
 *
 * @param configPath - The config file path (relative or absolute)
 * @param projectRoot - The project root directory
 * @throws Error if path is outside project root or has invalid extension
 */
function validateConfigPath(configPath: string, projectRoot: string): void {
  const absolutePath = path.resolve(projectRoot, configPath);
  const normalizedPath = path.normalize(absolutePath);
  const normalizedRoot = path.normalize(projectRoot);

  // Check path is within project root (path traversal protection)
  if (!normalizedPath.startsWith(normalizedRoot + path.sep) && normalizedPath !== normalizedRoot) {
    throw new Error(`Security error: Config path "${configPath}" resolves outside project root`);
  }

  // Check file extension is allowed
  const ext = path.extname(normalizedPath).toLowerCase();
  if (!ALLOWED_CONFIG_EXTENSIONS.includes(ext)) {
    throw new Error(
      `Security error: Config file must have one of these extensions: ${ALLOWED_CONFIG_EXTENSIONS.join(", ")}. Got: "${ext}"`
    );
  }
}

/**
 * Helper function to define a file-based app configuration with TypeScript autocomplete
 *
 * This is a simple identity function that provides type safety and IDE autocomplete
 * when creating configuration files.
 *
 * @param config - The configuration object (single-version or multi-version)
 * @returns The same configuration object (for type inference)
 *
 * @example Single-version configuration
 * ```typescript
 * // mcp.config.ts
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
 *     debug: { logTool: true, level: "debug" },
 *   },
 * });
 * ```
 *
 * @example Multi-version configuration
 * ```typescript
 * // mcp.config.ts
 * import { defineConfig } from "@mcp-apps-kit/codegen";
 *
 * export default defineConfig({
 *   name: "my-api",
 *   config: {
 *     cors: { origin: true },
 *   },
 *   versions: {
 *     v1: { version: "1.0.0" },
 *     v2: {
 *       version: "2.0.0",
 *       config: { debug: { level: "debug" } },
 *     },
 *   },
 * });
 * ```
 */
export function defineConfig(config: FileBasedConfigInput): FileBasedConfigInput {
  return config;
}

/**
 * Type guard to check if config is a versioned (multi-version) configuration
 *
 * @param config - Configuration to check
 * @returns True if this is a VersionedFileBasedConfig (has `versions` but no `version`)
 *
 * @example
 * ```typescript
 * const config = await loadConfig("./mcp.config.ts", projectRoot);
 * if (isVersionedConfig(config)) {
 *   // config is VersionedFileBasedConfig
 *   console.log("Versions:", Object.keys(config.versions));
 * } else {
 *   // config is FileBasedConfig
 *   console.log("Version:", config.version);
 * }
 * ```
 */
export function isVersionedConfig(
  config: FileBasedConfigInput
): config is VersionedFileBasedConfig {
  return "versions" in config && !("version" in config);
}

/**
 * Regular expression pattern for valid version keys (v1, v2, v10, etc.)
 */
const VERSION_KEY_PATTERN = /^v\d+$/;

/**
 * Validate global config fields using shared Zod schemas from @mcp-apps-kit/core
 *
 * Uses shared schemas to ensure consistent validation between codegen and core.
 * Converts Zod errors to plain Error (vs AppError in core).
 */
function validateGlobalConfigFields(globalConfig: Record<string, unknown>, prefix: string): void {
  const result = GlobalConfigSchema.safeParse(globalConfig);
  if (!result.success) {
    throw new Error(formatConfigZodError(result.error, prefix));
  }
}

/**
 * Validate version directories configuration using shared Zod schema
 */
function validateVersionDirectoriesConfig(dirs: Record<string, unknown>, prefix: string): void {
  const result = VersionDirectoriesSchema.safeParse(dirs);
  if (!result.success) {
    throw new Error(formatConfigZodError(result.error, prefix));
  }
}

/**
 * Validate plugins array configuration using shared Zod schema
 *
 * @param plugins - The plugins array to validate
 * @param prefix - Error message prefix (e.g., "Configuration" or "Version 'v1'")
 * @throws Error if plugins array is invalid
 */
function validatePluginsConfig(plugins: unknown, prefix: string): void {
  const result = PluginsArraySchema.safeParse(plugins);
  if (!result.success) {
    throw new Error(formatConfigZodError(result.error, `${prefix} 'plugins'`));
  }
}

/**
 * Validate a single version configuration
 */
function validateVersionConfig(
  versionConfig: unknown,
  versionKey: string
): asserts versionConfig is FileBasedVersionConfig {
  if (typeof versionConfig !== "object" || versionConfig === null) {
    throw new Error(`Version '${versionKey}' configuration must be an object`);
  }

  const cfg = versionConfig as Record<string, unknown>;

  // Required: version field
  if (typeof cfg.version !== "string" || cfg.version.length === 0) {
    throw new Error(`Version '${versionKey}' requires a 'version' field (semantic version string)`);
  }

  // Optional: directories
  if (cfg.directories !== undefined) {
    if (typeof cfg.directories !== "object" || cfg.directories === null) {
      throw new Error(`Version '${versionKey}' 'directories' must be an object`);
    }
    validateVersionDirectoriesConfig(
      cfg.directories as Record<string, unknown>,
      `Version '${versionKey}' 'directories'`
    );
  }

  // Optional: config (allow null for disabling inherited config)
  if (cfg.config !== undefined && cfg.config !== null) {
    if (typeof cfg.config !== "object") {
      throw new Error(`Version '${versionKey}' 'config' must be an object or null`);
    }
    // Note: VersionSpecificConfig allows null at any level, so we do light validation
    const globalConfig = cfg.config as Record<string, unknown>;
    validateGlobalConfigFields(globalConfig, `Version '${versionKey}' 'config'`);
  }

  // Optional: plugins (validated with shared schema)
  if (cfg.plugins !== undefined) {
    validatePluginsConfig(cfg.plugins, `Version '${versionKey}'`);
  }
}

/**
 * Validate a versioned (multi-version) configuration object
 *
 * @param config - Configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateVersionedConfig(
  config: unknown
): asserts config is VersionedFileBasedConfig {
  if (typeof config !== "object" || config === null) {
    throw new Error("Configuration must be an object");
  }

  const cfg = config as Record<string, unknown>;

  // Required: name
  if (typeof cfg.name !== "string" || cfg.name.length === 0) {
    throw new Error("Configuration 'name' is required and must be a non-empty string");
  }

  // Required: versions
  if (cfg.versions === undefined) {
    throw new Error("Versioned configuration requires a 'versions' field");
  }
  if (typeof cfg.versions !== "object" || cfg.versions === null) {
    throw new Error("Configuration 'versions' must be an object");
  }

  const versions = cfg.versions as Record<string, unknown>;
  const versionKeys = Object.keys(versions);

  if (versionKeys.length === 0) {
    throw new Error("Configuration 'versions' must contain at least one version");
  }

  // Validate each version key and config
  for (const versionKey of versionKeys) {
    // Validate version key format (v1, v2, etc.)
    if (!VERSION_KEY_PATTERN.test(versionKey)) {
      throw new Error(
        `Invalid version key '${versionKey}'. Version keys must match pattern 'v{number}' (e.g., v1, v2, v10)`
      );
    }

    validateVersionConfig(versions[versionKey], versionKey);
  }

  // Optional: global config
  if (cfg.config !== undefined) {
    if (typeof cfg.config !== "object" || cfg.config === null) {
      throw new Error("Configuration 'config' must be an object");
    }
    const globalConfig = cfg.config as Record<string, unknown>;
    validateGlobalConfigFields(globalConfig, "Configuration 'config'");
  }

  // Optional: plugins (validated with shared schema)
  if (cfg.plugins !== undefined) {
    validatePluginsConfig(cfg.plugins, "Configuration");
  }

  // Optional: icon
  if (cfg.icon !== undefined && typeof cfg.icon !== "string") {
    throw new Error("Configuration 'icon' must be a string");
  }

  // Optional: icons
  if (cfg.icons !== undefined) {
    if (!Array.isArray(cfg.icons)) {
      throw new Error("Configuration 'icons' must be an array");
    }
    for (const icon of cfg.icons as unknown[]) {
      if (typeof icon !== "object" || icon === null) {
        throw new Error("Each icon must be an object");
      }
      const iconObj = icon as Record<string, unknown>;
      if (typeof iconObj.src !== "string") {
        throw new Error("Each icon must have a 'src' string property");
      }
    }
  }
}

/**
 * Validate a configuration object (single-version)
 *
 * @param config - Configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateConfig(config: unknown): asserts config is FileBasedConfig {
  if (typeof config !== "object" || config === null) {
    throw new Error("Configuration must be an object");
  }

  const cfg = config as Record<string, unknown>;

  // Required fields
  if (typeof cfg.name !== "string" || cfg.name.length === 0) {
    throw new Error("Configuration 'name' is required and must be a non-empty string");
  }

  if (typeof cfg.version !== "string" || cfg.version.length === 0) {
    throw new Error("Configuration 'version' is required and must be a non-empty string");
  }

  // Optional directories (use shared schema from @mcp-apps-kit/core)
  if (cfg.directories !== undefined) {
    if (typeof cfg.directories !== "object" || cfg.directories === null) {
      throw new Error("Configuration 'directories' must be an object");
    }

    // Validate using shared VersionDirectoriesSchema (works for both single and multi-version)
    const result = VersionDirectoriesSchema.safeParse(cfg.directories);
    if (!result.success) {
      throw new Error(formatConfigZodError(result.error, "Configuration 'directories'"));
    }
  }

  // Optional config
  if (cfg.config !== undefined) {
    if (typeof cfg.config !== "object" || cfg.config === null) {
      throw new Error("Configuration 'config' must be an object");
    }

    const globalConfig = cfg.config as Record<string, unknown>;

    // Use shared validation logic
    validateGlobalConfigFields(globalConfig, "Configuration 'config'");
  }

  // Optional plugins (validated with shared schema)
  if (cfg.plugins !== undefined) {
    validatePluginsConfig(cfg.plugins, "Configuration");
  }

  // Optional icon
  if (cfg.icon !== undefined && typeof cfg.icon !== "string") {
    throw new Error("Configuration 'icon' must be a string");
  }

  // Optional icons
  if (cfg.icons !== undefined) {
    if (!Array.isArray(cfg.icons)) {
      throw new Error("Configuration 'icons' must be an array");
    }
    for (const icon of cfg.icons as unknown[]) {
      if (typeof icon !== "object" || icon === null) {
        throw new Error("Each icon must be an object");
      }
      const iconObj = icon as Record<string, unknown>;
      if (typeof iconObj.src !== "string") {
        throw new Error("Each icon must have a 'src' string property");
      }
    }
  }
}

/**
 * Validate a configuration object (either single-version or multi-version)
 *
 * Detects the config type and applies the appropriate validation.
 *
 * @param config - Configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateConfigInput(config: unknown): asserts config is FileBasedConfigInput {
  if (typeof config !== "object" || config === null) {
    throw new Error("Configuration must be an object");
  }

  const cfg = config as Record<string, unknown>;

  // Check if this is a versioned config (has 'versions' but no 'version')
  if ("versions" in cfg && !("version" in cfg)) {
    validateVersionedConfig(config);
  } else {
    validateConfig(config);
  }
}

/**
 * Load configuration from a file path
 *
 * Supports TypeScript and JavaScript config files.
 * Uses jiti for native TypeScript support - no tsx/ts-node required.
 * Handles both single-version and multi-version configurations.
 *
 * @param configPath - Path to the config file
 * @param projectRoot - Project root directory
 * @param logger - Logger instance
 * @returns Loaded and validated configuration (single-version or multi-version)
 */
export async function loadConfig(
  configPath: string,
  projectRoot: string,
  logger: PluginLogger = defaultLogger
): Promise<FileBasedConfigInput> {
  // Security: Validate config path before loading
  validateConfigPath(configPath, projectRoot);

  const absolutePath = path.resolve(projectRoot, configPath);

  // Check if file exists
  try {
    await fs.access(absolutePath);
  } catch {
    throw new Error(`Config file not found at ${configPath}`);
  }

  logger.info(`Loading config from ${configPath}`);

  try {
    // Use jiti for TypeScript support
    // This allows loading .ts config files without tsx/ts-node
    const jiti = createJiti(projectRoot, {
      // Enable TypeScript interop for ESM default exports
      interopDefault: true,
      // Disable caching for hot reload support
      moduleCache: false,
    });

    const module = await jiti.import(absolutePath);

    // Extract the config - handle both default export and module itself
    // jiti with interopDefault should unwrap, but we handle both cases
    const moduleObj = module as { default?: unknown };
    const config: unknown = moduleObj.default ?? module;

    // Validate the configuration (handles both single and versioned)
    validateConfigInput(config);

    return config;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Configuration")) {
      // Re-throw validation errors as-is
      throw error;
    }

    if (
      error instanceof Error &&
      (error.message.startsWith("Version '") ||
        error.message.startsWith("Versioned ") ||
        error.message.startsWith("Invalid version"))
    ) {
      // Re-throw versioned validation errors as-is
      throw error;
    }

    throw new Error(
      `Failed to load config from ${configPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get default configuration
 *
 * @returns Default file-based configuration
 */
export function getDefaultConfig(): FileBasedConfig {
  return {
    name: "my-app",
    version: "1.0.0",
    directories: {
      tools: "tools",
      workflows: "workflows",
      ui: "ui",
    },
  };
}

// =============================================================================
// PACKAGE.JSON FALLBACK
// =============================================================================

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load default configuration from package.json
 *
 * Provides sensible defaults when mcp.config.ts is not present:
 * - name: from package.json name (strips scope if present)
 * - version: from package.json version
 * - directories: default tools/workflows/ui
 * - config: default protocol and CORS settings
 *
 * @param projectRoot - Project root directory
 * @returns Configuration from package.json or null if not found
 */
async function loadPackageJsonFallback(projectRoot: string): Promise<FileBasedConfig | null> {
  const pkgPath = path.resolve(projectRoot, "package.json");

  try {
    const pkgContent = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(pkgContent) as { name?: string; version?: string };

    // Extract name (strip scope like @org/ if present)
    const rawName = pkg.name ?? path.basename(projectRoot);
    const name = rawName.replace(/^@[^/]+\//, "");

    return {
      name,
      version: pkg.version ?? "0.0.0",
      directories: {
        tools: "tools",
        workflows: "workflows",
      },
      config: {
        protocol: "mcp",
        cors: { origin: true },
      },
    };
  } catch {
    return null;
  }
}

/**
 * Load configuration with fallback to package.json defaults
 *
 * Tries to load mcp.config.ts first. If not found, falls back to
 * inferring configuration from package.json.
 *
 * @param configPath - Path to the config file (e.g., "./mcp.config.ts")
 * @param projectRoot - Project root directory
 * @param logger - Logger instance
 * @returns Loaded configuration (from config file or package.json fallback)
 *
 * @example
 * ```typescript
 * // With mcp.config.ts present:
 * const config = await loadConfigWithFallback("./mcp.config.ts", projectRoot, logger);
 * // → Loads from mcp.config.ts
 *
 * // Without mcp.config.ts:
 * const config = await loadConfigWithFallback("./mcp.config.ts", projectRoot, logger);
 * // → Infers from package.json with defaults
 * ```
 */
export async function loadConfigWithFallback(
  configPath: string,
  projectRoot: string,
  logger: PluginLogger = defaultLogger
): Promise<FileBasedConfigInput> {
  const configFile = path.resolve(projectRoot, configPath);

  // Try loading the config file first
  if (await fileExists(configFile)) {
    return await loadConfig(configPath, projectRoot, logger);
  }

  // Fall back to package.json
  logger.info(`No ${configPath} found, using package.json defaults`);

  const fallback = await loadPackageJsonFallback(projectRoot);
  if (!fallback) {
    throw new Error(`No configuration found. Create ${configPath} or ensure package.json exists.`);
  }

  logger.info(`Using inferred config: name="${fallback.name}", version="${fallback.version}"`);
  return fallback;
}
