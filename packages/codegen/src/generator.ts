/**
 * Manifest generation logic for file-based tool discovery
 *
 * Scans configured directories (tools/, workflows/, ui/) and generates
 * a typed manifest file that can be imported into the app.
 */

/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { parse as TSESParse } from "@typescript-eslint/typescript-estree";
import type {
  DiscoveredFile,
  ManifestResult,
  DirectoriesConfig,
  PluginLogger,
  VersionedFileBasedConfig,
  FileBasedVersionConfig,
} from "./types";
import {
  shouldSkipFile,
  hasValidExtension,
  pathToIdentifier,
  pathToToolName,
  findNameCollisions,
  getRelativeImportPath,
} from "./naming";
import { defaultLogger } from "./utils/logger";

/**
 * Check if a directory exists
 */
async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Recursively discover files in a directory
 */
async function discoverFilesInDirectory(
  dirPath: string,
  basePath: string,
  resourceType: "tool" | "workflow" | "ui" | "ui-widget" | "middleware" | "handler"
): Promise<DiscoveredFile[]> {
  const files: DiscoveredFile[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);

      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        const subFiles = await discoverFilesInDirectory(fullPath, basePath, resourceType);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        // Check if this is a valid file to process
        if (!hasValidExtension(entry.name)) {
          continue;
        }

        if (shouldSkipFile(entry.name)) {
          continue;
        }

        const identifier = pathToIdentifier(relativePath);

        files.push({
          filePath: fullPath,
          relativePath,
          identifier,
          hasDefaultExport: false, // Will be populated by analyzeFile
          hasUiExport: false, // Will be populated by analyzeFile
          type: resourceType,
        });
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read - that's OK
    const errnoError = error as { code?: string };
    if (errnoError.code !== "ENOENT") {
      throw error;
    }
  }

  return files;
}

/**
 * Lazy-loaded TypeScript parser
 */
let tsParser: typeof TSESParse | null = null;

/**
 * Get the TypeScript parser (lazy loaded)
 */
async function getParser(): Promise<typeof TSESParse> {
  if (tsParser) {
    return tsParser;
  }

  try {
    const estree = await import("@typescript-eslint/typescript-estree");
    tsParser = estree.parse;
    return tsParser;
  } catch {
    throw new Error(
      "Failed to load @typescript-eslint/typescript-estree. " +
        "Make sure it's installed as a dependency."
    );
  }
}

/**
 * Analyze a file to check for exports
 *
 * Uses AST parsing to reliably detect:
 * - Default exports (export default ...)
 * - Named 'ui' exports (export const ui = ...)
 */
async function analyzeFile(
  filePath: string
): Promise<{ hasDefaultExport: boolean; hasUiExport: boolean }> {
  let hasDefaultExport = false;
  let hasUiExport = false;

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const parse = await getParser();

    const ast = parse(content, {
      loc: true,
      range: true,
      jsx: filePath.endsWith(".tsx") || filePath.endsWith(".jsx"),
    });

    for (const node of ast.body) {
      // Check for default exports
      if (
        node.type === "ExportDefaultDeclaration" ||
        (node.type === "ExportNamedDeclaration" &&
          node.specifiers?.some(
            (spec) =>
              spec.type === "ExportSpecifier" &&
              ((spec.exported.type === "Identifier" && spec.exported.name === "default") ||
                (spec.exported.type === "Literal" && spec.exported.value === "default"))
          ))
      ) {
        hasDefaultExport = true;
      }

      // Check for named 'ui' export
      if (node.type === "ExportNamedDeclaration") {
        // Check variable declarations
        if (node.declaration?.type === "VariableDeclaration") {
          for (const decl of node.declaration.declarations) {
            if (decl.id.type === "Identifier" && decl.id.name === "ui") {
              hasUiExport = true;
            }
          }
        }

        // Check specifiers
        if (node.specifiers) {
          for (const spec of node.specifiers) {
            if (spec.type === "ExportSpecifier") {
              const exportedName =
                spec.exported.type === "Identifier"
                  ? spec.exported.name
                  : spec.exported.type === "Literal" && typeof spec.exported.value === "string"
                    ? spec.exported.value
                    : null;
              if (exportedName === "ui") {
                hasUiExport = true;
              }
            }
          }
        }
      }
    }
  } catch {
    // If we can't parse the file, assume no exports
    // The warning will be logged by the caller
  }

  return { hasDefaultExport, hasUiExport };
}

/**
 * Generate the manifest TypeScript code
 */
function generateManifestCode(
  tools: DiscoveredFile[],
  workflows: DiscoveredFile[],
  uis: DiscoveredFile[],
  uiWidgets: DiscoveredFile[],
  middlewareFiles: DiscoveredFile[],
  handlerFiles: DiscoveredFile[],
  toolUiBindings: Map<string, string>,
  outDir: string,
  projectRoot: string,
  uiWidgetsDir: string | undefined,
  uiWidgetsOutDir: string | undefined
): string {
  const lines: string[] = [
    "// AUTO-GENERATED - DO NOT EDIT",
    "// Generated by @mcp-apps-kit/codegen",
    "",
    'import { ensureBuilt } from "@mcp-apps-kit/core";',
    "",
  ];

  // Generate imports for tools
  for (const tool of tools) {
    const importPath = getRelativeImportPath(outDir, tool.filePath, projectRoot);
    lines.push(`import ${tool.identifier} from "${importPath}";`);
  }

  // Generate imports for colocated UIs from tools
  const colocatedUis: Array<{ toolIdentifier: string; uiIdentifier: string; importPath: string }> =
    [];
  for (const tool of tools) {
    if (tool.hasUiExport) {
      const importPath = getRelativeImportPath(outDir, tool.filePath, projectRoot);
      const uiIdentifier = `${tool.identifier}_ui`;
      lines.push(`import { ui as ${uiIdentifier} } from "${importPath}";`);
      colocatedUis.push({
        toolIdentifier: tool.identifier,
        uiIdentifier,
        importPath,
      });
    }
  }

  // Generate imports for workflows
  for (const workflow of workflows) {
    const importPath = getRelativeImportPath(outDir, workflow.filePath, projectRoot);
    lines.push(`import ${workflow.identifier} from "${importPath}";`);
  }

  // Generate imports for standalone UIs
  for (const ui of uis) {
    const importPath = getRelativeImportPath(outDir, ui.filePath, projectRoot);
    lines.push(`import ${ui.identifier} from "${importPath}";`);
  }

  // Generate imports for UI widgets (convention-based binding)
  if (uiWidgets.length > 0) {
    lines.push("");
    lines.push("// UI widget imports (from uiWidgets directory)");
    lines.push("// html paths are auto-inferred from widget filename when not specified");
    for (const widget of uiWidgets) {
      // For widget files, check if they're TSX/JSX (React) files
      // TSX files need to keep their extension for jiti/tsx runtime loading
      const isTsxFile = widget.filePath.endsWith(".tsx") || widget.filePath.endsWith(".jsx");
      const importPath = getRelativeImportPath(outDir, widget.filePath, projectRoot, !isTsxFile);
      const uiIdentifier = `${widget.identifier}_ui`;
      const rawIdentifier = `_${uiIdentifier}_raw`;

      // Import the raw ui object
      if (widget.hasUiExport) {
        lines.push(`import { ui as ${rawIdentifier} } from "${importPath}";`);
      } else {
        lines.push(`import ${rawIdentifier} from "${importPath}";`);
      }

      // Compute the inferred html path for this widget
      // Use uiWidgetsOutDir if specified, otherwise infer from uiWidgets directory (sibling "dist")
      const widgetBaseName = path.basename(widget.filePath).replace(/\.(tsx?|jsx?)$/, "");
      let inferredHtmlPath: string;
      if (uiWidgetsOutDir) {
        inferredHtmlPath = `./${uiWidgetsOutDir}/${widgetBaseName}.html`;
      } else if (uiWidgetsDir) {
        // Default: assume dist is sibling to the widgets source directory
        // e.g., uiWidgets="ui/widgets" → output goes to "ui/dist"
        const parentDir = path.dirname(uiWidgetsDir);
        inferredHtmlPath = `./${parentDir}/dist/${widgetBaseName}.html`;
      } else {
        // Fallback if neither is specified (shouldn't happen in practice)
        inferredHtmlPath = `./dist/${widgetBaseName}.html`;
      }

      // Create the augmented ui object with html fallback
      lines.push(
        `const ${uiIdentifier} = { ...${rawIdentifier}, html: ${rawIdentifier}.html ?? "${inferredHtmlPath}" };`
      );
    }
  }

  // Generate imports for middleware files
  if (middlewareFiles.length > 0) {
    lines.push("");
    lines.push("// Middleware imports (from middleware directory)");
    for (const middleware of middlewareFiles) {
      const importPath = getRelativeImportPath(outDir, middleware.filePath, projectRoot);
      lines.push(`import ${middleware.identifier}_middleware from "${importPath}";`);
    }
  }

  // Generate imports for handler files
  if (handlerFiles.length > 0) {
    lines.push("");
    lines.push("// Handler imports (from handlers directory)");
    for (const handler of handlerFiles) {
      const importPath = getRelativeImportPath(outDir, handler.filePath, projectRoot);
      lines.push(`import ${handler.identifier}_handler from "${importPath}";`);
    }
  }

  // Apply convention-based UI bindings (only if tool doesn't have explicit ui: field)
  // Uses _setUi() which only sets if not already configured
  if (toolUiBindings.size > 0) {
    lines.push("// Apply convention-based UI bindings");
    lines.push("// Uses _setUi() which only sets if not already configured");
    for (const [toolId, widgetId] of toolUiBindings) {
      lines.push(`${toolId}._setUi(${widgetId}_ui);`);
    }
    lines.push("");
  }

  // Generate tools export (includes both tools and workflows since workflows become tools)
  // Uses ensureBuilt() to auto-build tools that omit .build() and infer names from filenames
  const allTools = [...tools, ...workflows];
  if (allTools.length === 0) {
    lines.push("// No tools discovered in tools/ or workflows/ directories");
  } else if (tools.length > 0 && workflows.length > 0) {
    lines.push(`// Tools from tools/ (${tools.length}) and workflows/ (${workflows.length})`);
  }
  lines.push("export const tools = {");
  for (const tool of allTools) {
    const toolName = pathToToolName(tool.relativePath);
    lines.push(`  ${toolName}: ensureBuilt(${tool.identifier}, "${toolName}"),`);
  }
  lines.push("} as const;");
  lines.push("");

  // Generate workflows export (subset of tools, for documentation/type purposes)
  if (workflows.length === 0) {
    lines.push("// No workflows discovered in workflows/ directory");
  } else {
    lines.push("// Workflows are also included in tools above (they become tools at runtime)");
  }
  lines.push("export const workflows = {");
  for (const workflow of workflows) {
    const workflowName = pathToToolName(workflow.relativePath);
    lines.push(`  ${workflowName}: ensureBuilt(${workflow.identifier}, "${workflowName}"),`);
  }
  lines.push("} as const;");
  lines.push("");

  // Generate UI export (standalone + colocated via `export const ui`)
  const totalUis = uis.length + colocatedUis.length;
  if (totalUis === 0) {
    lines.push(
      "// No standalone UIs discovered (UIs attached via `ui:` in defineTool are handled by the framework)"
    );
  }
  lines.push("export const ui = {");
  for (const ui of uis) {
    lines.push(`  ${ui.identifier},`);
  }
  for (const colocated of colocatedUis) {
    lines.push(`  ${colocated.uiIdentifier},`);
  }
  lines.push("} as const;");
  lines.push("");

  // Generate UI widgets export (convention-based bindings)
  if (uiWidgets.length > 0) {
    lines.push("// UI widgets for convention-based binding");
  } else {
    lines.push("// No UI widgets discovered in uiWidgets directory");
  }
  lines.push("export const uiWidgets = {");
  for (const widget of uiWidgets) {
    const uiIdentifier = `${widget.identifier}_ui`;
    lines.push(`  ${uiIdentifier},`);
  }
  lines.push("} as const;");
  lines.push("");

  // Generate middleware export (sorted alphabetically by identifier)
  if (middlewareFiles.length > 0) {
    lines.push("// Middleware from middleware/ directory (sorted alphabetically)");
  } else {
    lines.push("// No middleware discovered in middleware directory");
  }
  lines.push("export const middleware = [");
  // Sort middleware alphabetically by identifier for consistent ordering
  const sortedMiddleware = [...middlewareFiles].sort((a, b) =>
    a.identifier.localeCompare(b.identifier)
  );
  for (const mw of sortedMiddleware) {
    lines.push(`  ${mw.identifier}_middleware,`);
  }
  lines.push("] as const;");
  lines.push("");

  // Generate handlers export
  if (handlerFiles.length > 0) {
    lines.push("// Event handlers from handlers/ directory");
  } else {
    lines.push("// No handlers discovered in handlers directory");
  }
  lines.push("export const handlers = [");
  for (const handler of handlerFiles) {
    lines.push(`  ${handler.identifier}_handler,`);
  }
  lines.push("] as const;");
  lines.push("");

  // Generate type exports
  lines.push("export type AppTools = typeof tools;");
  lines.push("export type AppWorkflows = typeof workflows;");
  lines.push("export type AppUI = typeof ui;");
  lines.push("export type AppUIWidgets = typeof uiWidgets;");
  lines.push("export type AppMiddleware = typeof middleware;");
  lines.push("export type AppHandlers = typeof handlers;");
  lines.push("");

  return lines.join("\n");
}

/**
 * Options for manifest generation
 */
export interface GenerateManifestOptions {
  /** Project root directory */
  projectRoot: string;
  /** Directory configuration */
  directories?: DirectoriesConfig;
  /** Output directory for the manifest */
  outDir: string;
  /** Logger for warnings and info */
  logger?: PluginLogger;
}

/**
 * Generate the app manifest from discovered files
 *
 * @param options - Generation options
 * @returns Manifest generation result
 */
export async function generateManifest(options: GenerateManifestOptions): Promise<ManifestResult> {
  const { projectRoot, directories = {}, outDir, logger = defaultLogger } = options;

  const toolsDir = path.resolve(projectRoot, directories.tools ?? "tools");
  const workflowsDir = path.resolve(projectRoot, directories.workflows ?? "workflows");
  // Only scan for standalone UIs if explicitly configured (UIs attached via `ui:` in defineTool don't need this)
  const uiDir = directories.ui ? path.resolve(projectRoot, directories.ui) : null;
  // UI widgets directory for convention-based binding (opt-in via directories.uiWidgets)
  const uiWidgetsDir = directories.uiWidgets
    ? path.resolve(projectRoot, directories.uiWidgets)
    : null;
  // Middleware directory (opt-in via directories.middleware)
  const middlewareDir = directories.middleware
    ? path.resolve(projectRoot, directories.middleware)
    : null;
  // Handlers directory (opt-in via directories.handlers)
  const handlersDir = directories.handlers ? path.resolve(projectRoot, directories.handlers) : null;

  const warnings: string[] = [];
  const errors: string[] = [];

  // Discover files in each directory
  const toolFiles = (await directoryExists(toolsDir))
    ? await discoverFilesInDirectory(toolsDir, toolsDir, "tool")
    : [];

  const workflowFiles = (await directoryExists(workflowsDir))
    ? await discoverFilesInDirectory(workflowsDir, workflowsDir, "workflow")
    : [];

  const uiFiles =
    uiDir && (await directoryExists(uiDir))
      ? await discoverFilesInDirectory(uiDir, uiDir, "ui")
      : [];

  // Discover UI widget files for convention-based binding
  const uiWidgetFiles =
    uiWidgetsDir && (await directoryExists(uiWidgetsDir))
      ? await discoverFilesInDirectory(uiWidgetsDir, uiWidgetsDir, "ui-widget")
      : [];

  // Discover middleware files
  const middlewareFiles =
    middlewareDir && (await directoryExists(middlewareDir))
      ? await discoverFilesInDirectory(middlewareDir, middlewareDir, "middleware")
      : [];

  // Discover handler files
  const handlerFiles =
    handlersDir && (await directoryExists(handlersDir))
      ? await discoverFilesInDirectory(handlersDir, handlersDir, "handler")
      : [];

  // Check for name collisions within each category
  const toolCollisions = findNameCollisions(toolFiles);
  const workflowCollisions = findNameCollisions(workflowFiles);
  const uiCollisions = findNameCollisions(uiFiles);
  const uiWidgetCollisions = findNameCollisions(uiWidgetFiles);
  const middlewareCollisions = findNameCollisions(middlewareFiles);
  const handlerCollisions = findNameCollisions(handlerFiles);

  // Report collisions as errors
  for (const [identifier, paths] of toolCollisions) {
    errors.push(`Tool name collision: '${identifier}' is defined in both ${paths.join(" and ")}`);
  }
  for (const [identifier, paths] of workflowCollisions) {
    errors.push(
      `Workflow name collision: '${identifier}' is defined in both ${paths.join(" and ")}`
    );
  }
  for (const [identifier, paths] of uiCollisions) {
    errors.push(`UI name collision: '${identifier}' is defined in both ${paths.join(" and ")}`);
  }
  for (const [identifier, paths] of uiWidgetCollisions) {
    errors.push(
      `UI widget name collision: '${identifier}' is defined in both ${paths.join(" and ")}`
    );
  }
  for (const [identifier, paths] of middlewareCollisions) {
    errors.push(
      `Middleware name collision: '${identifier}' is defined in both ${paths.join(" and ")}`
    );
  }
  for (const [identifier, paths] of handlerCollisions) {
    errors.push(
      `Handler name collision: '${identifier}' is defined in both ${paths.join(" and ")}`
    );
  }

  if (errors.length > 0) {
    return {
      code: "",
      files: [...toolFiles, ...workflowFiles, ...uiFiles, ...middlewareFiles, ...handlerFiles],
      warnings,
      errors,
    };
  }

  // Analyze each file for exports
  const validTools: DiscoveredFile[] = [];
  for (const file of toolFiles) {
    const { hasDefaultExport, hasUiExport } = await analyzeFile(file.filePath);
    if (!hasDefaultExport) {
      warnings.push(`Skipping ${file.relativePath}: no default export found`);
      logger.warn(`Skipping tools/${file.relativePath}: no default export found`);
      continue;
    }
    file.hasDefaultExport = true;
    file.hasUiExport = hasUiExport;
    validTools.push(file);
  }

  const validWorkflows: DiscoveredFile[] = [];
  for (const file of workflowFiles) {
    const { hasDefaultExport } = await analyzeFile(file.filePath);
    if (!hasDefaultExport) {
      warnings.push(`Skipping ${file.relativePath}: no default export found`);
      logger.warn(`Skipping workflows/${file.relativePath}: no default export found`);
      continue;
    }
    file.hasDefaultExport = true;
    validWorkflows.push(file);
  }

  const validUis: DiscoveredFile[] = [];
  for (const file of uiFiles) {
    const { hasDefaultExport } = await analyzeFile(file.filePath);
    if (!hasDefaultExport) {
      warnings.push(`Skipping ${file.relativePath}: no default export found`);
      logger.warn(`Skipping ui/${file.relativePath}: no default export found`);
      continue;
    }
    file.hasDefaultExport = true;
    validUis.push(file);
  }

  // Analyze UI widget files
  // Widget files can export UI definition as default OR as named 'ui' export
  // (named export allows colocating React component as default for vite plugin)
  const validUiWidgets: DiscoveredFile[] = [];
  for (const file of uiWidgetFiles) {
    const { hasDefaultExport, hasUiExport } = await analyzeFile(file.filePath);
    if (!hasDefaultExport && !hasUiExport) {
      warnings.push(`Skipping ${file.relativePath}: no default or ui export found`);
      logger.warn(`Skipping uiWidgets/${file.relativePath}: no default or ui export found`);
      continue;
    }
    file.hasDefaultExport = hasDefaultExport;
    file.hasUiExport = hasUiExport;
    validUiWidgets.push(file);
  }

  // Analyze middleware files
  const validMiddleware: DiscoveredFile[] = [];
  for (const file of middlewareFiles) {
    const { hasDefaultExport } = await analyzeFile(file.filePath);
    if (!hasDefaultExport) {
      warnings.push(`Skipping ${file.relativePath}: no default export found`);
      logger.warn(`Skipping middleware/${file.relativePath}: no default export found`);
      continue;
    }
    file.hasDefaultExport = true;
    validMiddleware.push(file);
  }

  // Analyze handler files
  const validHandlers: DiscoveredFile[] = [];
  for (const file of handlerFiles) {
    const { hasDefaultExport } = await analyzeFile(file.filePath);
    if (!hasDefaultExport) {
      warnings.push(`Skipping ${file.relativePath}: no default export found`);
      logger.warn(`Skipping handlers/${file.relativePath}: no default export found`);
      continue;
    }
    file.hasDefaultExport = true;
    validHandlers.push(file);
  }

  // Build identifier → UI widget map for convention-based binding
  const uiWidgetMap = new Map<string, DiscoveredFile>();
  for (const widget of validUiWidgets) {
    uiWidgetMap.set(widget.identifier, widget);
  }

  // Match tools and workflows to UI widgets by identifier (convention-based binding)
  // Workflows become tools at runtime, so they also support UI widget binding
  const toolUiBindings = new Map<string, string>();
  for (const tool of [...validTools, ...validWorkflows]) {
    const matchingWidget = uiWidgetMap.get(tool.identifier);
    if (matchingWidget) {
      toolUiBindings.set(tool.identifier, matchingWidget.identifier);
      logger.info(`Matched UI widget: ${tool.identifier} → ${matchingWidget.relativePath}`);
    }
  }

  // Generate the manifest code
  const code = generateManifestCode(
    validTools,
    validWorkflows,
    validUis,
    validUiWidgets,
    validMiddleware,
    validHandlers,
    toolUiBindings,
    outDir,
    projectRoot,
    directories.uiWidgets,
    directories.uiWidgetsOutDir
  );

  const uiWidgetBindingsCount = toolUiBindings.size;
  const parts = [
    `${validTools.length} tools`,
    `${validWorkflows.length} workflows`,
    `${validUis.length} UIs`,
  ];
  if (uiWidgetBindingsCount > 0) {
    parts.push(`${uiWidgetBindingsCount} UI widget bindings`);
  }
  if (validMiddleware.length > 0) {
    parts.push(`${validMiddleware.length} middleware`);
  }
  if (validHandlers.length > 0) {
    parts.push(`${validHandlers.length} handlers`);
  }
  logger.info(`Generated manifest with ${parts.join(", ")}`);

  return {
    code,
    files: [
      ...validTools,
      ...validWorkflows,
      ...validUis,
      ...validUiWidgets,
      ...validMiddleware,
      ...validHandlers,
    ],
    warnings,
    errors,
  };
}

/**
 * Write the manifest to disk
 *
 * @param code - Generated manifest code
 * @param outDir - Output directory
 * @param projectRoot - Project root
 */
export async function writeManifest(
  code: string,
  outDir: string,
  projectRoot: string
): Promise<void> {
  const outDirAbs = path.resolve(projectRoot, outDir);
  const manifestPath = path.join(outDirAbs, "app-manifest.ts");

  // Create output directory if it doesn't exist
  await fs.mkdir(outDirAbs, { recursive: true });

  // Write the manifest file
  await fs.writeFile(manifestPath, code, "utf-8");
}

/**
 * Generate the server entry point code
 */
function generateServerCode(configPath: string, port: number = 3000): string {
  // Calculate relative path from __generated__ to mcp.config
  const configImportPath = configPath.replace(/\.ts$/, ".js").replace(/^\.\//, "../");

  return `// AUTO-GENERATED - DO NOT EDIT
// Generated by @mcp-apps-kit/codegen

import { createFileBasedApp } from "@mcp-apps-kit/core";
import type { Middleware } from "@mcp-apps-kit/core";
import config from "${configImportPath}";
import { tools, middleware, handlers } from "./app-manifest.js";

// Type for ordered middleware (has { middleware, order } shape)
type OrderedMiddleware = { middleware: Middleware; order: number };
// Middleware can be either a plain function or an ordered middleware object
type MiddlewareItem = Middleware | OrderedMiddleware;

// Default order for middleware without explicit order (lower = runs first)
const DEFAULT_MIDDLEWARE_ORDER = 100;

// Type guard to check if item is ordered middleware
function isOrderedMiddleware(item: MiddlewareItem): item is OrderedMiddleware {
  return typeof item === "object" && item !== null && "middleware" in item && "order" in item;
}

// Extract the order value from a middleware item
function getMiddlewareOrder(item: MiddlewareItem): number {
  return isOrderedMiddleware(item) ? item.order : DEFAULT_MIDDLEWARE_ORDER;
}

// Extract the middleware function from a middleware item
function getMiddlewareFn(item: MiddlewareItem): Middleware {
  return isOrderedMiddleware(item) ? item.middleware : item;
}

// Cast config to expected type (defineConfig returns a union type)
export const app = createFileBasedApp({ ...config, tools } as Parameters<typeof createFileBasedApp>[0]);

// Register file-based middleware (sorted by order property)
const sortedMiddleware = ([...middleware] as MiddlewareItem[]).sort(
  (a, b) => getMiddlewareOrder(a) - getMiddlewareOrder(b)
);
for (const mw of sortedMiddleware) {
  app.use(getMiddlewareFn(mw));
}

// Register file-based event handlers
for (const handler of handlers) {
  // Handler has { event, handler } shape
  if (typeof handler === "object" && "event" in handler && "handler" in handler) {
    app.on(handler.event, handler.handler);
  }
}

// Auto-start in non-test environments
if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  const port = parseInt(process.env.PORT ?? "${port}", 10);
  await app.start({ port });

  console.log(\`
\${config.name} running on http://localhost:\${port}

Endpoints:
  - MCP:    http://localhost:\${port}/mcp
  - Health: http://localhost:\${port}/health
\`);
}

// Re-export types for client-side type inference
export type { AppTools, AppUI, AppMiddleware, AppHandlers } from "./app-manifest.js";
`;
}

/**
 * Write the server entry point to disk
 */
export async function writeServer(
  outDir: string,
  projectRoot: string,
  configPath: string = "./mcp.config.ts",
  port: number = 3000
): Promise<void> {
  const outDirAbs = path.resolve(projectRoot, outDir);
  const serverPath = path.join(outDirAbs, "server.ts");

  // Create output directory if it doesn't exist
  await fs.mkdir(outDirAbs, { recursive: true });

  // Write the server file
  const code = generateServerCode(configPath, port);
  await fs.writeFile(serverPath, code, "utf-8");
}

// =============================================================================
// VERSIONED CONFIGURATION SUPPORT
// =============================================================================

/**
 * Get resolved directories for a version
 *
 * @param versionKey - Version key (e.g., "v1", "v2")
 * @param versionConfig - Version configuration
 * @returns Resolved directories configuration
 */
export function getVersionDirectories(
  versionKey: string,
  versionConfig: FileBasedVersionConfig
): DirectoriesConfig {
  const dirs = versionConfig.directories ?? {};
  const root = dirs.root ?? `versions/${versionKey}`;

  return {
    tools: dirs.tools ?? `${root}/tools`,
    workflows: dirs.workflows ?? `${root}/workflows`,
    ui: dirs.ui ?? `${root}/ui`,
    uiWidgets: dirs.uiWidgets,
    middleware: dirs.middleware,
    handlers: dirs.handlers,
  };
}

/**
 * Result of versioned manifest generation
 */
export interface VersionedManifestResult {
  /** Generated manifests per version */
  versions: Record<string, ManifestResult>;
  /** Aggregated warnings across all versions */
  warnings: string[];
  /** Aggregated errors across all versions */
  errors: string[];
}

/**
 * Generate manifests for all versions
 *
 * @param config - Versioned configuration
 * @param projectRoot - Project root directory
 * @param outDir - Output directory for generated files
 * @param logger - Logger instance
 * @returns Generation results for all versions
 */
export async function generateVersionedManifests(
  config: VersionedFileBasedConfig,
  projectRoot: string,
  outDir: string,
  logger: PluginLogger = defaultLogger
): Promise<VersionedManifestResult> {
  const results: Record<string, ManifestResult> = {};
  const allWarnings: string[] = [];
  const allErrors: string[] = [];

  const versionKeys = Object.keys(config.versions);
  logger.info(
    `Generating manifests for ${versionKeys.length} version(s): ${versionKeys.join(", ")}`
  );

  for (const versionKey of versionKeys) {
    const versionConfig = config.versions[versionKey];
    if (!versionConfig) continue;

    const directories = getVersionDirectories(versionKey, versionConfig);

    logger.info(`Generating manifest for ${versionKey}...`);

    const result = await generateManifest({
      projectRoot,
      directories,
      outDir: path.join(outDir, versionKey),
      logger,
    });

    results[versionKey] = result;

    // Prefix warnings and errors with version key
    for (const warning of result.warnings) {
      allWarnings.push(`[${versionKey}] ${warning}`);
    }
    for (const error of result.errors) {
      allErrors.push(`[${versionKey}] ${error}`);
    }
  }

  return {
    versions: results,
    warnings: allWarnings,
    errors: allErrors,
  };
}

/**
 * Generate the versions aggregator manifest code
 *
 * This manifest imports all version manifests and exports them as a single object.
 */
function generateVersionsAggregatorCode(versionKeys: string[]): string {
  const lines: string[] = [
    "// AUTO-GENERATED - DO NOT EDIT",
    "// Generated by @mcp-apps-kit/codegen",
    "",
  ];

  // Sort version keys by numeric value for consistent ordering
  const sortedKeys = [...versionKeys].sort((a, b) => {
    const numA = parseInt(a.slice(1), 10);
    const numB = parseInt(b.slice(1), 10);
    return numA - numB;
  });

  // Generate imports for each version
  for (const versionKey of sortedKeys) {
    lines.push(
      `import { tools as ${versionKey}Tools, workflows as ${versionKey}Workflows, ui as ${versionKey}Ui, uiWidgets as ${versionKey}UiWidgets, middleware as ${versionKey}Middleware, handlers as ${versionKey}Handlers } from "./${versionKey}/app-manifest.js";`
    );
  }

  lines.push("");
  lines.push("/**");
  lines.push(" * All versions aggregated for multi-version app creation");
  lines.push(" */");
  lines.push("export const versions = {");

  for (const versionKey of sortedKeys) {
    lines.push(`  ${versionKey}: {`);
    lines.push(`    tools: ${versionKey}Tools,`);
    lines.push(`    workflows: ${versionKey}Workflows,`);
    lines.push(`    ui: ${versionKey}Ui,`);
    lines.push(`    uiWidgets: ${versionKey}UiWidgets,`);
    lines.push(`    middleware: ${versionKey}Middleware,`);
    lines.push(`    handlers: ${versionKey}Handlers,`);
    lines.push(`  },`);
  }

  lines.push("} as const;");
  lines.push("");
  lines.push("export type AppVersions = typeof versions;");
  lines.push("");

  // Re-export individual version types
  for (const versionKey of sortedKeys) {
    lines.push(
      `export type { AppTools as ${versionKey.toUpperCase()}Tools, AppUI as ${versionKey.toUpperCase()}UI } from "./${versionKey}/app-manifest.js";`
    );
  }
  lines.push("");

  return lines.join("\n");
}

/**
 * Write the versions aggregator manifest to disk
 */
export async function writeVersionsManifest(
  versionKeys: string[],
  outDir: string,
  projectRoot: string
): Promise<void> {
  const outDirAbs = path.resolve(projectRoot, outDir);
  const manifestPath = path.join(outDirAbs, "versions-manifest.ts");

  await fs.mkdir(outDirAbs, { recursive: true });

  const code = generateVersionsAggregatorCode(versionKeys);
  await fs.writeFile(manifestPath, code, "utf-8");
}

/**
 * Generate the versioned server entry point code
 */
function generateVersionedServerCode(
  configPath: string,
  versionKeys: string[],
  port: number = 3000
): string {
  const configImportPath = configPath.replace(/\.ts$/, ".js").replace(/^\.\//, "../");

  // Sort version keys for consistent ordering
  const sortedKeys = [...versionKeys].sort((a, b) => {
    const numA = parseInt(a.slice(1), 10);
    const numB = parseInt(b.slice(1), 10);
    return numA - numB;
  });

  return `// AUTO-GENERATED - DO NOT EDIT
// Generated by @mcp-apps-kit/codegen

import { createApp } from "@mcp-apps-kit/core";
import type { VersionsConfig } from "@mcp-apps-kit/core";
import config from "${configImportPath}";
import { versions } from "./versions-manifest.js";

// Build versioned app configuration
const versionedConfig: VersionsConfig = {
  name: config.name,
  config: config.config,
  plugins: config.plugins,
  icon: config.icon,
  icons: config.icons,
  versions: Object.fromEntries(
    Object.entries(versions).map(([key, v]) => {
      const versionConfig = config.versions[key];
      return [
        key,
        {
          version: versionConfig?.version ?? "1.0.0",
          tools: { ...v.tools, ...v.workflows },
          ui: v.ui,
          config: versionConfig?.config,
          plugins: versionConfig?.plugins,
        },
      ];
    })
  ),
};

export const app = createApp(versionedConfig);

// Register file-based middleware from all versions (sorted by order property)
const allMiddleware = Object.values(versions).flatMap((v) => [...v.middleware]);
const sortedMiddleware = [...allMiddleware].sort((a, b) => {
  const orderA = typeof a === "object" && "order" in a ? a.order : 100;
  const orderB = typeof b === "object" && "order" in b ? b.order : 100;
  return orderA - orderB;
});
for (const mw of sortedMiddleware) {
  const middlewareFn = typeof mw === "object" && "middleware" in mw ? mw.middleware : mw;
  app.use(middlewareFn);
}

// Register file-based event handlers from all versions
const allHandlers = Object.values(versions).flatMap((v) => [...v.handlers]);
for (const handler of allHandlers) {
  if (typeof handler === "object" && "event" in handler && "handler" in handler) {
    app.on(handler.event, handler.handler);
  }
}

// Auto-start in non-test environments
if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  const port = parseInt(process.env.PORT ?? "${port}", 10);
  await app.start({ port });

  console.log(\`
\${config.name} running on http://localhost:\${port}

Endpoints:
${sortedKeys.map((vk) => `  - ${vk.toUpperCase()} MCP: http://localhost:\${port}/${vk}/mcp`).join("\\n")}
  - Health: http://localhost:\${port}/health
\`);
}

// Re-export types for client-side type inference
export type { AppVersions } from "./versions-manifest.js";
`;
}

/**
 * Write the versioned server entry point to disk
 */
export async function writeVersionedServer(
  versionKeys: string[],
  outDir: string,
  projectRoot: string,
  configPath: string = "./mcp.config.ts",
  port: number = 3000
): Promise<void> {
  const outDirAbs = path.resolve(projectRoot, outDir);
  const serverPath = path.join(outDirAbs, "server.ts");

  await fs.mkdir(outDirAbs, { recursive: true });

  const code = generateVersionedServerCode(configPath, versionKeys, port);
  await fs.writeFile(serverPath, code, "utf-8");
}

/**
 * Write per-version manifests to disk
 */
export async function writeVersionedManifests(
  results: VersionedManifestResult,
  outDir: string,
  projectRoot: string
): Promise<void> {
  for (const [versionKey, result] of Object.entries(results.versions)) {
    if (result.errors.length === 0) {
      await writeManifest(result.code, path.join(outDir, versionKey), projectRoot);
    }
  }
}

/**
 * Options for the CLI codegen runner
 */
export interface RunCodegenOptions {
  /** Path to the config file (default: "./mcp.config.ts") */
  configPath?: string;
  /** Output directory for the manifest (default: "__generated__") */
  outDir?: string;
  /** Project root directory (default: process.cwd()) */
  projectRoot?: string;
  /** Logger for output (default: console) */
  logger?: PluginLogger;
}

/**
 * Run the codegen process
 *
 * This is the main entry point for CLI usage. It:
 * 1. Loads configuration from mcp.config.ts
 * 2. Generates the manifest using the config's directories
 * 3. Writes the manifest to the output directory
 *
 * Supports both single-version and multi-version configurations.
 *
 * @param options - Optional configuration
 *
 * @example Single-version
 * ```typescript
 * // scripts/generate.ts
 * import { runCodegen } from "@mcp-apps-kit/codegen";
 *
 * runCodegen().catch(console.error);
 * ```
 *
 * @example Multi-version
 * ```typescript
 * // mcp.config.ts uses versions: { v1: {...}, v2: {...} }
 * // Generated files: __generated__/v1/app-manifest.ts, __generated__/v2/app-manifest.ts
 * runCodegen().catch(console.error);
 * ```
 */
export async function runCodegen(options: RunCodegenOptions = {}): Promise<void> {
  const {
    configPath = "./mcp.config.ts",
    outDir = "__generated__",
    projectRoot = process.cwd(),
    logger = defaultLogger,
  } = options;

  // Dynamic import to avoid circular dependency
  const { loadConfigWithFallback, isVersionedConfig } = await import("./config.js");

  logger.info("Loading config...");

  // Load the configuration (with fallback to package.json if config file not found)
  const config = await loadConfigWithFallback(configPath, projectRoot, logger);

  // Handle versioned vs single-version config
  if (isVersionedConfig(config)) {
    await runVersionedCodegen(config, configPath, outDir, projectRoot, logger);
  } else {
    await runSingleVersionCodegen(config, configPath, outDir, projectRoot, logger);
  }
}

/**
 * Run codegen for single-version configuration
 */
async function runSingleVersionCodegen(
  config: { directories?: DirectoriesConfig },
  configPath: string,
  outDir: string,
  projectRoot: string,
  logger: PluginLogger
): Promise<void> {
  // Generate the manifest
  const result = await generateManifest({
    projectRoot,
    directories: config.directories,
    outDir,
    logger,
  });

  // Handle errors
  if (result.errors.length > 0) {
    for (const error of result.errors) {
      logger.error(error);
    }
    throw new Error(`Manifest generation failed with ${result.errors.length} error(s)`);
  }

  // Handle warnings
  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      logger.warn(warning);
    }
  }

  // Write the manifest and server entry point
  await writeManifest(result.code, outDir, projectRoot);
  await writeServer(outDir, projectRoot, configPath);

  // Log summary
  const toolCount = result.files.filter((f) => f.type === "tool").length;
  const workflowCount = result.files.filter((f) => f.type === "workflow").length;
  const uiCount = result.files.filter((f) => f.type === "ui").length;
  const uiWidgetCount = result.files.filter((f) => f.type === "ui-widget").length;
  const middlewareCount = result.files.filter((f) => f.type === "middleware").length;
  const handlerCount = result.files.filter((f) => f.type === "handler").length;

  const summary = [`${toolCount} tools`, `${workflowCount} workflows`, `${uiCount} UIs`];
  if (uiWidgetCount > 0) {
    summary.push(`${uiWidgetCount} UI widgets`);
  }
  if (middlewareCount > 0) {
    summary.push(`${middlewareCount} middleware`);
  }
  if (handlerCount > 0) {
    summary.push(`${handlerCount} handlers`);
  }
  logger.info(`Generated manifest with ${summary.join(", ")}`);
  logger.info(`Written to: ${outDir}/`);
}

/**
 * Run codegen for versioned (multi-version) configuration
 */
async function runVersionedCodegen(
  config: VersionedFileBasedConfig,
  configPath: string,
  outDir: string,
  projectRoot: string,
  logger: PluginLogger
): Promise<void> {
  const versionKeys = Object.keys(config.versions);
  logger.info(
    `Detected versioned config with ${versionKeys.length} version(s): ${versionKeys.join(", ")}`
  );

  // Generate manifests for all versions
  const results = await generateVersionedManifests(config, projectRoot, outDir, logger);

  // Handle errors
  if (results.errors.length > 0) {
    for (const error of results.errors) {
      logger.error(error);
    }
    throw new Error(`Manifest generation failed with ${results.errors.length} error(s)`);
  }

  // Handle warnings
  if (results.warnings.length > 0) {
    for (const warning of results.warnings) {
      logger.warn(warning);
    }
  }

  // Write per-version manifests
  await writeVersionedManifests(results, outDir, projectRoot);

  // Write versions aggregator manifest
  await writeVersionsManifest(versionKeys, outDir, projectRoot);

  // Write versioned server entry point
  await writeVersionedServer(versionKeys, outDir, projectRoot, configPath);

  // Log summary per version
  for (const versionKey of versionKeys) {
    const result = results.versions[versionKey];
    if (!result) continue;

    const toolCount = result.files.filter((f) => f.type === "tool").length;
    const workflowCount = result.files.filter((f) => f.type === "workflow").length;
    const uiCount = result.files.filter((f) => f.type === "ui").length;
    const uiWidgetCount = result.files.filter((f) => f.type === "ui-widget").length;
    const middlewareCount = result.files.filter((f) => f.type === "middleware").length;
    const handlerCount = result.files.filter((f) => f.type === "handler").length;

    const summary = [`${toolCount} tools`, `${workflowCount} workflows`, `${uiCount} UIs`];
    if (uiWidgetCount > 0) {
      summary.push(`${uiWidgetCount} UI widgets`);
    }
    if (middlewareCount > 0) {
      summary.push(`${middlewareCount} middleware`);
    }
    if (handlerCount > 0) {
      summary.push(`${handlerCount} handlers`);
    }
    logger.info(`[${versionKey}] Generated manifest with ${summary.join(", ")}`);
  }

  logger.info(`Written to: ${outDir}/`);
  logger.info(`  - ${versionKeys.map((vk) => `${outDir}/${vk}/app-manifest.ts`).join(", ")}`);
  logger.info(`  - ${outDir}/versions-manifest.ts`);
  logger.info(`  - ${outDir}/server.ts`);
}
