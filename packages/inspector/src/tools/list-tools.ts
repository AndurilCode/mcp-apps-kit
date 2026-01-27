/**
 * list_tools tool
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "../connection";
import type { ToolInfo, ToolHints } from "../types";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

interface UIBinding {
  resourceUri: string;
  visibility: string[];
}

/**
 * Extract UI binding from tool metadata
 */
function extractUIBinding(meta: Record<string, unknown> | undefined): UIBinding | null {
  if (!meta) return null;

  // MCP Apps format: _meta.ui.resourceUri + _meta.ui.visibility
  const uiMeta = meta.ui as Record<string, unknown> | undefined;
  if (uiMeta) {
    const resourceUri = uiMeta.resourceUri as string | undefined;
    const visibility = uiMeta.visibility as string[] | undefined;

    if (resourceUri) {
      return {
        resourceUri,
        visibility: visibility ?? ["model", "app"],
      };
    }
  }

  // Alternative MCP format: flat _meta["ui/resourceUri"]
  const flatResourceUri = meta["ui/resourceUri"] as string | undefined;
  if (flatResourceUri) {
    const flatVisibility = meta["ui/visibility"] as string[] | undefined;
    return {
      resourceUri: flatResourceUri,
      visibility: flatVisibility ?? ["model", "app"],
    };
  }

  // OpenAI format: _meta["openai/outputTemplate"]
  const openaiOutputTemplate = meta["openai/outputTemplate"] as string | undefined;
  if (openaiOutputTemplate) {
    const openaiVisibility = meta["openai/visibility"] as string | undefined;
    const widgetAccessible = meta["openai/widgetAccessible"] as boolean | undefined;

    const visibility: string[] = [];
    if (openaiVisibility === "public" || openaiVisibility === undefined) {
      visibility.push("model");
    }
    if (widgetAccessible === true) {
      visibility.push("app");
    }

    return {
      resourceUri: openaiOutputTemplate,
      visibility: visibility.length > 0 ? visibility : ["model"],
    };
  }

  return null;
}

// =============================================================================
// SCHEMAS
// =============================================================================

export const listToolsInputSchema = z.object({}).describe("No input required");

const toolHintsSchema = z.object({
  next: z.string().optional(),
  alternatives: z.array(z.string()).optional(),
  warning: z.string().optional(),
});

export const listToolsOutputSchema = z.object({
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      inputSchema: z.record(z.string(), z.unknown()).optional(),
      hasUI: z.boolean().optional(),
      visibility: z.array(z.string()).optional(),
    })
  ),
  hints: toolHintsSchema.optional(),
});

// =============================================================================
// TOOL OUTPUT TYPE
// =============================================================================

interface ListToolsToolInfo extends ToolInfo {
  hasUI?: boolean;
  visibility?: string[];
}

interface ListToolsOutput {
  tools: ListToolsToolInfo[];
  hints?: ToolHints;
}

// =============================================================================
// TOOL IMPLEMENTATION
// =============================================================================

export function createListToolsTool(connectionManager: ConnectionManager) {
  return defineTool({
    description: "List all tools available on the connected MCP server.",
    input: listToolsInputSchema,
    output: listToolsOutputSchema,
    handler: async (): Promise<ListToolsOutput> => {
      const client = connectionManager.getClient();
      const tools = await client.listTools();

      let widgetCount = 0;
      const mappedTools: ListToolsToolInfo[] = tools.map((tool) => {
        const uiBinding = extractUIBinding(tool._meta);
        if (uiBinding) widgetCount++;

        return {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          hasUI: uiBinding !== null,
          visibility: uiBinding?.visibility,
        };
      });

      // Build contextual hints based on whether widgets are available
      const hints: ToolHints =
        widgetCount > 0
          ? {
              next: "Tools with hasUI=true can be previewed with preview_ui or call_tool(renderWidget=true)",
            }
          : {
              next: "No tools have UI widgets. Use call_tool to execute them directly.",
            };

      return {
        tools: mappedTools,
        hints,
      };
    },
  });
}
