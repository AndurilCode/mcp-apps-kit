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
  ToolHints,
} from "../types";
// validateWidgetSession helper is available in ./helpers for session validation refactoring

// =============================================================================
// SCHEMAS
// =============================================================================

export const widgetSnapshotInputSchema = z.object({
  sessionId: z.string().describe("Session ID of the widget"),
  includeDOM: z.boolean().optional().describe("Include full DOM HTML as well (default: false)"),
  compactDOM: z
    .boolean()
    .optional()
    .describe(
      "Strip inline styles from DOM output for readability (default: false). Only applies when includeDOM=true."
    ),
  filterRoles: z
    .array(z.string())
    .optional()
    .describe("Filter to specific ARIA roles (e.g., ['button', 'textbox'])"),
  maxDepth: z.number().optional().describe("Maximum tree depth (default: unlimited)"),
});

const toolHintsSchema = z.object({
  next: z.string().optional(),
  alternatives: z.array(z.string()).optional(),
  warning: z.string().optional(),
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
  hints: toolHintsSchema.optional(),
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
    // Match multiple ARIA snapshot formats:
    // Format 1: - role "name"           (buttons, links with quoted names)
    // Format 2: - role: "content"       (text nodes with colon + quoted content)
    // Format 3: - role: content         (text nodes with colon + unquoted content)
    // Format 4: - role [attrs]          (roles without names, just attributes)
    const match = line.match(/^(\s*)-\s*(\w+)(?:(?:\s+"([^"]*)")|(?::\s*"?([^"[\]]*?)"?))?(.*)$/);
    if (!match) return null;

    const [, spaces, role, quotedName, colonContent, rest = ""] = match;
    if (!role) return null;
    const indent = spaces?.length ?? 0;
    const attrs = parseAttributes(rest);

    // Prefer quoted name, then colon content (trimmed), then empty string
    const name = quotedName ?? colonContent?.trim() ?? "";

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
      "for easy element targeting. Save the accessibilityTree result to pass to " +
      "widget_snapshot_diff after interactions.",
    input: widgetSnapshotInputSchema,
    output: widgetSnapshotOutputSchema,
    handler: async (input): Promise<WidgetSnapshotOutput> => {
      const sessionManager = connectionManager.getWidgetSessionManager();
      const session = sessionManager.getSession(input.sessionId);

      if (!session) {
        return {
          success: false,
          error: `Session not found: ${input.sessionId}`,
          hints: {
            next: "Create a new session with preview_ui or call_tool(renderWidget=true)",
          },
        };
      }

      if (session.page.isClosed()) {
        return {
          success: false,
          error: "Page closed",
          hints: {
            next: "Create a new session with preview_ui or call_tool(renderWidget=true)",
          },
        };
      }

      try {
        // Target the widget iframe
        const frame = session.page.frame({ url: /\/widget\// });
        if (!frame) {
          return {
            success: false,
            error: "Widget iframe not found",
            hints: {
              next: "Wait for widget to load, or verify session is valid",
              warning: "Widget may still be loading",
            },
          };
        }

        // Get accessibility tree using Playwright's ariaSnapshot() API
        // This returns a YAML representation of the accessibility tree
        const ariaSnapshot = await frame.locator("body").ariaSnapshot();

        if (!ariaSnapshot) {
          return {
            success: false,
            error: "Failed to capture accessibility tree - page may be empty or inaccessible",
            hints: {
              next: "Widget may be loading. Wait and retry, or use widget_query with text search.",
            },
          };
        }

        // Parse the YAML snapshot into a structured tree
        const rawTree = parseAriaSnapshot(ariaSnapshot);

        if (!rawTree) {
          return {
            success: false,
            error: "Failed to parse accessibility tree from YAML snapshot",
            hints: {
              next: "Widget may have non-standard structure. Try widget_query with text search.",
            },
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

        // Cache the snapshot for widget_snapshot_diff auto-comparison
        session.lastSnapshot = accessibilityTree;
        session.lastSnapshotTimestamp = Date.now();

        // Optionally include DOM
        let dom: WidgetDOMSnapshot | undefined;
        if (input.includeDOM) {
          try {
            let [html, textContent] = await Promise.all([
              frame.content(),
              frame
                .locator("body")
                .textContent()
                .then((t) => t?.trim() ?? ""),
            ]);

            // Apply compact mode: strip inline styles for readability
            if (input.compactDOM) {
              // Strip inline style attributes only
              html = html.replace(/\s+style="[^"]*"/gi, "");
              // Collapse excessive whitespace between tags (but preserve structure)
              html = html.replace(/>\s{2,}</g, ">\n<");
            }

            dom = { html, textContent };
          } catch {
            // DOM extraction failed, continue without it
          }
        }

        // Check for accessibility issues
        const emptyNameCount = interactiveElements.filter(
          (el) => !el.name || el.name.trim() === ""
        ).length;

        // Find duplicate role+name pairs
        const roleNameCounts = new Map<string, number>();
        for (const el of interactiveElements) {
          const key = `${el.role}:${el.name}`;
          roleNameCounts.set(key, (roleNameCounts.get(key) ?? 0) + 1);
        }
        const duplicateRoleNames = Array.from(roleNameCounts.entries())
          .filter(([, count]) => count > 1)
          .map(([key, count]) => {
            const [role, name] = key.split(":");
            return { role: role ?? "", name: name ?? "", count };
          });

        // Build contextual hints based on what was found
        let hints: ToolHints;
        if (interactiveElements.length > 0) {
          hints = {
            next: "Save accessibilityTree to pass to widget_snapshot_diff after interactions. Use widget_click/widget_fill with the locatorHint.",
          };

          // Add accessibility warnings if issues detected
          const warnings: string[] = [];
          if (emptyNameCount > 0) {
            warnings.push(`${emptyNameCount} interactive element(s) have empty accessible names`);
          }
          if (duplicateRoleNames.length > 0) {
            const example = duplicateRoleNames[0];
            warnings.push(
              `${duplicateRoleNames.length} role+name pair(s) are duplicated (e.g., ${example?.role}:"${example?.name}" appears ${example?.count} times)`
            );
          }

          if (warnings.length > 0) {
            hints.warning = `Accessibility issues detected: ${warnings.join("; ")}`;
            hints.alternatives = [
              "Use widget_query with CSS selectors for more precise targeting",
              "Consider adding data-testid attributes to the widget for reliable automation",
            ];
          }
        } else {
          hints = {
            next: "No interactive elements found. Widget may be display-only or still loading.",
            alternatives: [
              "Try widget_query with text search",
              "Wait and retry if content is loading",
            ],
            warning: "If expecting buttons/inputs, widget may still be loading",
          };
        }

        return {
          success: true,
          accessibilityTree: accessibilityTree ?? undefined,
          interactiveElementCount: interactiveElements.length,
          interactiveElements,
          dom,
          hints,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: message,
          hints: {
            next: "Try widget_query with text search, or create a new session",
          },
        };
      }
    },
  });
}
