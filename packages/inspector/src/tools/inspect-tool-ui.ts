/**
 * inspect_tool_ui tool
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "../connection";
import type { InspectToolUIOutput, UIBinding } from "../types";

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
    // Infer visibility from openai/visibility
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

/**
 * Build MCP-format metadata from tool _meta
 */
function buildMcpMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!meta) return null;

  const uiMeta = meta.ui as Record<string, unknown> | undefined;
  const flatResourceUri = meta["ui/resourceUri"] as string | undefined;

  // Check if there's any MCP-style UI metadata
  if (!uiMeta && !flatResourceUri) return null;

  return {
    _meta: {
      ui: uiMeta ?? {
        resourceUri: flatResourceUri,
        visibility: meta["ui/visibility"],
      },
    },
  };
}

/**
 * Build OpenAI-format metadata from tool _meta
 */
function buildOpenaiMeta(
  meta: Record<string, unknown> | undefined
): Record<string, unknown> | null {
  if (!meta) return null;

  const result: Record<string, unknown> = {};

  // Check for OpenAI-style keys
  const openaiKeys = Object.keys(meta).filter((k) => k.startsWith("openai/"));
  if (openaiKeys.length > 0) {
    for (const key of openaiKeys) {
      result[key] = meta[key];
    }
    return { _meta: result };
  }

  // Convert MCP format to OpenAI format
  const uiMeta = meta.ui as Record<string, unknown> | undefined;
  const resourceUri = uiMeta?.resourceUri ?? (meta["ui/resourceUri"] as string | undefined);

  if (resourceUri) {
    const visibility = (uiMeta?.visibility ?? meta["ui/visibility"]) as string[] | undefined;

    // Map visibility to OpenAI format
    result["openai/visibility"] =
      visibility?.includes("model") || !visibility ? "public" : "private";
    result["openai/widgetAccessible"] = visibility?.includes("app") ?? false;
    result["openai/outputTemplate"] = resourceUri;

    return { _meta: result };
  }

  return null;
}

export const inspectToolUIInputSchema = z.object({
  toolName: z.string().describe("Name of the tool to inspect for UI binding"),
});

export const inspectToolUIOutputSchema = z.object({
  toolName: z.string(),
  hasUI: z.boolean(),
  uiBinding: z
    .object({
      resourceUri: z.string(),
      visibility: z.array(z.string()),
    })
    .nullable(),
  mcpMeta: z.record(z.string(), z.unknown()).nullable(),
  openaiMeta: z.record(z.string(), z.unknown()).nullable(),
});

export function createInspectToolUITool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Inspect a tool's UI binding and metadata. Returns the tool's resource URI, visibility settings, and metadata in both MCP Apps and OpenAI formats.",
    input: inspectToolUIInputSchema,
    output: inspectToolUIOutputSchema,
    handler: async (input): Promise<InspectToolUIOutput> => {
      const client = connectionManager.getClient();
      const rawClient = client.raw;

      // List tools to find the requested tool
      const toolsResult = await rawClient.listTools();
      const tool = toolsResult.tools.find((t) => t.name === input.toolName);

      if (!tool) {
        throw new Error(`Tool not found: ${input.toolName}`);
      }

      const meta = tool._meta;
      const uiBinding = extractUIBinding(meta);

      return {
        toolName: input.toolName,
        hasUI: uiBinding !== null,
        uiBinding,
        mcpMeta: buildMcpMeta(meta),
        openaiMeta: buildOpenaiMeta(meta),
      };
    },
  });
}
