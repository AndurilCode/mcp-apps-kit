/**
 * Configuration file loader
 *
 * Loads and validates mcp.config.ts files for file-based app development.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { FileBasedConfig, PluginLogger } from "./types";

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
 * Helper function to define a file-based app configuration with TypeScript autocomplete
 *
 * This is a simple identity function that provides type safety and IDE autocomplete
 * when creating configuration files.
 *
 * @param config - The configuration object
 * @returns The same configuration object (for type inference)
 *
 * @example
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
 */
export function defineConfig(config: FileBasedConfig): FileBasedConfig {
  return config;
}

/**
 * Validate a configuration object
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

  // Optional directories
  if (cfg.directories !== undefined) {
    if (typeof cfg.directories !== "object" || cfg.directories === null) {
      throw new Error("Configuration 'directories' must be an object");
    }

    const dirs = cfg.directories as Record<string, unknown>;
    if (dirs.tools !== undefined && typeof dirs.tools !== "string") {
      throw new Error("Configuration 'directories.tools' must be a string");
    }
    if (dirs.workflows !== undefined && typeof dirs.workflows !== "string") {
      throw new Error("Configuration 'directories.workflows' must be a string");
    }
    if (dirs.ui !== undefined && typeof dirs.ui !== "string") {
      throw new Error("Configuration 'directories.ui' must be a string");
    }
  }

  // Optional config
  if (cfg.config !== undefined) {
    if (typeof cfg.config !== "object" || cfg.config === null) {
      throw new Error("Configuration 'config' must be an object");
    }

    const globalConfig = cfg.config as Record<string, unknown>;

    // Validate protocol
    if (globalConfig.protocol !== undefined) {
      if (globalConfig.protocol !== "mcp" && globalConfig.protocol !== "openai") {
        throw new Error("Configuration 'config.protocol' must be 'mcp' or 'openai'");
      }
    }

    // Validate cors
    if (globalConfig.cors !== undefined && globalConfig.cors !== null) {
      if (typeof globalConfig.cors !== "object") {
        throw new Error("Configuration 'config.cors' must be an object");
      }
    }

    // Validate debug
    if (globalConfig.debug !== undefined && globalConfig.debug !== null) {
      if (typeof globalConfig.debug !== "object") {
        throw new Error("Configuration 'config.debug' must be an object");
      }

      const debug = globalConfig.debug as Record<string, unknown>;
      if (debug.level !== undefined) {
        const validLevels = ["debug", "info", "warn", "error"];
        if (!validLevels.includes(debug.level as string)) {
          throw new Error(
            `Configuration 'config.debug.level' must be one of: ${validLevels.join(", ")}`
          );
        }
      }

      if (debug.transport !== undefined) {
        const validTransports = ["builtin", "tool", "api"];
        if (!validTransports.includes(debug.transport as string)) {
          throw new Error(
            `Configuration 'config.debug.transport' must be one of: ${validTransports.join(", ")}`
          );
        }
      }
    }

    // Validate serverRoute
    if (globalConfig.serverRoute !== undefined) {
      if (typeof globalConfig.serverRoute !== "string") {
        throw new Error("Configuration 'config.serverRoute' must be a string");
      }
      if (!globalConfig.serverRoute.startsWith("/")) {
        throw new Error("Configuration 'config.serverRoute' must start with '/'");
      }
    }
  }

  // Optional plugins
  if (cfg.plugins !== undefined) {
    if (!Array.isArray(cfg.plugins)) {
      throw new Error("Configuration 'plugins' must be an array");
    }
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
 * Load configuration from a file path
 *
 * Supports TypeScript and JavaScript config files.
 * Uses dynamic import to load the config module.
 *
 * @param configPath - Path to the config file
 * @param projectRoot - Project root directory
 * @param logger - Logger instance
 * @returns Loaded and validated configuration
 */
export async function loadConfig(
  configPath: string,
  projectRoot: string,
  logger: PluginLogger = defaultLogger
): Promise<FileBasedConfig> {
  const absolutePath = path.resolve(projectRoot, configPath);

  // Check if file exists
  try {
    await fs.access(absolutePath);
  } catch {
    throw new Error(`Config file not found at ${configPath}`);
  }

  logger.info(`Loading config from ${configPath}`);

  // Dynamic import the config file
  // For TypeScript files, we rely on the runtime (tsx, ts-node, or Vite's transform)
  // to handle the transpilation
  try {
    // Add timestamp to bust cache during development
    const cacheBuster = `?t=${Date.now()}`;
    const importPath = `file://${absolutePath}${cacheBuster}`;
    const module = (await import(importPath)) as { default?: unknown };
    const config: unknown = module.default ?? module;

    // Validate the configuration
    validateConfig(config);

    return config;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Configuration")) {
      // Re-throw validation errors as-is
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
