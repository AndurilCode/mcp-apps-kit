/**
 * list_resources tool
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionRegistry } from "../connection-registry";
import type { ResourceInfo } from "../types";

export const listResourcesInputSchema = z.object({
  connectionId: z.string().optional().describe("Connection ID. Defaults to active connection."),
});

export const listResourcesOutputSchema = z.object({
  resources: z.array(
    z.object({
      uri: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
    })
  ),
});

export function createListResourcesTool(registry: ConnectionRegistry) {
  return defineTool({
    description: "List all resources available on the connected MCP server.",
    input: listResourcesInputSchema,
    output: listResourcesOutputSchema,
    handler: async (input): Promise<{ resources: ResourceInfo[] }> => {
      const connectionManager = registry.resolveConnection(input.connectionId);
      const client = connectionManager.getClient();
      const resources = await client.listResources();

      return {
        resources: resources.map((resource) => ({
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
        })),
      };
    },
  });
}
