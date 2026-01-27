/**
 * Widget Snapshot Tool
 *
 * Captures a compact accessibility tree snapshot of a widget,
 * providing a much smaller payload than full DOM for LLM context efficiency.
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "../connection";
import type {
  WidgetSnapshotOutput,
  AccessibilityNode,
  InteractiveElementSummary,
  WidgetDOMSnapshot,
} from "../types";

// =============================================================================
// SCHEMAS
// =============================================================================

export const widgetSnapshotInputSchema = z.object({
  sessionId: z.string().describe("Session ID of the widget"),
  includeDOM: z.boolean().optional().describe("Include full DOM HTML as well (default: false)"),
  filterRoles: z
    .array(z.string())
    .optional()
    .describe("Filter to specific ARIA roles (e.g., ['button', 'textbox'])"),
  maxDepth: z.number().optional().describe("Maximum tree depth (default: unlimited)"),
});

export const widgetSnapshotOutputSchema = z.object({
  success: z.boolean(),
  accessibilityTree: z.unknown().optional(),
  interactiveElementCount: z.number().optional(),
  interactiveElements: z
    .array(
      z.object({
        nodeIndex: z.number(),
        role: z.string(),
        name: z.string(),
        locatorHint: z.string().optional(),
      })
    )
    .optional(),
  dom: z
    .object({
      html: z.string(),
      textContent: z.string(),
    })
    .optional(),
  error: z.string().optional(),
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Escape single quotes for use in locator hints
 */
function escapeQuotes(str: string): string {
  return str.replace(/'/g, "\\'");
}

/**
 * Generate a Playwright-compatible locator hint from accessibility info
 */
function generateLocatorHint(
  role: string,
  name: string,
  _node: Record<string, unknown>
): string | undefined {
  // Prefer role-based locators for semantic targeting
  if (name && role !== "generic" && role !== "group" && role !== "none") {
    return `getByRole('${role}', { name: '${escapeQuotes(name)}' })`;
  }

  // Role-only fallback for elements without accessible names
  if (role !== "generic" && role !== "group" && role !== "none") {
    return `getByRole('${role}')`;
  }

  return undefined;
}

/**
 * Parse Playwright's YAML ariaSnapshot into a structured object
 *
 * Format example:
 * - button "Submit"
 * - textbox "Email" [focused]
 * - list:
 *   - listitem: "Item 1"
 *   - listitem: "Item 2"
 */
function parseAriaSnapshot(yaml: string): Record<string, unknown> | null {
  const lines = yaml.split("\n").filter((line) => line.trim());
  if (lines.length === 0) return null;

  interface ParsedNode {
    role: string;
    name: string;
    focused?: boolean;
    checked?: boolean;
    disabled?: boolean;
    expanded?: boolean;
    selected?: boolean;
    children?: ParsedNode[];
  }

  const parseAttributes = (attrStr: string): Record<string, boolean> => {
    const attrs: Record<string, boolean> = {};
    const matches = attrStr.match(/\[([^\]]+)\]/g) ?? [];
    for (const match of matches) {
      const attr = match.slice(1, -1).trim();
      if (attr === "focused") attrs.focused = true;
      else if (attr === "checked") attrs.checked = true;
      else if (attr === "disabled") attrs.disabled = true;
      else if (attr === "expanded") attrs.expanded = true;
      else if (attr === "selected") attrs.selected = true;
    }
    return attrs;
  };

  const parseLine = (line: string): { indent: number; node: ParsedNode } | null => {
    const match = line.match(/^(\s*)-\s*(\w+)(?:\s+"([^"]*)")?(.*)$/);
    if (!match) return null;

    const [, spaces, role, name = "", rest = ""] = match;
    if (!role) return null;
    const indent = spaces?.length ?? 0;
    const attrs = parseAttributes(rest);

    return {
      indent,
      node: {
        role,
        name,
        ...attrs,
      },
    };
  };

  // Build tree structure
  const root: ParsedNode = { role: "root", name: "", children: [] };
  const stack: { indent: number; node: ParsedNode }[] = [{ indent: -2, node: root }];

  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) continue;

    // Find parent based on indentation
    while (stack.length > 1) {
      const top = stack[stack.length - 1];
      if (!top || top.indent < parsed.indent) break;
      stack.pop();
    }

    const parentEntry = stack[stack.length - 1];
    if (!parentEntry) continue;
    const parent = parentEntry.node;
    parent.children ??= [];
    parent.children.push(parsed.node);
    stack.push(parsed);
  }

  // Return the root or first child if root only has one child
  if (root.children?.length === 1) {
    return root.children[0] as unknown as Record<string, unknown>;
  }
  return root as unknown as Record<string, unknown>;
}

/**
 * Interactive ARIA roles that users typically interact with
 */
const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "checkbox",
  "radio",
  "combobox",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "tab",
  "slider",
  "spinbutton",
  "switch",
  "searchbox",
  "treeitem",
]);

// =============================================================================
// TOOL IMPLEMENTATION
// =============================================================================

export function createWidgetSnapshotTool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Capture a compact accessibility tree snapshot of a widget. Returns structured " +
      "roles, names, and states - much smaller than full DOM. Includes locator hints " +
      "for easy element targeting. Ideal for LLM context efficiency.",
    input: widgetSnapshotInputSchema,
    output: widgetSnapshotOutputSchema,
    handler: async (input): Promise<WidgetSnapshotOutput> => {
      const sessionManager = connectionManager.getWidgetSessionManager();
      const session = sessionManager.getSession(input.sessionId);

      if (!session) {
        return {
          success: false,
          error: `Session not found: ${input.sessionId}`,
        };
      }

      if (session.page.isClosed()) {
        return {
          success: false,
          error: "Page closed",
        };
      }

      try {
        // Target the widget iframe
        const frame = session.page.frame({ url: /\/widget\// });
        if (!frame) {
          return {
            success: false,
            error: "Widget iframe not found",
          };
        }

        // Get accessibility tree using Playwright's ariaSnapshot() API
        // This returns a YAML representation of the accessibility tree
        const ariaSnapshot = await frame.locator("body").ariaSnapshot();

        if (!ariaSnapshot) {
          return {
            success: false,
            error: "Failed to capture accessibility tree - page may be empty or inaccessible",
          };
        }

        // Parse the YAML snapshot into a structured tree
        const rawTree = parseAriaSnapshot(ariaSnapshot);

        if (!rawTree) {
          return {
            success: false,
            error: "Failed to parse accessibility tree from YAML snapshot",
          };
        }

        // Transform and annotate the tree with indices and locator hints
        let nodeIndex = 0;
        const interactiveElements: InteractiveElementSummary[] = [];
        const filterRolesSet = input.filterRoles ? new Set(input.filterRoles) : null;

        const transformNode = (
          node: Record<string, unknown>,
          depth: number
        ): AccessibilityNode | null => {
          // Check max depth
          if (input.maxDepth !== undefined && depth > input.maxDepth) {
            return null;
          }

          const role = (node.role as string) || "generic";
          const name = (node.name as string) || "";

          // Filter by roles if specified
          if (filterRolesSet && !filterRolesSet.has(role)) {
            // Still process children to find matching roles deeper in tree
            const childNodes = node.children as Record<string, unknown>[] | undefined;
            if (childNodes && childNodes.length > 0) {
              const children = childNodes
                .map((child) => transformNode(child, depth + 1))
                .filter((n): n is AccessibilityNode => n !== null);

              // Return a wrapper node if there are matching children
              if (children.length > 0) {
                return {
                  role: "group",
                  name: "",
                  nodeIndex: -1,
                  children,
                };
              }
            }
            return null;
          }

          const currentIndex = nodeIndex++;

          // Generate locator hint
          const locatorHint = generateLocatorHint(role, name, node);

          const transformed: AccessibilityNode = {
            role,
            name,
            nodeIndex: currentIndex,
          };

          // Add locator hint if available
          if (locatorHint) {
            transformed.locatorHint = locatorHint;
          }

          // Add optional properties if present
          if (node.value !== undefined) {
            transformed.value = node.value as string;
          }
          if (node.description) {
            transformed.description = node.description as string;
          }
          if (node.focused === true) {
            transformed.focused = true;
          }
          if (node.checked !== undefined) {
            transformed.checked = node.checked as boolean | "mixed";
          }
          if (node.disabled === true) {
            transformed.disabled = true;
          }
          if (node.expanded !== undefined) {
            transformed.expanded = node.expanded as boolean;
          }
          if (node.selected === true) {
            transformed.selected = true;
          }
          if (node.required === true) {
            transformed.required = true;
          }
          if (node.level !== undefined) {
            transformed.level = node.level as number;
          }

          // Track interactive elements for the flat list
          if (INTERACTIVE_ROLES.has(role)) {
            interactiveElements.push({
              nodeIndex: currentIndex,
              role,
              name,
              locatorHint,
            });
          }

          // Process children
          const childNodes = node.children as Record<string, unknown>[] | undefined;
          if (childNodes && childNodes.length > 0) {
            const children = childNodes
              .map((child) => transformNode(child, depth + 1))
              .filter((n): n is AccessibilityNode => n !== null);

            if (children.length > 0) {
              transformed.children = children;
            }
          }

          return transformed;
        };

        const accessibilityTree = transformNode(rawTree, 0);

        // Optionally include DOM
        let dom: WidgetDOMSnapshot | undefined;
        if (input.includeDOM) {
          try {
            const [html, textContent] = await Promise.all([
              frame.content(),
              frame
                .locator("body")
                .textContent()
                .then((t) => t?.trim() ?? ""),
            ]);
            dom = { html, textContent };
          } catch {
            // DOM extraction failed, continue without it
          }
        }

        return {
          success: true,
          accessibilityTree: accessibilityTree ?? undefined,
          interactiveElementCount: interactiveElements.length,
          interactiveElements,
          dom,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: message,
        };
      }
    },
  });
}
