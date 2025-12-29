/**
 * React UI build system using esbuild
 *
 * Compiles React components into self-contained HTML files that can be
 * served as MCP UI resources.
 */

import * as esbuild from "esbuild";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ReactUIDef, BuildOptions, BuildResult, BuildError } from "./types";
import { generateHTML, generateEntryPoint } from "./html";

/**
 * Build multiple React UIs into self-contained HTML files.
 *
 * This function takes a record of React UI definitions and compiles each one
 * into a complete HTML file that includes React, ReactDOM, @mcp-apps-kit/ui-react,
 * and the user's component code.
 *
 * @param uis - Record of UI keys to React UI definitions
 * @param options - Build configuration options
 * @returns Build result with compiled HTML and metadata
 *
 * @example
 * ```typescript
 * import { buildReactUIs, defineReactUI } from "@mcp-apps-kit/ui-react-builder";
 * import { RestaurantList } from "./widgets/RestaurantList";
 *
 * const result = await buildReactUIs({
 *   "restaurant-list": defineReactUI({
 *     component: RestaurantList,
 *     name: "Restaurant List",
 *   }),
 * }, {
 *   outDir: "./dist/ui",
 *   minify: true,
 * });
 *
 * console.log(`Built ${result.outputs.size} UIs in ${result.duration}ms`);
 * ```
 */
export async function buildReactUIs(
  uis: Record<string, ReactUIDef>,
  options: BuildOptions = {}
): Promise<BuildResult> {
  const startTime = Date.now();
  const outputs = new Map<string, string>();
  const files = new Map<string, string>();
  const warnings: string[] = [];
  const errors: BuildError[] = [];

  const cwd = options.cwd ?? process.cwd();

  // Create output directory if specified
  if (options.outDir) {
    await fs.mkdir(path.resolve(cwd, options.outDir), { recursive: true });
  }

  // Load global CSS if specified
  let globalCss: string | undefined;
  if (options.globalCss) {
    try {
      globalCss = await fs.readFile(path.resolve(cwd, options.globalCss), "utf-8");
    } catch (error) {
      warnings.push(
        `Could not load global CSS from ${options.globalCss}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // Build each UI
  for (const [key, def] of Object.entries(uis)) {
    try {
      const html = await compileComponent(key, def, {
        ...options,
        cwd,
        globalCss,
      });

      outputs.set(key, html);

      // Write to file if outDir specified
      if (options.outDir) {
        const outPath = path.resolve(cwd, options.outDir, `${key}.html`);
        await fs.writeFile(outPath, html, "utf-8");
        files.set(key, outPath);
      }
    } catch (error) {
      const buildError: BuildError = {
        key,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      };
      errors.push(buildError);
    }
  }

  return {
    outputs,
    files,
    duration: Date.now() - startTime,
    warnings,
    errors,
  };
}

/**
 * Compile a single React component to self-contained HTML.
 *
 * @param key - Unique key for this UI
 * @param def - React UI definition
 * @param options - Build options
 * @returns Complete HTML document as a string
 */
async function compileComponent(
  key: string,
  def: ReactUIDef,
  options: BuildOptions & { cwd: string; globalCss?: string }
): Promise<string> {
  // Get component from internal properties
  const component = def.__component;
  const componentName = component.name || "Component";
  const defaultProps = def.__defaultProps;

  // Create the entry point using function serialization
  // Note: The Vite plugin uses file paths for proper import resolution
  // This build function falls back to function serialization (limited - doesn't capture imports)
  const entryPoint = generateEntryPoint(`__COMPONENT_PLACEHOLDER__`, defaultProps);

  // Configure plugins
  const plugins: esbuild.Plugin[] = [
    createComponentPlugin(component, componentName),
    createCSSPlugin(),
  ];

  // Use esbuild to bundle everything
  const result = await esbuild.build({
    stdin: {
      contents: entryPoint,
      loader: "tsx",
      resolveDir: options.cwd,
      sourcefile: `${key}-entry.tsx`,
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: ["es2020", "chrome90", "firefox90", "safari14"],
    minify: options.minify ?? true,
    sourcemap: options.sourcemap ? "inline" : false,
    jsx: "automatic",
    jsxImportSource: "react",
    logLevel: "warning",
    external: options.external,
    plugins,
    define: {
      "process.env.NODE_ENV": options.minify ? '"production"' : '"development"',
    },
  });

  // Get the bundled JavaScript
  const outputFile = result.outputFiles?.[0];
  if (!outputFile) {
    throw new Error(`No output generated for UI: ${key}`);
  }

  const script = outputFile.text;

  // Collect any warnings from esbuild (currently silent, could add a logger later)
  // Warnings are typically about missing exports, unused imports, etc.
  // For now we don't surface these to users
  void result.warnings;

  // Generate the final HTML
  const html = generateHTML({
    key,
    name: def.name ?? key,
    script,
    css: options.globalCss,
  });

  return html;
}

/**
 * Create an esbuild plugin that resolves the component placeholder.
 *
 * This plugin intercepts imports of the placeholder module and replaces
 * it with the actual component code. This is necessary because we receive
 * a function reference, not a file path.
 */
function createComponentPlugin(
  component: { toString: () => string },
  componentName: string
): esbuild.Plugin {
  return {
    name: "mcp-component-resolver",
    setup(build) {
      // Intercept the placeholder import
      build.onResolve({ filter: /__COMPONENT_PLACEHOLDER__/ }, () => {
        return {
          path: "__COMPONENT__",
          namespace: "mcp-component",
        };
      });

      // Provide the component code
      build.onLoad({ filter: /.*/, namespace: "mcp-component" }, () => {
        // Serialize the component to a module
        // For now, we export a placeholder that requires runtime injection
        // In a real implementation, we'd need the component's source path
        const componentSource = component.toString();

        // Detect component type: class, function, or arrow function
        const isClassComponent = /^\s*class\b/.test(componentSource);
        const isFunctionComponent = /^\s*function\b/.test(componentSource);
        const isArrowFunction = !isClassComponent && !isFunctionComponent;

        let contents: string;
        if (isArrowFunction) {
          contents = `
              import React from "react";
              const ${componentName} = ${componentSource};
              export default ${componentName};
            `;
        } else {
          contents = `
              import React from "react";
              ${componentSource}
              export default ${componentName};
            `;
        }

        return {
          contents,
          loader: "tsx",
        };
      });
    },
  };
}

/**
 * Create an esbuild plugin that handles CSS imports.
 *
 * This plugin transforms CSS imports into JavaScript that injects
 * the styles into the document head at runtime.
 */
function createCSSPlugin(): esbuild.Plugin {
  return {
    name: "mcp-css-handler",
    setup(build) {
      // Handle .css imports (excluding .module.css which has its own handler)
      build.onLoad({ filter: /\.css$/ }, async (args) => {
        // Skip .module.css files - they're handled by the CSS modules loader
        if (args.path.endsWith(".module.css")) {
          return null;
        }
        const css = await fs.readFile(args.path, "utf-8");

        // Create JavaScript that injects the CSS
        const contents = `
          const style = document.createElement("style");
          style.textContent = ${JSON.stringify(css)};
          document.head.appendChild(style);
        `;

        return {
          contents,
          loader: "js",
        };
      });

      // Handle CSS modules (.module.css)
      build.onLoad({ filter: /\.module\.css$/ }, async (args) => {
        const css = await fs.readFile(args.path, "utf-8");

        // Generate a simple class name mapping
        // In a real implementation, we'd use a proper CSS modules processor
        const classNames = extractClassNames(css);
        const mapping = Object.fromEntries(
          classNames.map((name) => [name, `${name}_${hashString(args.path)}`])
        );

        // Transform the CSS with new class names
        let transformedCss = css;
        for (const [original, hashed] of Object.entries(mapping)) {
          transformedCss = transformedCss.replace(
            new RegExp(`\\.${original}\\b`, "g"),
            `.${hashed}`
          );
        }

        const contents = `
          const style = document.createElement("style");
          style.textContent = ${JSON.stringify(transformedCss)};
          document.head.appendChild(style);
          export default ${JSON.stringify(mapping)};
        `;

        return {
          contents,
          loader: "js",
        };
      });
    },
  };
}

/**
 * Extract class names from CSS content.
 */
function extractClassNames(css: string): string[] {
  const classRegex = /\.([a-zA-Z_][a-zA-Z0-9_-]*)/g;
  const classes = new Set<string>();
  let match;
  while ((match = classRegex.exec(css)) !== null) {
    if (match[1]) {
      classes.add(match[1]);
    }
  }
  return Array.from(classes);
}

/**
 * Simple string hash for generating unique class names.
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36).substring(0, 5);
}

/**
 * Build a single React UI.
 *
 * Convenience function for building just one UI.
 *
 * @param key - Unique key for this UI
 * @param def - React UI definition
 * @param options - Build options
 * @returns The compiled HTML string
 *
 * @example
 * ```typescript
 * const html = await buildReactUI("my-widget", defineReactUI({
 *   component: MyWidget,
 *   name: "My Widget",
 * }));
 * ```
 */
export async function buildReactUI(
  key: string,
  def: ReactUIDef,
  options: BuildOptions = {}
): Promise<string> {
  const result = await buildReactUIs({ [key]: def }, options);

  const html = result.outputs.get(key);
  if (!html) {
    const error = result.errors.find((e) => e.key === key);
    throw new Error(error?.message ?? `Failed to build UI: ${key}`);
  }

  return html;
}
