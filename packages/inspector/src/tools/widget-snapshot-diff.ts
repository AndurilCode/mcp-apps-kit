/**
 * Widget Snapshot Diff Tool
 *
 * Compares two accessibility tree snapshots to identify added and removed elements.
 * Useful for tracking UI changes after user interactions.
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "../connection";
import type {
  ToolHints,
  AccessibilityNode,
  ElementChange,
  CountChange,
  SnapshotDiffSummary,
  WidgetSnapshotDiffOutput,
} from "../types";

// =============================================================================
// SCHEMAS
// =============================================================================

export const widgetSnapshotDiffInputSchema = z.object({
  sessionId: z.string().describe("Session ID of the widget"),
  previousSnapshot: z
    .unknown()
    .optional()
    .describe(
      "Previous accessibility tree to compare against. If omitted, uses the last cached snapshot from widget_snapshot."
    ),
});

const toolHintsSchema = z.object({
  next: z.string().optional(),
  alternatives: z.array(z.string()).optional(),
  warning: z.string().optional(),
});

export const widgetSnapshotDiffOutputSchema = z.object({
  success: z.boolean(),
  changes: z
    .object({
      added: z
        .array(
          z.object({
            role: z.string(),
            name: z.string(),
            nodeIndex: z.number().optional(),
          })
        )
        .optional(),
      removed: z
        .array(
          z.object({
            role: z.string(),
            name: z.string(),
          })
        )
        .optional(),
      countChanges: z
        .array(
          z.object({
            role: z.string(),
            name: z.string(),
            previousCount: z.number(),
            currentCount: z.number(),
          })
        )
        .optional(),
    })
    .optional(),
  summary: z
    .object({
      previousTotal: z.number(),
      currentTotal: z.number(),
      added: z.number(),
      removed: z.number(),
      unchanged: z.number(),
    })
    .optional(),
  unchanged: z.number().optional(),
  currentSnapshot: z.unknown().optional(),
  usedCachedSnapshot: z
    .boolean()
    .optional()
    .describe("Whether the cached snapshot was used instead of explicit previousSnapshot"),
  cachedSnapshotAge: z
    .number()
    .optional()
    .describe("Age of the cached snapshot in milliseconds (only when usedCachedSnapshot=true)"),
  error: z.string().optional(),
  hints: toolHintsSchema.optional(),
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a unique key for an element based on role and name
 */
function elementKey(role: string, name: string): string {
  return `${role}:${name}`;
}

/**
 * Tree stats for counting elements
 */
interface TreeStats {
  /** Set of unique role:name keys */
  keys: Set<string>;
  /** Map of keys to node info (first occurrence) */
  nodeMap: Map<string, { role: string; name: string; nodeIndex: number }>;
  /** Count of each role:name pair */
  countMap: Map<string, number>;
  /** Total number of nodes */
  totalCount: number;
}

/**
 * Flatten an accessibility tree into stats for comparison
 */
function flattenTree(node: AccessibilityNode | null | undefined): TreeStats {
  const stats: TreeStats = {
    keys: new Set(),
    nodeMap: new Map(),
    countMap: new Map(),
    totalCount: 0,
  };

  function traverse(n: AccessibilityNode | null | undefined): void {
    if (!n) return;

    stats.totalCount++;
    const key = elementKey(n.role, n.name);
    stats.keys.add(key);

    // Track count for this role:name pair
    stats.countMap.set(key, (stats.countMap.get(key) ?? 0) + 1);

    // Store the first occurrence with its nodeIndex for added element tracking
    if (!stats.nodeMap.has(key)) {
      stats.nodeMap.set(key, {
        role: n.role,
        name: n.name,
        nodeIndex: n.nodeIndex,
      });
    }

    // Process children
    if (n.children) {
      for (const child of n.children) {
        traverse(child);
      }
    }
  }

  traverse(node);
  return stats;
}

/**
 * Check if an object looks like an accessibility node
 */
function isAccessibilityNode(obj: unknown): obj is AccessibilityNode {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "role" in obj &&
    typeof (obj as Record<string, unknown>).role === "string"
  );
}

/**
 * Parse the YAML aria snapshot into structured format
 * (same as widget-snapshot.ts)
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
    // Match multiple ARIA snapshot formats (same as widget-snapshot.ts)
    const match = line.match(/^(\s*)-\s*(\w+)(?:(?:\s+"([^"]*)")|(?::\s*"?([^"[\]]*?)"?))?(.*)$/);
    if (!match) return null;

    const [, spaces, role, quotedName, colonContent, rest = ""] = match;
    if (!role) return null;
    const indent = spaces?.length ?? 0;
    const attrs = parseAttributes(rest);
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

  const root: ParsedNode = { role: "root", name: "", children: [] };
  const stack: { indent: number; node: ParsedNode }[] = [{ indent: -2, node: root }];

  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) continue;

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

  if (root.children?.length === 1) {
    return root.children[0] as unknown as Record<string, unknown>;
  }
  return root as unknown as Record<string, unknown>;
}

/**
 * Transform raw tree into indexed AccessibilityNode
 */
function indexTree(node: Record<string, unknown>, counter: { index: number }): AccessibilityNode {
  const role = (node.role as string) || "generic";
  const name = (node.name as string) || "";
  const currentIndex = counter.index++;

  const result: AccessibilityNode = {
    role,
    name,
    nodeIndex: currentIndex,
  };

  const childNodes = node.children as Record<string, unknown>[] | undefined;
  if (childNodes && childNodes.length > 0) {
    result.children = childNodes.map((child) => indexTree(child, counter));
  }

  return result;
}

// =============================================================================
// TOOL IMPLEMENTATION
// =============================================================================

export function createWidgetSnapshotDiffTool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Compare the current widget accessibility tree with a previous snapshot. " +
      "Returns added and removed elements by role+name, plus count changes for elements with duplicate names. " +
      "Ideal for verifying UI changes after interactions.",
    input: widgetSnapshotDiffInputSchema,
    output: widgetSnapshotDiffOutputSchema,
    handler: async (input): Promise<WidgetSnapshotDiffOutput> => {
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

      // Determine which snapshot to use (explicit or cached)
      let previousSnapshot: unknown;
      let usedCachedSnapshot = false;
      let cachedSnapshotAge: number | undefined;

      if (input.previousSnapshot !== undefined) {
        // Use explicit previousSnapshot
        previousSnapshot = input.previousSnapshot;
      } else if (session.lastSnapshot && session.lastSnapshotTimestamp) {
        // Use cached snapshot
        previousSnapshot = session.lastSnapshot;
        usedCachedSnapshot = true;
        cachedSnapshotAge = Date.now() - session.lastSnapshotTimestamp;
      } else {
        return {
          success: false,
          error:
            "No previous snapshot available. Call widget_snapshot first, or provide previousSnapshot explicitly.",
          hints: {
            next: "Call widget_snapshot to capture the current state before making changes",
          },
        };
      }

      // Validate previous snapshot
      if (!isAccessibilityNode(previousSnapshot)) {
        return {
          success: false,
          error: "Invalid previousSnapshot: must be an accessibility tree from widget_snapshot",
          hints: {
            next: "Call widget_snapshot first to get a valid accessibility tree, then pass accessibilityTree as previousSnapshot",
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

        // Get current accessibility tree
        const ariaSnapshot = await frame.locator("body").ariaSnapshot();

        if (!ariaSnapshot) {
          return {
            success: false,
            error: "Failed to capture accessibility tree - page may be empty or inaccessible",
            hints: {
              next: "Widget may be loading. Wait and retry.",
            },
          };
        }

        const rawTree = parseAriaSnapshot(ariaSnapshot);

        if (!rawTree) {
          return {
            success: false,
            error: "Failed to parse accessibility tree from YAML snapshot",
            hints: {
              next: "Widget may have non-standard structure.",
            },
          };
        }

        // Index the current tree
        const currentTree = indexTree(rawTree, { index: 0 });

        // Flatten both trees for comparison
        const previousStats = flattenTree(previousSnapshot);
        const currentStats = flattenTree(currentTree);

        // Compute diff
        const added: ElementChange[] = [];
        const removed: ElementChange[] = [];
        const countChanges: CountChange[] = [];

        // Find added elements (in current but not in previous)
        for (const key of currentStats.keys) {
          if (!previousStats.keys.has(key)) {
            const node = currentStats.nodeMap.get(key);
            if (node) {
              added.push({
                role: node.role,
                name: node.name,
                nodeIndex: node.nodeIndex,
              });
            }
          }
        }

        // Find removed elements (in previous but not in current)
        for (const key of previousStats.keys) {
          if (!currentStats.keys.has(key)) {
            const node = previousStats.nodeMap.get(key);
            if (node) {
              removed.push({
                role: node.role,
                name: node.name,
              });
            }
          }
        }

        // Find count changes for elements that exist in both (handles duplicates)
        for (const key of currentStats.keys) {
          if (previousStats.keys.has(key)) {
            const prevCount = previousStats.countMap.get(key) ?? 0;
            const currCount = currentStats.countMap.get(key) ?? 0;
            if (prevCount !== currCount) {
              const node = currentStats.nodeMap.get(key);
              if (node) {
                countChanges.push({
                  role: node.role,
                  name: node.name,
                  previousCount: prevCount,
                  currentCount: currCount,
                });
              }
            }
          }
        }

        // Count unchanged (unique keys present in both)
        let unchanged = 0;
        for (const key of currentStats.keys) {
          if (previousStats.keys.has(key)) {
            unchanged++;
          }
        }

        // Build summary
        const summary: SnapshotDiffSummary = {
          previousTotal: previousStats.totalCount,
          currentTotal: currentStats.totalCount,
          added: added.length,
          removed: removed.length,
          unchanged,
        };

        // Build hints based on what changed
        let hints: ToolHints;
        const totalChanges = added.length + removed.length;
        const hasCountChanges = countChanges.length > 0;

        if (totalChanges === 0 && !hasCountChanges) {
          // Check if total counts differ even without unique key changes
          if (summary.previousTotal !== summary.currentTotal) {
            hints = {
              next: `Total element count changed from ${summary.previousTotal} to ${summary.currentTotal}. Use widget_query to inspect specific elements.`,
            };
          } else {
            hints = {
              next: "No changes detected. Widget state is unchanged since previous snapshot.",
            };
          }
        } else if (hasCountChanges && totalChanges === 0) {
          // Only count changes (duplicate elements added/removed)
          const countHints = countChanges
            .map((c) => {
              const diff = c.currentCount - c.previousCount;
              return `${diff > 0 ? "+" : ""}${diff} ${c.role}:"${c.name}"`;
            })
            .join(", ");
          hints = {
            next: `Count changes detected: ${countHints}. Use widget_query to inspect specific elements.`,
          };
        } else if (added.length > 0 && removed.length === 0) {
          hints = {
            next: `${added.length} new element(s) appeared. Use widget_click/widget_fill to interact with them.`,
          };
        } else if (removed.length > 0 && added.length === 0) {
          hints = {
            next: `${removed.length} element(s) were removed. Widget content has changed.`,
          };
        } else {
          hints = {
            next: `${added.length} added, ${removed.length} removed. Widget structure has changed significantly.`,
          };
        }

        // Update the cached snapshot for future diffs
        session.lastSnapshot = currentTree;
        session.lastSnapshotTimestamp = Date.now();

        return {
          success: true,
          changes: {
            added: added.length > 0 ? added : undefined,
            removed: removed.length > 0 ? removed : undefined,
            countChanges: countChanges.length > 0 ? countChanges : undefined,
          },
          summary,
          unchanged,
          currentSnapshot: currentTree,
          usedCachedSnapshot: usedCachedSnapshot || undefined,
          cachedSnapshotAge: cachedSnapshotAge,
          hints,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: message,
          hints: {
            next: "Try widget_snapshot to capture current state.",
          },
        };
      }
    },
  });
}
