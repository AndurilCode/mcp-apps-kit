/**
 * AST-based parser for discovering defineReactUI calls
 *
 * Uses @typescript-eslint/typescript-estree for reliable TypeScript/TSX parsing.
 * This replaces the regex-based approach for more accurate import resolution.
 */

import { AST_NODE_TYPES, parse, type TSESTree } from "@typescript-eslint/typescript-estree";

/**
 * Result of parsing a defineReactUI call
 */
export interface ParsedReactUI {
  /** Variable name used for the component */
  componentName: string;
  /** Import path for the component */
  importPath: string;
  /** UI name from the defineReactUI call */
  name: string;
}

/**
 * Parse a TypeScript/TSX file and extract defineReactUI calls.
 *
 * @param content - File content to parse
 * @returns Array of parsed React UI definitions
 */
export async function parseReactUIDefinitions(content: string): Promise<ParsedReactUI[]> {
  const ast = parse(content, {
    loc: true,
    range: true,
    jsx: true,
    // Don't require a project - we just need syntax parsing
  });

  const results: ParsedReactUI[] = [];

  // Build import map: identifier -> import path
  const importMap = new Map<string, string>();

  for (const node of ast.body) {
    if (node.type === AST_NODE_TYPES.ImportDeclaration) {
      const importPath = node.source.value;

      for (const specifier of node.specifiers) {
        if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
          // Named import: import { Foo } from "./path" or import { Foo as Bar } from "./path"
          const localName = specifier.local.name;
          importMap.set(localName, importPath);
        } else if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
          // Default import: import Foo from "./path"
          const localName = specifier.local.name;
          importMap.set(localName, importPath);
        }
      }
    }
  }

  // Walk the AST to find defineReactUI calls
  walkAST(ast, (node) => {
    if (
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.Identifier &&
      node.callee.name === "defineReactUI"
    ) {
      const parsed = parseDefineReactUICall(node, importMap);
      if (parsed) {
        results.push(parsed);
      }
    }
  });

  return results;
}

/**
 * Parse a defineReactUI call expression
 */
function parseDefineReactUICall(
  node: TSESTree.CallExpression,
  importMap: Map<string, string>
): ParsedReactUI | null {
  // First argument should be an object expression
  const arg = node.arguments[0];
  if (arg?.type !== AST_NODE_TYPES.ObjectExpression) {
    return null;
  }

  let componentName: string | null = null;
  let uiName: string | null = null;

  for (const prop of arg.properties) {
    if (prop.type !== AST_NODE_TYPES.Property) continue;

    const key = prop.key;
    const keyName = key.type === AST_NODE_TYPES.Identifier ? key.name : null;
    if (!keyName) continue;

    if (keyName === "component") {
      // Extract component identifier
      if (prop.value.type === AST_NODE_TYPES.Identifier) {
        componentName = prop.value.name;
      }
    } else if (keyName === "name") {
      // Extract name string
      if (prop.value.type === AST_NODE_TYPES.Literal && typeof prop.value.value === "string") {
        uiName = prop.value.value;
      }
    }
  }

  if (!componentName || !uiName) {
    return null;
  }

  const importPath = importMap.get(componentName);
  if (!importPath) {
    return null;
  }

  return {
    componentName,
    importPath,
    name: uiName,
  };
}

/**
 * Simple AST walker
 */
function walkAST(
  node: TSESTree.Node | TSESTree.Node[],
  visitor: (node: TSESTree.Node) => void
): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      walkAST(child, visitor);
    }
    return;
  }

  visitor(node);

  // Walk child nodes - cast to unknown first to avoid strict type checking
  const nodeRecord = node as unknown as Record<string, unknown>;
  for (const key of Object.keys(nodeRecord)) {
    const value = nodeRecord[key];
    if (value && typeof value === "object") {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object" && "type" in item) {
            walkAST(item as TSESTree.Node, visitor);
          }
        }
      } else if ("type" in value) {
        walkAST(value as TSESTree.Node, visitor);
      }
    }
  }
}
