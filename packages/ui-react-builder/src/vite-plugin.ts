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

import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";
import type { AcceptedPlugin } from "postcss";
import type { DevServerOptions } from "./types";
import * as esbuild from "esbuild";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { generateDevHTML, generateHTML } from "./html";
import { parseReactUIDefinitions } from "./ast-parser";
import { parseWidgetFile } from "./widget-parser";

/**
 * Process CSS through PostCSS if available.
 *
 * This function dynamically imports postcss and loads the project's
 * postcss.config.js to process Tailwind and other PostCSS plugins.
 *
 * @param css - Raw CSS content
 * @param cssPath - Path to the CSS file (for source maps)
 * @param root - Project root directory
 * @param logger - Logger for warnings
 * @returns Processed CSS or original if PostCSS not available
 */
async function processPostCSS(
  css: string,
  cssPath: string,
  root: string,
  logger: PluginLogger
): Promise<string> {
  try {
    // Try to dynamically import postcss
    const postcssModule = await import("postcss").catch(() => null);
    if (!postcssModule) {
      logger.warn(
        "[mcp-react-ui] postcss not found. CSS will not be processed through Tailwind. " +
          "Install postcss to enable CSS processing."
      );
      return css;
    }

    const postcss = postcssModule.default;

    // Try to load postcss config from various locations
    const configPaths = [
      path.join(path.dirname(cssPath), "postcss.config.js"),
      path.join(path.dirname(cssPath), "postcss.config.cjs"),
      path.join(path.dirname(cssPath), "postcss.config.mjs"),
      path.join(root, "postcss.config.js"),
      path.join(root, "postcss.config.cjs"),
      path.join(root, "postcss.config.mjs"),
    ];

    let plugins: AcceptedPlugin[] = [];

    for (const configPath of configPaths) {
      try {
        await fs.access(configPath);
        // Config exists, try to load it
        const configModule = (await import(/* @vite-ignore */ `file://${configPath}`)) as {
          default?: unknown;
          [key: string]: unknown;
        };
        const config = (configModule.default ?? configModule) as {
          plugins?: AcceptedPlugin[] | Record<string, unknown>;
        };

        if (config.plugins) {
          // Handle different plugin formats
          if (Array.isArray(config.plugins)) {
            plugins = config.plugins;
          } else if (typeof config.plugins === "object") {
            // Object format: { '@tailwindcss/postcss': {} }
            for (const [pluginName, pluginOptions] of Object.entries(config.plugins)) {
              try {
                const pluginModule = (await import(/* @vite-ignore */ pluginName)) as {
                  default?: unknown;
                  [key: string]: unknown;
                };
                const rawPlugin = pluginModule.default ?? pluginModule;
                const plugin = rawPlugin as AcceptedPlugin | ((options: unknown) => AcceptedPlugin);
                const loadedPlugin: AcceptedPlugin =
                  typeof plugin === "function"
                    ? // @ts-expect-error - PostCSS plugin APIs vary; some take 1 arg, some take 2
                      (plugin(pluginOptions) as AcceptedPlugin)
                    : (plugin as AcceptedPlugin);
                plugins.push(loadedPlugin);
              } catch (pluginError) {
                logger.warn(
                  `[mcp-react-ui] Could not load PostCSS plugin "${pluginName}": ${
                    pluginError instanceof Error ? pluginError.message : String(pluginError)
                  }`
                );
              }
            }
          }
        }
        break;
      } catch {
        // Config not found at this path, try next
        continue;
      }
    }

    if (plugins.length === 0) {
      // No plugins found, try to load @tailwindcss/postcss directly
      try {
        const tailwindModule = await import("@tailwindcss/postcss").catch(() => null);
        if (tailwindModule) {
          const tailwind = tailwindModule.default || tailwindModule;
          plugins = [(typeof tailwind === "function" ? tailwind({}) : tailwind) as AcceptedPlugin];
        }
      } catch {
        // Tailwind postcss plugin not available
      }
    }

    if (plugins.length === 0) {
      logger.warn(
        "[mcp-react-ui] No PostCSS plugins configured. CSS will not be processed through Tailwind."
      );
      return css;
    }

    // Process CSS through PostCSS
    const result = await postcss(plugins).process(css, {
      from: cssPath,
      to: cssPath,
    });

    return result.css;
  } catch (error) {
    logger.warn(
      `[mcp-react-ui] PostCSS processing failed: ${
        error instanceof Error ? error.message : String(error)
      }. Using raw CSS.`
    );
    return css;
  }
}

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
 * Server configuration injected into UIs at build time.
 *
 * These values are available in the UI via `getMcpServerConfig()` from @mcp-apps-kit/ui.
 */
export type McpServerConfig = {
  /**
   * Base URL of the MCP server.
   *
   * Used by UIs to make API calls (e.g., debug logging via HTTP).
   * Should include protocol and port (e.g., "http://localhost:3000").
   *
   * @example "http://localhost:3000"
   * @example "https://api.myapp.com"
   */
  baseUrl?: string;

  /**
   * Additional custom configuration.
   *
   * Any extra values your UI needs at runtime.
   */
  [key: string]: unknown;
};

/**
 * Options for the MCP React UI Vite plugin.
 *
 * Use either `serverEntry` (for defineReactUI-based discovery) or
 * `widgetsDir` (for file-based discovery), but not both.
 */
export interface McpReactUIOptions {
  /**
   * Server entry point file to scan for defineReactUI calls.
   * The plugin will parse this file and find all defineReactUI usages,
   * then resolve the component imports to their source files.
   *
   * Mutually exclusive with `widgetsDir`.
   *
   * @example "./src/index.ts"
   */
  serverEntry?: string;

  /**
   * Directory containing widget files for file-based discovery.
   *
   * The plugin will scan this directory for `.tsx` files that export:
   * - `default`: A React component
   * - `ui`: A WidgetMetadata object
   *
   * The HTML output path is inferred from the file name.
   * For example, `my-widget.tsx` outputs to `{outDir}/my-widget.html`.
   *
   * Mutually exclusive with `serverEntry`.
   *
   * @example "./ui/widgets"
   */
  widgetsDir?: string;

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

  /**
   * Server configuration to inject into UIs at build time.
   *
   * These values become available in the UI via `getMcpServerConfig()` from @mcp-apps-kit/ui.
   * Useful for injecting the server base URL, API endpoints, or other runtime config.
   *
   * @example
   * ```typescript
   * mcpReactUI({
   *   serverEntry: "./src/index.ts",
   *   serverConfig: {
   *     baseUrl: "http://localhost:3000",
   *   },
   * })
   * ```
   */
  serverConfig?: McpServerConfig;

  /**
   * Development server options for HMR (Hot Module Replacement) support.
   *
   * When Vite runs in serve mode (`vite dev`), the plugin generates dev HTML
   * files that load widgets through Vite's dev server with React Fast Refresh.
   *
   * - `true` or `{}`: Enable dev server features with defaults.
   * - `false`: Explicitly disable dev server features even in serve mode
   *   (widgets will be bundled with esbuild as in production).
   * - `DevServerOptions`: Enable with custom configuration.
   *
   * When not specified, dev server features are automatically enabled in serve
   * mode.
   *
   * @example
   * ```typescript
   * // Enable with defaults
   * mcpReactUI({ serverEntry: "./src/index.ts", dev: true })
   *
   * // Disable in dev mode (always use esbuild)
   * mcpReactUI({ serverEntry: "./src/index.ts", dev: false })
   *
   * // Custom config
   * mcpReactUI({ serverEntry: "./src/index.ts", dev: { port: 3001 } })
   * ```
   */
  dev?: DevServerOptions | boolean;
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
  /** Whether auto-resize is enabled (undefined means default/true) */
  autoResize?: boolean;
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
      autoResize: ui.autoResize,
    });
  }

  return discovered;
}

/**
 * Discover widget files from a directory.
 *
 * Scans the directory for .tsx files that export:
 * - default: A React component
 * - ui: A WidgetMetadata object
 */
async function discoverWidgetFiles(
  widgetsDir: string,
  root: string,
  logger: PluginLogger
): Promise<DiscoveredUI[]> {
  const widgetsDirPath = path.resolve(root, widgetsDir);
  const discovered: DiscoveredUI[] = [];

  let files: string[];
  try {
    files = await fs.readdir(widgetsDirPath);
  } catch (error) {
    logger.warn(
      `[mcp-react-ui] Could not read widgets directory: ${widgetsDirPath} - ${
        error instanceof Error ? error.message : error
      }`
    );
    return discovered;
  }

  // Resolve root real path once for boundary checks
  const rootRealPath = await fs.realpath(root);

  // Filter to .tsx files only
  const tsxFiles = files.filter((f) => f.endsWith(".tsx"));

  for (const file of tsxFiles) {
    const filePath = path.join(widgetsDirPath, file);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = parseWidgetFile(content);

      if (!parsed.hasDefaultExport || !parsed.hasUIExport) {
        // Not a valid widget file, skip silently
        continue;
      }

      // Generate key from filename (kebab-case)
      const baseName = path.basename(file, ".tsx");
      const key = baseName;

      // Use parsed metadata or fallback to filename-based name
      const name =
        parsed.uiMetadata.name ??
        baseName.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

      // Resolve real path for symlink safety
      const componentPath = await fs.realpath(filePath);

      // Verify the resolved path stays within the project root
      if (!isPathWithinRoot(rootRealPath, componentPath)) {
        logger.warn(
          `[mcp-react-ui] Refusing to build widget outside project root. ` +
            `widget="${file}", resolved="${componentPath}"`
        );
        continue;
      }

      discovered.push({
        componentName: baseName,
        componentPath,
        name,
        key,
        autoResize: parsed.uiMetadata.autoResize,
      });

      logger.info(`[mcp-react-ui] Discovered widget: ${file}`);
    } catch (error) {
      logger.warn(
        `[mcp-react-ui] Could not parse widget file: ${file} - ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  }

  return discovered;
}

/**
 * Discover widgets using the configured discovery mode.
 *
 * Consolidates the serverEntry/widgetsDir discovery branching so that both
 * `configureServer` and `buildStart` can call the same function.
 *
 * @internal
 */
async function discoverWidgets(
  options: McpReactUIOptions,
  root: string,
  logger: PluginLogger
): Promise<DiscoveredUI[]> {
  let discovered: DiscoveredUI[];

  if (options.widgetsDir) {
    discovered = await discoverWidgetFiles(options.widgetsDir, root, logger);

    if (discovered.length === 0) {
      logger.info("[mcp-react-ui] No widget files found in " + options.widgetsDir);
      return [];
    }

    logger.info(
      `[mcp-react-ui] Found ${discovered.length} widget(s): ${discovered.map((d) => d.key).join(", ")}`
    );
  } else if (options.serverEntry) {
    discovered = await discoverReactUIs(options.serverEntry, root, logger);

    if (discovered.length === 0) {
      logger.info("[mcp-react-ui] No defineReactUI calls found");
      return [];
    }

    logger.info(
      `[mcp-react-ui] Found ${discovered.length} React UI(s): ${discovered.map((d) => d.componentName).join(", ")}`
    );
  } else {
    return [];
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
  const serverConfig = options.serverConfig ?? {};

  // Load and process global CSS if specified
  let globalCss: string | undefined;
  if (options.globalCss) {
    const globalCssPath = path.resolve(root, options.globalCss);
    try {
      const rawCss = await fs.readFile(globalCssPath, "utf-8");
      // Process CSS through PostCSS (for Tailwind, etc.)
      globalCss = await processPostCSS(rawCss, globalCssPath, root, logger);
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

    // Generate AppsProvider props based on autoResize setting
    const providerProps = ui.autoResize === undefined ? "" : ` autoResize={${ui.autoResize}}`;

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
      <AppsProvider${providerProps}>
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
        __MCP_SERVER_CONFIG__: JSON.stringify(serverConfig),
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
 * Supports two discovery modes:
 *
 * 1. **serverEntry mode**: Scans a server entry file for `defineReactUI` calls
 *    and resolves component imports.
 *
 * 2. **widgetsDir mode**: Scans a directory for widget files that export
 *    a default React component and a `ui` metadata object. The HTML path
 *    is automatically inferred from the file name.
 *
 * @param options - Plugin configuration
 * @returns Vite plugin
 *
 * @example serverEntry mode
 * ```typescript
 * mcpReactUI({
 *   serverEntry: "./src/index.ts",
 *   outDir: "./src/ui/dist",
 * })
 * ```
 *
 * @example widgetsDir mode (file-based discovery)
 * ```typescript
 * mcpReactUI({
 *   widgetsDir: "./ui/widgets",
 *   outDir: "./ui/dist",
 *   globalCss: "./ui/styles.css",
 *   standalone: true,
 * })
 * ```
 */
/**
 * Virtual module prefix for dev-mode widget entry points.
 *
 * Each widget gets a virtual module at `virtual:mcp-react-ui/<key>` that
 * the dev HTML imports.  The plugin resolves these to a synthetic entry
 * point that mounts the actual React component.
 *
 * @internal
 */
const VIRTUAL_MODULE_PREFIX = "virtual:mcp-react-ui/";

/**
 * Resolved virtual module prefix used internally by Vite.
 *
 * Vite convention: resolved virtual modules are prefixed with `\0` so they
 * are never matched by file-system resolve or other plugins.
 *
 * @internal
 */
const RESOLVED_VIRTUAL_PREFIX = "\0" + VIRTUAL_MODULE_PREFIX;

/**
 * Determine whether dev server features should be active.
 *
 * Rules:
 * - `dev: false` → always off
 * - `dev: true | DevServerOptions | undefined` + `command === 'serve'` → on
 * - `command === 'build'` → always off
 *
 * @internal
 */
function isDevModeActive(devOption: McpReactUIOptions["dev"], command: "build" | "serve"): boolean {
  if (devOption === false) return false;
  return command === "serve";
}

/**
 * Resolve the `dev` option into a concrete {@link DevServerOptions} object.
 *
 * - `true` / `undefined` → empty object (all defaults)
 * - `false` → `null` (dev mode disabled — caller should not use the result)
 * - `DevServerOptions` → returned as-is
 *
 * @internal
 */
function resolveDevOptions(devOption: McpReactUIOptions["dev"]): DevServerOptions | null {
  if (devOption === false) return null;
  if (devOption === true || devOption === undefined) return {};
  return devOption;
}

/**
 * Check whether `@vitejs/plugin-react` (or a compatible React plugin) is
 * present in the resolved Vite config.
 *
 * @internal
 */
function hasReactPlugin(config: ResolvedConfig): boolean {
  return config.plugins.some(
    (p) =>
      p.name === "vite:react-babel" || // @vitejs/plugin-react
      p.name === "vite:react-swc" || // @vitejs/plugin-react-swc
      p.name === "vite:react-refresh" // older versions
  );
}

export function mcpReactUI(options: McpReactUIOptions): Plugin {
  let config: ResolvedConfig;

  const standalone = options.standalone ?? false;

  // Validate options: must have either serverEntry or widgetsDir, but not both
  if (options.serverEntry && options.widgetsDir) {
    throw new Error(
      "[mcp-react-ui] Cannot use both 'serverEntry' and 'widgetsDir'. Choose one discovery mode."
    );
  }
  if (!options.serverEntry && !options.widgetsDir) {
    throw new Error(
      "[mcp-react-ui] Must specify either 'serverEntry' or 'widgetsDir' for widget discovery."
    );
  }

  // Resolve logger: false = silent, undefined = default, custom = use provided
  const logger: PluginLogger =
    options.logger === false ? silentLogger : (options.logger ?? defaultLogger);

  // Map of widget key → DiscoveredUI, populated by configureServer or buildStart
  // in dev mode.  Used by resolveId/load to serve virtual modules.
  const virtualModules = new Map<string, DiscoveredUI>();

  return {
    name: "mcp-react-ui",

    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },

    /**
     * configureServer — runs only in `vite dev` (serve mode).
     *
     * 1. Warn if @vitejs/plugin-react is missing.
     * 2. Discover widgets (serverEntry or widgetsDir).
     * 3. Populate `virtualModules` map so resolveId/load can serve them.
     * 4. Write dev HTML files to outDir via generateDevHTML.
     */
    async configureServer(_server: ViteDevServer) {
      if (!isDevModeActive(options.dev, config.command)) return;

      // Warn if React plugin is missing — Fast Refresh won't work without it
      if (!hasReactPlugin(config)) {
        logger.warn(
          "[mcp-react-ui] @vitejs/plugin-react (or plugin-react-swc) was not detected. " +
            "React Fast Refresh will not work in dev mode. " +
            "Add @vitejs/plugin-react to your Vite config for HMR support."
        );
      }

      const root = config.root;
      const devOpts = resolveDevOptions(options.dev);

      // Discover widgets
      const discovered = await discoverWidgets(options, root, logger);
      if (discovered.length === 0) return;

      // Register virtual modules
      for (const ui of discovered) {
        virtualModules.set(ui.key, ui);
      }

      // Write dev HTML files
      const outDir = options.outDir ?? "./dist/ui";
      for (const ui of discovered) {
        const html = generateDevHTML({
          key: ui.key,
          name: ui.name,
          devServerUrl: devOpts?.baseUrl,
        });

        const outputPath = path.resolve(root, outDir, `${ui.key}.html`);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, html, "utf-8");

        logger.info(`[mcp-react-ui] Dev HTML: ${ui.key}.html`);
      }
    },

    // Run build at the start of the build process
    async buildStart() {
      const root = config.root;
      const isProduction = config.mode === "production";

      // In serve mode with dev features enabled, write dev HTML instead of
      // esbuild-bundled production HTML.  Virtual modules are already
      // registered by configureServer.
      if (isDevModeActive(options.dev, config.command)) {
        // configureServer already wrote the dev HTML files and registered
        // virtual modules.  If it hasn't run (e.g. edge case), discover now.
        if (virtualModules.size === 0) {
          const devOpts = resolveDevOptions(options.dev);
          const discovered = await discoverWidgets(options, root, logger);
          const outDir = options.outDir ?? "./dist/ui";
          for (const ui of discovered) {
            virtualModules.set(ui.key, ui);
            const html = generateDevHTML({
              key: ui.key,
              name: ui.name,
              devServerUrl: devOpts?.baseUrl,
            });
            const outputPath = path.resolve(root, outDir, `${ui.key}.html`);
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            await fs.writeFile(outputPath, html, "utf-8");
            logger.info(`[mcp-react-ui] Dev HTML: ${ui.key}.html`);
          }
        }
        return;
      }

      // Production path: discover and build with esbuild (unchanged)
      const discovered = await discoverWidgets(options, root, logger);
      if (discovered.length === 0) return;

      await buildDiscoveredUIs(discovered, options, root, isProduction, logger);
    },

    // Resolve virtual modules: both standalone entry and per-widget dev modules
    resolveId(id) {
      if (standalone && id === "virtual:mcp-react-ui-entry") {
        return id;
      }
      if (id.startsWith(VIRTUAL_MODULE_PREFIX)) {
        const key = id.slice(VIRTUAL_MODULE_PREFIX.length);
        if (virtualModules.has(key)) {
          return RESOLVED_VIRTUAL_PREFIX + key;
        }
      }
      return null;
    },

    load(id) {
      if (standalone && id === "virtual:mcp-react-ui-entry") {
        return "export default {}";
      }
      if (id.startsWith(RESOLVED_VIRTUAL_PREFIX)) {
        const key = id.slice(RESOLVED_VIRTUAL_PREFIX.length);
        const ui = virtualModules.get(key);
        if (!ui) return null;

        const importPath = toEsbuildImportSpecifier(ui.componentPath);

        // Generate AppsProvider props based on autoResize setting
        const providerProps = ui.autoResize === undefined ? "" : ` autoResize={${ui.autoResize}}`;

        // Return entry-point code that mounts the widget component.
        // This code runs in the browser via Vite's dev server transform
        // pipeline, so React Fast Refresh applies automatically.
        return `
import React from "react";
import { createRoot } from "react-dom/client";
import { AppsProvider } from "@mcp-apps-kit/ui-react";
import Component from "${importPath}";

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <AppsProvider${providerProps}>
        <Component />
      </AppsProvider>
    </React.StrictMode>
  );
}
`;
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

export type { DevServerOptions };

export default mcpReactUI;
