/**
 * list_ui_widgets tool
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionRegistry } from "../connection-registry";
import type { UIWidgetInfo, ListUIWidgetsOutput, UIProtocol } from "../types";

// MCP Apps MIME type
const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
// OpenAI Apps SDK MIME type
const OPENAI_MIME_TYPE = "text/html+skybridge";

/**
 * Detect protocol from MIME type
 */
function detectProtocol(mimeType: string | undefined): UIProtocol {
  if (!mimeType) return "unknown";
  if (mimeType === MCP_APP_MIME_TYPE) return "mcp-app";
  if (mimeType === OPENAI_MIME_TYPE) return "openai";
  return "unknown";
}

/**
 * Check if resource is a UI widget based on MIME type
 */
function isUIWidget(mimeType: string | undefined): boolean {
  return mimeType === MCP_APP_MIME_TYPE || mimeType === OPENAI_MIME_TYPE;
}

export const listUIWidgetsInputSchema = z.object({
  connectionId: z.string().optional().describe("Connection ID. Defaults to active connection."),
});

export const listUIWidgetsOutputSchema = z.object({
  widgets: z.array(
    z.object({
      uri: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      protocol: z.enum(["mcp-app", "openai", "unknown"]),
      mimeType: z.string(),
    })
  ),
  count: z.number(),
});

export function createListUIWidgetsTool(registry: ConnectionRegistry) {
  return defineTool({
    description:
      "List all UI widgets available on the connected MCP server. UI widgets are resources with specific MIME types (text/html;profile=mcp-app for MCP Apps or text/html+skybridge for OpenAI).",
    input: listUIWidgetsInputSchema,
    output: listUIWidgetsOutputSchema,
    handler: async (input): Promise<ListUIWidgetsOutput> => {
      const connectionManager = registry.resolveConnection(input.connectionId);
      const client = connectionManager.getClient();

      // Use raw client to get full resource info including mimeType
      const rawClient = client.raw;
      const resourcesResult = await rawClient.listResources();

      const widgets: UIWidgetInfo[] = [];

      for (const resource of resourcesResult.resources) {
        if (isUIWidget(resource.mimeType)) {
          widgets.push({
            uri: resource.uri,
            name: resource.name,
            description: resource.description,
            protocol: detectProtocol(resource.mimeType),
            mimeType: resource.mimeType ?? "unknown",
          });
        }
      }

      return {
        widgets,
        count: widgets.length,
      };
    },
  });
}
