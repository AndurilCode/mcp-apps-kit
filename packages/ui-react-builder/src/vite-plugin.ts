/**
 * Vite plugin for building React UI components
 *
 * This plugin automatically discovers `defineReactUI` calls in your source code,
 * resolves the component imports, and builds them into self-contained HTML files.
 *
 * Usage in vite.config.ts:
 * ```typescript
 * import { defineConfig } from "vite";
 * import { mcpReactUI } from "@mcp-apps-kit/ui-react-builder/vite";
 *
 * export default defineConfig({
 *   plugins: [
 *     mcpReactUI({
 *       // Server entry point to scan for defineReactUI calls
 *       serverEntry: "./src/index.ts",
 *       // Output directory for built HTML files
 *       outDir: "./src/ui/dist",
 *     }),
 *   ],
 * });
 * ```
 *
 * Then in your server code:
 * ```typescript
 * import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
 * import { GreetingWidget } from "./ui/GreetingWidget";
 *
 * const greetTool = defineTool({
 *   ui: defineReactUI({
 *     component: GreetingWidget,
 *     name: "Greeting Widget",
 *   }),
 *   // ...
 * });
 * ```
 */

import type { Plugin, ResolvedConfig } from "vite";
import * as esbuild from "esbuild";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { generateHTML } from "./html";
import { parseReactUIDefinitions } from "./ast-parser";

/**
 * Logger interface for the MCP React UI plugin.
 */
export interface PluginLogger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

/**
 * Default logger that uses console methods with a prefix.
 */
const defaultLogger: PluginLogger = {
  info: (message: string) => {
    console.log(message); // eslint-disable-line no-console
  },
  warn: (message: string) => {
    console.warn(message); // eslint-disable-line no-console
  },
  error: (message: string) => {
    console.error(message); // eslint-disable-line no-console
  },
};

/**
 * Silent logger that does nothing.
 */
const silentLogger: PluginLogger = {
  info: () => {
    // Intentionally empty - silent logger
  },
  warn: () => {
    // Intentionally empty - silent logger
  },
  error: () => {
    // Intentionally empty - silent logger
  },
};

/**
 * Options for the MCP React UI Vite plugin.
 */
export interface McpReactUIOptions {
  /**
   * Server entry point file to scan for defineReactUI calls.
   * The plugin will parse this file and find all defineReactUI usages,
   * then resolve the component imports to their source files.
   *
   * @example "./src/index.ts"
   */
  serverEntry: string;

  /**
   * Output directory for built HTML files.
   * @default "./dist/ui"
   */
  outDir?: string;

  /**
   * Whether to minify the output.
   * Defaults to true in production, false in development.
   */
  minify?: boolean;

  /**
   * Path to global CSS file to include in all UIs.
   */
  globalCss?: string;

  /**
   * Custom logger for plugin output.
   * Set to `false` to disable all logging, or provide a custom logger.
   * @default console
   */
  logger?: PluginLogger | false;

  /**
   * Standalone mode takes over the Vite build.
   *
   * - When `true`, the plugin overrides the build input and removes all Vite outputs,
   *   producing only the generated UI HTML files.
   * - When `false` (default), the plugin is additive: it generates UI HTML files
   *   without modifying the main Vite build inputs/outputs.
   *
   * Use `true` when your Vite config exists solely to build MCP UI HTML.
   */
  standalone?: boolean;
}

/**
 * Information about a discovered React UI definition.
 */
interface DiscoveredUI {
  /** Variable name used for the component */
  componentName: string;
  /** Resolved file path to the component */
  componentPath: string;
  /** UI name from the defineReactUI call */
  name: string;
  /** Generated key for output file */
  key: string;
}

/**
 * Convert a filesystem path to an import specifier suitable for esbuild.
 *
 * esbuild accepts absolute paths as specifiers (e.g. "/abs/file.tsx", "C:/abs/file.tsx").
 * For relative-like paths, we prefix with "./".
 *
 * @internal
 */
export function toEsbuildImportSpecifier(componentPath: string): string {
  // Normalize path for ESM imports (Windows backslashes -> forward slashes)
  const normalized = componentPath.replace(/\\/g, "/");

  // Absolute path forms we must not prefix with "./":
  // - POSIX absolute: /...
  // - Windows drive absolute: C:/...
  // - UNC absolute: //server/share/...
  const isWindowsDriveAbsolute = /^[a-zA-Z]:\//.test(normalized);
  const isUncAbsolute = normalized.startsWith("//");

  if (
    normalized.startsWith(".") ||
    normalized.startsWith("/") ||
    isWindowsDriveAbsolute ||
    isUncAbsolute
  ) {
    return normalized;
  }

  return `./${normalized}`;
}

/**
 * Checks whether `candidatePath` is within `rootPath`.
 *
 * Both inputs may be relative; they will be resolved before comparison.
 *
 * @internal
 */
export function isPathWithinRoot(rootPath: string, candidatePath: string): boolean {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedCandidate = path.resolve(candidatePath);

  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (relative === "") return true;
  if (relative === "..") return false;

  return !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/**
 * Resolve import path to actual file path with extension.
 */
async function resolveComponentPath(
  importPath: string,
  entryDir: string,
  rootDir: string,
  componentName: string,
  logger: PluginLogger
): Promise<string | null> {
  if (!importPath.startsWith(".")) {
    // Package import - skip
    return null;
  }

  const rootRealPath = await fs.realpath(rootDir);
  const basePath = path.resolve(entryDir, importPath);

  const candidatePaths = path.extname(basePath)
    ? [basePath]
    : [".tsx", ".ts", ".jsx", ".js"].map((ext) => basePath + ext);

  for (const candidatePath of candidatePaths) {
    try {
      await fs.access(candidatePath);
    } catch {
      continue;
    }

    // Resolve symlinks before boundary check.
    const candidateRealPath = await fs.realpath(candidatePath);
    if (!isPathWithinRoot(rootRealPath, candidateRealPath)) {
      logger.warn(
        `[mcp-react-ui] Refusing to build UI component outside project root. ` +
          `component="${componentName}", import="${importPath}", resolved="${candidateRealPath}"`
      );
      return null;
    }

    return candidateRealPath;
  }

  logger.warn(
    `[mcp-react-ui] Could not resolve component file for "${componentName}" from import "${importPath}". ` +
      `Tried extensions: .tsx, .ts, .jsx, .js. Skipping this component.`
  );
  return null;
}

/**
 * Scan source file for defineReactUI calls and extract component information.
 * Uses AST parsing for reliable detection of imports and defineReactUI calls.
 */
async function discoverReactUIs(
  serverEntry: string,
  root: string,
  logger: PluginLogger
): Promise<DiscoveredUI[]> {
  const entryPath = path.resolve(root, serverEntry);
  const content = await fs.readFile(entryPath, "utf-8");
  const entryDir = path.dirname(entryPath);

  const parsed = await parseReactUIDefinitions(content);
  const discovered: DiscoveredUI[] = [];

  for (const ui of parsed) {
    const componentPath = await resolveComponentPath(
      ui.importPath,
      entryDir,
      root,
      ui.componentName,
      logger
    );
    if (!componentPath) continue;

    const key = ui.componentName.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
    discovered.push({
      componentName: ui.componentName,
      componentPath,
      name: ui.name,
      key,
    });
  }

  return discovered;
}

/**
 * Build discovered React UI components.
 */
async function buildDiscoveredUIs(
  discovered: DiscoveredUI[],
  options: McpReactUIOptions,
  root: string,
  isProduction: boolean,
  logger: PluginLogger
): Promise<void> {
  const minify = options.minify ?? isProduction;
  const outDir = options.outDir ?? "./dist/ui";

  // Load global CSS if specified
  let globalCss: string | undefined;
  if (options.globalCss) {
    const globalCssPath = path.resolve(root, options.globalCss);
    try {
      globalCss = await fs.readFile(globalCssPath, "utf-8");
    } catch (error) {
      logger.warn(
        `[mcp-react-ui] globalCss file not found or unreadable: ${globalCssPath} - ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  }

  // Build each discovered UI
  for (const ui of discovered) {
    const importPath = toEsbuildImportSpecifier(ui.componentPath);

    // Generate entry point code
    const entryCode = `
import React from "react";
import { createRoot } from "react-dom/client";
import { AppsProvider } from "@mcp-apps-kit/ui-react";
import Component from "${importPath}";

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <AppsProvider>
        <Component />
      </AppsProvider>
    </React.StrictMode>
  );
}
`;

    // Bundle with esbuild
    const result = await esbuild.build({
      stdin: {
        contents: entryCode,
        loader: "tsx",
        resolveDir: root,
        sourcefile: `${ui.key}-entry.tsx`,
      },
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      target: ["es2020", "chrome90", "firefox90", "safari14"],
      minify,
      jsx: "automatic",
      jsxImportSource: "react",
      define: {
        "process.env.NODE_ENV": minify ? '"production"' : '"development"',
      },
    });

    const script = result.outputFiles?.[0]?.text;
    if (!script) {
      throw new Error(`Failed to build UI: ${ui.key}`);
    }

    // Generate HTML
    const html = generateHTML({
      key: ui.key,
      name: ui.name,
      script,
      css: globalCss,
    });

    // Write output file
    const outputPath = path.resolve(root, outDir, `${ui.key}.html`);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, html, "utf-8");

    logger.info(`[mcp-react-ui] Built: ${ui.key}.html`);
  }
}

/**
 * Vite plugin that automatically discovers and builds React UI components.
 *
 * This plugin scans your server entry point for `defineReactUI` calls,
 * resolves the component imports, and builds them into self-contained HTML.
 *
 * @param options - Plugin configuration
 * @returns Vite plugin
 *
 * @example
 * ```typescript
 * // vite.config.ts
 * import { mcpReactUI } from "@mcp-apps-kit/ui-react-builder/vite";
 *
 * export default defineConfig({
 *   plugins: [
 *     mcpReactUI({
 *       serverEntry: "./src/index.ts",
 *       outDir: "./src/ui/dist",
 *     }),
 *   ],
 * });
 * ```
 */
export function mcpReactUI(options: McpReactUIOptions): Plugin {
  let config: ResolvedConfig;

  const standalone = options.standalone ?? false;

  // Resolve logger: false = silent, undefined = default, custom = use provided
  const logger: PluginLogger =
    options.logger === false ? silentLogger : (options.logger ?? defaultLogger);

  return {
    name: "mcp-react-ui",

    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },

    // Run build at the start of the build process
    async buildStart() {
      const root = config.root;
      const isProduction = config.mode === "production";

      // Discover React UIs from server entry
      const discovered = await discoverReactUIs(options.serverEntry, root, logger);

      if (discovered.length === 0) {
        logger.info("[mcp-react-ui] No defineReactUI calls found");
        return;
      }

      logger.info(
        `[mcp-react-ui] Found ${discovered.length} React UI(s): ${discovered.map((d) => d.componentName).join(", ")}`
      );

      // Build discovered UIs
      await buildDiscoveredUIs(discovered, options, root, isProduction, logger);
    },

    // Provide a virtual empty module so Vite doesn't complain about missing entry
    resolveId(id) {
      if (standalone && id === "virtual:mcp-react-ui-entry") {
        return id;
      }
      return null;
    },

    load(id) {
      if (standalone && id === "virtual:mcp-react-ui-entry") {
        return "export default {}";
      }
      return null;
    },

    // Override the config to use our virtual entry
    config() {
      if (!standalone) {
        return undefined;
      }

      return {
        build: {
          rollupOptions: {
            input: "virtual:mcp-react-ui-entry",
          },
        },
      };
    },

    // Standalone mode: prevent Vite from generating output files (we already wrote our HTML)
    generateBundle(_, bundle) {
      if (!standalone) {
        return;
      }

      // Remove all generated chunks since we don't need them
      const keys = Object.keys(bundle);
      for (const key of keys) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete bundle[key];
      }
    },
  };
}

export default mcpReactUI;
