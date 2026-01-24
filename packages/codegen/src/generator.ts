/**
 * Manifest generation logic for file-based tool discovery
 *
 * Scans configured directories (tools/, workflows/, ui/) and generates
 * a typed manifest file that can be imported into the app.
 */

/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */

import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
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
 * Maximum recursion depth for directory scanning
 * Prevents stack overflow and excessive resource usage
 */
const MAX_RECURSION_DEPTH = 50;

/**
 * Maximum concurrent file analysis operations
 * Prevents excessive memory usage in very large codebases (>1000 files)
 */
const MAX_CONCURRENT_ANALYSIS = 50;

/**
 * Run promises with concurrency limit using a queue-based approach
 *
 * This prevents excessive memory usage when analyzing very large codebases
 * by limiting the number of concurrent file analysis operations.
 *
 * @param items - Items to process
 * @param limit - Maximum concurrent operations
 * @param fn - Async function to run for each item
 * @returns Array of results in the same order as items
 */
async function withConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let currentIndex = 0;

  // Worker function that processes items from the queue
  const worker = async (): Promise<void> => {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      const item = items[index];
      if (item !== undefined) {
        results[index] = await fn(item, index);
      }
    }
  };

  // Start 'limit' workers in parallel
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

/**
 * Validate that a path is within the project root (path traversal protection)
 *
 * Uses synchronous realpath to resolve symlinks for accurate comparison.
 * This handles cases like macOS /var -> /private/var symlinks.
 *
 * @param resolvedPath - The resolved absolute path to validate
 * @param projectRoot - The project root directory
 * @throws Error if path is outside project root
 */
function validatePathWithinRoot(resolvedPath: string, projectRoot: string): void {
  let normalizedPath: string;
  let normalizedRoot: string;

  try {
    // Try to resolve real paths (handles symlinks like /var -> /private/var on macOS)
    normalizedPath = path.normalize(fsSync.realpathSync(resolvedPath));
    normalizedRoot = path.normalize(fsSync.realpathSync(projectRoot));
  } catch {
    // If realpath fails (path doesn't exist yet), use normalized paths
    normalizedPath = path.normalize(resolvedPath);
    normalizedRoot = path.normalize(projectRoot);
  }

  if (!normalizedPath.startsWith(normalizedRoot + path.sep) && normalizedPath !== normalizedRoot) {
    throw new Error(
      `Security error: Path "${resolvedPath}" is outside project root "${projectRoot}"`
    );
  }
}

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
 *
 * @param dirPath - Current directory being scanned
 * @param basePath - Base path for calculating relative paths
 * @param resourceType - Type of resource being discovered
 * @param projectRoot - Project root for path validation (optional, uses basePath if not provided)
 * @param depth - Current recursion depth (for security limits)
 */
async function discoverFilesInDirectory(
  dirPath: string,
  basePath: string,
  resourceType: "tool" | "workflow" | "ui" | "ui-widget" | "middleware" | "handler",
  projectRoot?: string,
  depth: number = 0
): Promise<DiscoveredFile[]> {
  // Security: Enforce max recursion depth
  if (depth > MAX_RECURSION_DEPTH) {
    throw new Error(
      `Security error: Maximum recursion depth (${MAX_RECURSION_DEPTH}) exceeded at "${dirPath}"`
    );
  }

  // Security: Validate path is within project root
  const root = projectRoot ?? basePath;
  validatePathWithinRoot(dirPath, root);

  const files: DiscoveredFile[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // Security: Validate each discovered path is within project root
      validatePathWithinRoot(fullPath, root);

      const relativePath = path.relative(basePath, fullPath);

      if (entry.isDirectory()) {
        // Security: Skip symlinks that point outside project root
        try {
          const realFullPath = await fs.realpath(fullPath);
          const realRoot = await fs.realpath(root);
          if (!realFullPath.startsWith(realRoot + path.sep) && realFullPath !== realRoot) {
            // Symlink points outside project root, skip it
            continue;
          }
        } catch {
          // If realpath fails, the directory doesn't exist or is inaccessible
          // The recursive call will handle this gracefully
        }

        // Recursively scan subdirectories with incremented depth
        const subFiles = await discoverFilesInDirectory(
          fullPath,
          basePath,
          resourceType,
          root,
          depth + 1
        );
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
 *
 * @param filePath - The absolute path to the file
 * @param logger - Logger for warnings (optional, defaults to defaultLogger)
 */
async function analyzeFile(
  filePath: string,
  logger: PluginLogger = defaultLogger
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
  } catch (error) {
    // Log parse failures to help debug syntax errors in tools
    logger.warn(
      `Failed to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    );
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

  // Discover files in each directory (with path traversal protection via projectRoot)
  const toolFiles = (await directoryExists(toolsDir))
    ? await discoverFilesInDirectory(toolsDir, toolsDir, "tool", projectRoot)
    : [];

  const workflowFiles = (await directoryExists(workflowsDir))
    ? await discoverFilesInDirectory(workflowsDir, workflowsDir, "workflow", projectRoot)
    : [];

  const uiFiles =
    uiDir && (await directoryExists(uiDir))
      ? await discoverFilesInDirectory(uiDir, uiDir, "ui", projectRoot)
      : [];

  // Discover UI widget files for convention-based binding
  const uiWidgetFiles =
    uiWidgetsDir && (await directoryExists(uiWidgetsDir))
      ? await discoverFilesInDirectory(uiWidgetsDir, uiWidgetsDir, "ui-widget", projectRoot)
      : [];

  // Discover middleware files
  const middlewareFiles =
    middlewareDir && (await directoryExists(middlewareDir))
      ? await discoverFilesInDirectory(middlewareDir, middlewareDir, "middleware", projectRoot)
      : [];

  // Discover handler files
  const handlerFiles =
    handlersDir && (await directoryExists(handlersDir))
      ? await discoverFilesInDirectory(handlersDir, handlersDir, "handler", projectRoot)
      : [];

  // Check for name collisions within each category
  const toolCollisions = findNameCollisions(toolFiles);
  const workflowCollisions = findNameCollisions(workflowFiles);
  const uiCollisions = findNameCollisions(uiFiles);
  const uiWidgetCollisions = findNameCollisions(uiWidgetFiles);
  const middlewareCollisions = findNameCollisions(middlewareFiles);
  const handlerCollisions = findNameCollisions(handlerFiles);

  // Report collisions as errors with actionable suggestions
  for (const [identifier, paths] of toolCollisions) {
    const suggestion =
      paths.length === 2
        ? "Rename one file or use subdirectories to create unique paths (e.g., 'tools/v1/get-user.ts' vs 'tools/v2/get-user.ts')"
        : "Rename files or reorganize into subdirectories to create unique tool names";
    errors.push(
      `Tool name collision: '${identifier}' is defined in both ${paths.join(" and ")}. ${suggestion}`
    );
  }
  for (const [identifier, paths] of workflowCollisions) {
    const suggestion =
      paths.length === 2
        ? "Rename one file or use subdirectories to create unique paths"
        : "Rename files or reorganize into subdirectories to create unique workflow names";
    errors.push(
      `Workflow name collision: '${identifier}' is defined in both ${paths.join(" and ")}. ${suggestion}`
    );
  }
  for (const [identifier, paths] of uiCollisions) {
    const suggestion =
      paths.length === 2
        ? "Rename one file or use subdirectories to create unique paths"
        : "Rename files or reorganize into subdirectories to create unique UI component names";
    errors.push(
      `UI name collision: '${identifier}' is defined in both ${paths.join(" and ")}. ${suggestion}`
    );
  }
  for (const [identifier, paths] of uiWidgetCollisions) {
    const suggestion =
      paths.length === 2
        ? "Rename one file or use subdirectories to create unique paths"
        : "Rename files or reorganize into subdirectories to create unique widget names";
    errors.push(
      `UI widget name collision: '${identifier}' is defined in both ${paths.join(" and ")}. ${suggestion}`
    );
  }
  for (const [identifier, paths] of middlewareCollisions) {
    const suggestion =
      paths.length === 2
        ? "Rename one file or use subdirectories to create unique paths"
        : "Rename files or reorganize into subdirectories to create unique middleware names";
    errors.push(
      `Middleware name collision: '${identifier}' is defined in both ${paths.join(" and ")}. ${suggestion}`
    );
  }
  for (const [identifier, paths] of handlerCollisions) {
    const suggestion =
      paths.length === 2
        ? "Rename one file or use subdirectories to create unique paths"
        : "Rename files or reorganize into subdirectories to create unique handler names";
    errors.push(
      `Handler name collision: '${identifier}' is defined in both ${paths.join(" and ")}. ${suggestion}`
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

  // Analyze all files with concurrency limiting to prevent memory issues in large codebases
  const [
    toolAnalysisResults,
    workflowAnalysisResults,
    uiAnalysisResults,
    uiWidgetAnalysisResults,
    middlewareAnalysisResults,
    handlerAnalysisResults,
  ] = await Promise.all([
    // Analyze tool files with concurrency limit
    withConcurrencyLimit(toolFiles, MAX_CONCURRENT_ANALYSIS, async (file) => ({
      file,
      analysis: await analyzeFile(file.filePath, logger),
    })),
    // Analyze workflow files with concurrency limit
    withConcurrencyLimit(workflowFiles, MAX_CONCURRENT_ANALYSIS, async (file) => ({
      file,
      analysis: await analyzeFile(file.filePath, logger),
    })),
    // Analyze UI files with concurrency limit
    withConcurrencyLimit(uiFiles, MAX_CONCURRENT_ANALYSIS, async (file) => ({
      file,
      analysis: await analyzeFile(file.filePath, logger),
    })),
    // Analyze UI widget files with concurrency limit
    withConcurrencyLimit(uiWidgetFiles, MAX_CONCURRENT_ANALYSIS, async (file) => ({
      file,
      analysis: await analyzeFile(file.filePath, logger),
    })),
    // Analyze middleware files with concurrency limit
    withConcurrencyLimit(middlewareFiles, MAX_CONCURRENT_ANALYSIS, async (file) => ({
      file,
      analysis: await analyzeFile(file.filePath, logger),
    })),
    // Analyze handler files with concurrency limit
    withConcurrencyLimit(handlerFiles, MAX_CONCURRENT_ANALYSIS, async (file) => ({
      file,
      analysis: await analyzeFile(file.filePath, logger),
    })),
  ]);

  // Process tool analysis results
  const validTools: DiscoveredFile[] = [];
  for (const { file, analysis } of toolAnalysisResults) {
    if (!analysis.hasDefaultExport) {
      warnings.push(`Skipping ${file.relativePath}: no default export found`);
      logger.warn(`Skipping tools/${file.relativePath}: no default export found`);
      continue;
    }
    file.hasDefaultExport = true;
    file.hasUiExport = analysis.hasUiExport;
    validTools.push(file);
  }

  // Process workflow analysis results
  const validWorkflows: DiscoveredFile[] = [];
  for (const { file, analysis } of workflowAnalysisResults) {
    if (!analysis.hasDefaultExport) {
      warnings.push(`Skipping ${file.relativePath}: no default export found`);
      logger.warn(`Skipping workflows/${file.relativePath}: no default export found`);
      continue;
    }
    file.hasDefaultExport = true;
    validWorkflows.push(file);
  }

  // Process UI analysis results
  const validUis: DiscoveredFile[] = [];
  for (const { file, analysis } of uiAnalysisResults) {
    if (!analysis.hasDefaultExport) {
      warnings.push(`Skipping ${file.relativePath}: no default export found`);
      logger.warn(`Skipping ui/${file.relativePath}: no default export found`);
      continue;
    }
    file.hasDefaultExport = true;
    validUis.push(file);
  }

  // Process UI widget analysis results
  // Widget files can export UI definition as default OR as named 'ui' export
  // (named export allows colocating React component as default for vite plugin)
  const validUiWidgets: DiscoveredFile[] = [];
  for (const { file, analysis } of uiWidgetAnalysisResults) {
    if (!analysis.hasDefaultExport && !analysis.hasUiExport) {
      warnings.push(`Skipping ${file.relativePath}: no default or ui export found`);
      logger.warn(`Skipping uiWidgets/${file.relativePath}: no default or ui export found`);
      continue;
    }
    file.hasDefaultExport = analysis.hasDefaultExport;
    file.hasUiExport = analysis.hasUiExport;
    validUiWidgets.push(file);
  }

  // Process middleware analysis results
  const validMiddleware: DiscoveredFile[] = [];
  for (const { file, analysis } of middlewareAnalysisResults) {
    if (!analysis.hasDefaultExport) {
      warnings.push(`Skipping ${file.relativePath}: no default export found`);
      logger.warn(`Skipping middleware/${file.relativePath}: no default export found`);
      continue;
    }
    file.hasDefaultExport = true;
    validMiddleware.push(file);
  }

  // Process handler analysis results
  const validHandlers: DiscoveredFile[] = [];
  for (const { file, analysis } of handlerAnalysisResults) {
    if (!analysis.hasDefaultExport) {
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
import {
  sortMiddleware,
  getMiddlewareFn,
  type MiddlewareItem,
} from "@mcp-apps-kit/codegen";
import config from "${configImportPath}";
import { tools, middleware, handlers } from "./app-manifest.js";

// Cast config to expected type (defineConfig returns a union type)
export const app = createFileBasedApp({ ...config, tools } as Parameters<typeof createFileBasedApp>[0]);

// Register file-based middleware (sorted by order property)
const sortedMiddleware = sortMiddleware([...middleware] as MiddlewareItem[]);
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
import { sortMiddleware, getMiddlewareFn } from "@mcp-apps-kit/codegen";
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
const sortedMiddleware = sortMiddleware(allMiddleware);
for (const mw of sortedMiddleware) {
  app.use(getMiddlewareFn(mw));
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
