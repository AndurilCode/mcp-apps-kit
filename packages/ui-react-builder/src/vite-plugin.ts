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
 * Scan source file for defineReactUI calls and extract component information.
 */
async function discoverReactUIs(serverEntry: string, root: string): Promise<DiscoveredUI[]> {
  const entryPath = path.resolve(root, serverEntry);
  const content = await fs.readFile(entryPath, "utf-8");
  const discovered: DiscoveredUI[] = [];

  // Find all imports to build a map of component names to file paths
  const importMap = new Map<string, string>();

  // Match: import { Foo } from "./path" or import { Foo as Bar } from "./path"
  const namedImportRegex = /import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
  let match;

  while ((match = namedImportRegex.exec(content)) !== null) {
    const imports = match[1];
    const importPath = match[2];
    if (!imports || !importPath) continue;

    // Parse individual imports
    const importParts = imports.split(",").map((s) => s.trim());
    for (const part of importParts) {
      // Handle "Foo as Bar" syntax
      const asMatch = part.match(/(\w+)\s+as\s+(\w+)/);
      if (asMatch?.[2]) {
        const localName = asMatch[2];
        importMap.set(localName, importPath);
      } else {
        const name = part.trim();
        if (name) {
          importMap.set(name, importPath);
        }
      }
    }
  }

  // Match default imports: import Foo from "./path"
  const defaultImportRegex = /import\s+(\w+)\s+from\s*["']([^"']+)["']/g;
  while ((match = defaultImportRegex.exec(content)) !== null) {
    const name = match[1];
    const importPath = match[2];
    if (!name || !importPath) continue;
    if (!importMap.has(name)) {
      importMap.set(name, importPath);
    }
  }

  // Find defineReactUI calls
  // Match: defineReactUI({ component: ComponentName, name: "...", ... })
  const defineReactUIRegex =
    /defineReactUI\s*\(\s*\{[^}]*component\s*:\s*(\w+)[^}]*name\s*:\s*["']([^"']+)["'][^}]*\}/g;

  while ((match = defineReactUIRegex.exec(content)) !== null) {
    const componentName = match[1];
    const uiName = match[2];
    if (!componentName || !uiName) continue;

    const importPath = importMap.get(componentName);
    if (importPath) {
      // Resolve the import path relative to the entry file
      const entryDir = path.dirname(entryPath);
      let componentPath: string;

      if (importPath.startsWith(".")) {
        // Relative import
        componentPath = path.resolve(entryDir, importPath);
        // Add extension if not present
        if (!path.extname(componentPath)) {
          // Try common extensions
          for (const ext of [".tsx", ".ts", ".jsx", ".js"]) {
            try {
              await fs.access(componentPath + ext);
              componentPath = componentPath + ext;
              break;
            } catch {
              // Try next extension
            }
          }
        }
      } else {
        // Package import - skip for now
        continue;
      }

      // Generate key from component name (kebab-case)
      const key = componentName.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();

      discovered.push({
        componentName,
        componentPath,
        name: uiName,
        key,
      });
    }
  }

  // Also try alternate pattern where name comes before component
  const altRegex =
    /defineReactUI\s*\(\s*\{[^}]*name\s*:\s*["']([^"']+)["'][^}]*component\s*:\s*(\w+)[^}]*\}/g;

  while ((match = altRegex.exec(content)) !== null) {
    const uiName = match[1];
    const componentName = match[2];
    if (!uiName || !componentName) continue;

    // Check if we already found this
    if (discovered.some((d) => d.componentName === componentName)) {
      continue;
    }

    const importPath = importMap.get(componentName);
    if (importPath) {
      const entryDir = path.dirname(entryPath);
      let componentPath: string;

      if (importPath.startsWith(".")) {
        componentPath = path.resolve(entryDir, importPath);
        if (!path.extname(componentPath)) {
          for (const ext of [".tsx", ".ts", ".jsx", ".js"]) {
            try {
              await fs.access(componentPath + ext);
              componentPath = componentPath + ext;
              break;
            } catch {
              // Try next extension
            }
          }
        }
      } else {
        continue;
      }

      const key = componentName.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();

      discovered.push({
        componentName,
        componentPath,
        name: uiName,
        key,
      });
    }
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
  isProduction: boolean
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
      console.warn(
        `[mcp-react-ui] globalCss file not found or unreadable: ${globalCssPath}`,
        error instanceof Error ? error.message : error
      );
    }
  }

  // Build each discovered UI
  for (const ui of discovered) {
    // Normalize path for ESM imports (Windows backslashes -> forward slashes)
    const normalizedComponentPath = ui.componentPath.replace(/\\/g, "/");
    // Ensure path is a proper relative or absolute import
    const importPath =
      normalizedComponentPath.startsWith(".") || normalizedComponentPath.startsWith("/")
        ? normalizedComponentPath
        : `./${normalizedComponentPath}`;

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

    // eslint-disable-next-line no-console
    console.log(`[mcp-react-ui] Built: ${ui.key}.html`);
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
      const discovered = await discoverReactUIs(options.serverEntry, root);

      if (discovered.length === 0) {
        // eslint-disable-next-line no-console
        console.log("[mcp-react-ui] No defineReactUI calls found");
        return;
      }

      // eslint-disable-next-line no-console
      console.log(
        `[mcp-react-ui] Found ${discovered.length} React UI(s): ${discovered.map((d) => d.componentName).join(", ")}`
      );

      // Build discovered UIs
      await buildDiscoveredUIs(discovered, options, root, isProduction);
    },

    // Provide a virtual empty module so Vite doesn't complain about missing entry
    resolveId(id) {
      if (id === "virtual:mcp-react-ui-entry") {
        return id;
      }
      return null;
    },

    load(id) {
      if (id === "virtual:mcp-react-ui-entry") {
        return "export default {}";
      }
      return null;
    },

    // Override the config to use our virtual entry
    config() {
      return {
        build: {
          rollupOptions: {
            input: "virtual:mcp-react-ui-entry",
          },
        },
      };
    },

    // Prevent Vite from generating output files (we already wrote our HTML)
    generateBundle(_, bundle) {
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
