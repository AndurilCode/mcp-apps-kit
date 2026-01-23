/**
 * list_tools tool
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "../connection";
import type { ToolInfo } from "../types";

export const listToolsInputSchema = z.object({}).describe("No input required");

export const listToolsOutputSchema = z.object({
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      inputSchema: z.record(z.string(), z.unknown()).optional(),
    })
  ),
});

export function createListToolsTool(connectionManager: ConnectionManager) {
  return defineTool({
    description: "List all tools available on the connected MCP server.",
    input: listToolsInputSchema,
    output: listToolsOutputSchema,
    handler: async (): Promise<{ tools: ToolInfo[] }> => {
      const client = connectionManager.getClient();
      const tools = await client.listTools();

      return {
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    },
  });
}
