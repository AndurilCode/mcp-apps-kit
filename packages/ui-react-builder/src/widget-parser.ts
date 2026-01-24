/**
 * Parser for file-based widget discovery
 *
 * Discovers widget files that export:
 * - default: React component
 * - ui: WidgetMetadata object
 */

import { AST_NODE_TYPES, parse, type TSESTree } from "@typescript-eslint/typescript-estree";

/**
 * Result of parsing a widget file
 */
export interface ParsedWidgetFile {
  /** Whether the file has a default export (the component) */
  hasDefaultExport: boolean;
  /** Whether the file exports a `ui` object */
  hasUIExport: boolean;
  /** Parsed UI metadata from the export */
  uiMetadata: WidgetUIMetadata;
}

/**
 * UI metadata extracted from a widget file
 */
export interface WidgetUIMetadata {
  name?: string;
  description?: string;
  widgetDescription?: string;
  prefersBorder?: boolean;
  autoResize?: boolean;
}

/**
 * Parse a widget file to check for default export and ui export.
 *
 * @param content - File content to parse
 * @returns Parsed widget file info
 */
export function parseWidgetFile(content: string): ParsedWidgetFile {
  const ast = parse(content, {
    loc: true,
    range: true,
    jsx: true,
  });

  let hasDefaultExport = false;
  let hasUIExport = false;
  const uiMetadata: WidgetUIMetadata = {};

  for (const node of ast.body) {
    // Check for default export
    if (node.type === AST_NODE_TYPES.ExportDefaultDeclaration) {
      hasDefaultExport = true;
    }

    // Check for named exports
    if (node.type === AST_NODE_TYPES.ExportNamedDeclaration) {
      const declaration = node.declaration;

      // Handle: export const ui = { ... }
      if (declaration?.type === AST_NODE_TYPES.VariableDeclaration) {
        for (const declarator of declaration.declarations) {
          if (
            declarator.id.type === AST_NODE_TYPES.Identifier &&
            declarator.id.name === "ui" &&
            declarator.init?.type === AST_NODE_TYPES.ObjectExpression
          ) {
            hasUIExport = true;
            extractUIMetadata(declarator.init, uiMetadata);
          }
        }
      }
    }
  }

  return {
    hasDefaultExport,
    hasUIExport,
    uiMetadata,
  };
}

/**
 * Extract UI metadata from an object expression
 */
function extractUIMetadata(node: TSESTree.ObjectExpression, metadata: WidgetUIMetadata): void {
  for (const prop of node.properties) {
    if (prop.type !== AST_NODE_TYPES.Property) continue;

    const key = prop.key;
    const keyName = key.type === AST_NODE_TYPES.Identifier ? key.name : null;
    if (!keyName) continue;

    // Extract string values
    if (prop.value.type === AST_NODE_TYPES.Literal && typeof prop.value.value === "string") {
      if (keyName === "name") {
        metadata.name = prop.value.value;
      } else if (keyName === "description") {
        metadata.description = prop.value.value;
      } else if (keyName === "widgetDescription") {
        metadata.widgetDescription = prop.value.value;
      }
    }

    // Extract boolean values
    if (prop.value.type === AST_NODE_TYPES.Literal && typeof prop.value.value === "boolean") {
      if (keyName === "prefersBorder") {
        metadata.prefersBorder = prop.value.value;
      } else if (keyName === "autoResize") {
        metadata.autoResize = prop.value.value;
      }
    }
  }
}

/**
 * Check if a file is a valid widget file (has default export + ui export)
 */
export function isValidWidgetFile(content: string): boolean {
  try {
    const parsed = parseWidgetFile(content);
    return parsed.hasDefaultExport && parsed.hasUIExport;
  } catch {
    return false;
  }
}
