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
import type { DiscoveredFile, ManifestResult, DirectoriesConfig, PluginLogger } from "./types";
import {
  shouldSkipFile,
  hasValidExtension,
  pathToIdentifier,
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
  resourceType: "tool" | "workflow" | "ui" | "ui-widget"
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
  toolUiBindings: Map<string, string>,
  outDir: string,
  projectRoot: string
): string {
  const lines: string[] = [
    "// AUTO-GENERATED - DO NOT EDIT",
    "// Generated by @mcp-apps-kit/codegen",
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
    for (const widget of uiWidgets) {
      // For widget files, check if they're TSX/JSX (React) files
      // TSX files need to keep their extension for jiti/tsx runtime loading
      const isTsxFile = widget.filePath.endsWith(".tsx") || widget.filePath.endsWith(".jsx");
      const importPath = getRelativeImportPath(outDir, widget.filePath, projectRoot, !isTsxFile);
      const uiIdentifier = `${widget.identifier}_ui`;
      // Use named 'ui' export if available (allows colocating React component as default)
      // Otherwise fall back to default export
      if (widget.hasUiExport) {
        lines.push(`import { ui as ${uiIdentifier} } from "${importPath}";`);
      } else {
        lines.push(`import ${uiIdentifier} from "${importPath}";`);
      }
    }
  }

  // Apply convention-based UI bindings (only if tool doesn't have explicit ui: field)
  if (toolUiBindings.size > 0) {
    lines.push("// Apply convention-based UI bindings");
    lines.push("// (only if tool doesn't have explicit ui: field)");
    for (const [toolId, widgetId] of toolUiBindings) {
      lines.push(`if (!${toolId}.ui) {`);
      lines.push(`  ${toolId}.ui = ${widgetId}_ui;`);
      lines.push(`}`);
    }
    lines.push("");
  }

  // Generate tools export (includes both tools and workflows since workflows become tools)
  const allTools = [...tools, ...workflows];
  if (allTools.length === 0) {
    lines.push("// No tools discovered in tools/ or workflows/ directories");
  } else if (tools.length > 0 && workflows.length > 0) {
    lines.push(`// Tools from tools/ (${tools.length}) and workflows/ (${workflows.length})`);
  }
  lines.push("export const tools = {");
  for (const tool of allTools) {
    lines.push(`  ${tool.identifier},`);
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
    lines.push(`  ${workflow.identifier},`);
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

  // Generate type exports
  lines.push("export type AppTools = typeof tools;");
  lines.push("export type AppWorkflows = typeof workflows;");
  lines.push("export type AppUI = typeof ui;");
  lines.push("export type AppUIWidgets = typeof uiWidgets;");
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

  // Check for name collisions within each category
  const toolCollisions = findNameCollisions(toolFiles);
  const workflowCollisions = findNameCollisions(workflowFiles);
  const uiCollisions = findNameCollisions(uiFiles);
  const uiWidgetCollisions = findNameCollisions(uiWidgetFiles);

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

  if (errors.length > 0) {
    return {
      code: "",
      files: [...toolFiles, ...workflowFiles, ...uiFiles],
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
    toolUiBindings,
    outDir,
    projectRoot
  );

  const uiWidgetBindingsCount = toolUiBindings.size;
  logger.info(
    `Generated manifest with ${validTools.length} tools, ${validWorkflows.length} workflows, ${validUis.length} UIs` +
      (uiWidgetBindingsCount > 0 ? `, ${uiWidgetBindingsCount} UI widget bindings` : "")
  );

  return {
    code,
    files: [...validTools, ...validWorkflows, ...validUis, ...validUiWidgets],
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
import config from "${configImportPath}";
import { tools } from "./app-manifest.js";

export const app = createFileBasedApp({ ...config, tools });

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
export type { AppTools, AppUI } from "./app-manifest.js";
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
 * @param options - Optional configuration
 *
 * @example
 * ```typescript
 * // scripts/generate.ts
 * import { runCodegen } from "@mcp-apps-kit/codegen";
 *
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
  const { loadConfig } = await import("./config.js");

  logger.info("Loading config...");

  // Load the configuration
  const config = await loadConfig(configPath, projectRoot, logger);

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

  const summary = [`${toolCount} tools`, `${workflowCount} workflows`, `${uiCount} UIs`];
  if (uiWidgetCount > 0) {
    summary.push(`${uiWidgetCount} UI widgets`);
  }
  logger.info(`Generated manifest with ${summary.join(", ")}`);
  logger.info(`Written to: ${outDir}/`);
}
