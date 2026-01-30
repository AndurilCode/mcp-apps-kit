/**
 * list_connections tool
 *
 * Lists all active connections managed by the ConnectionRegistry.
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionRegistry, ConnectionInfo } from "../connection-registry";

/**
 * Zod schema for list connections tool input.
 */
export const listConnectionsInputSchema = z.object({});

/**
 * Zod schema for list connections tool output.
 */
export const listConnectionsOutputSchema = z.object({
  connections: z.array(
    z.object({
      id: z.string(),
      connected: z.boolean(),
      serverUrl: z.string().nullable(),
      serverInfo: z
        .object({
          name: z.string(),
          version: z.string(),
        })
        .nullable(),
      historyEnabled: z.boolean(),
      callCount: z.number(),
    })
  ),
  count: z.number(),
});

interface ListConnectionsOutput {
  connections: ConnectionInfo[];
  count: number;
}

/**
 * Create the list connections tool bound to a registry instance.
 *
 * @param registry - Connection registry to query.
 * @returns A configured MCP tool definition.
 */
export function createListConnectionsTool(registry: ConnectionRegistry) {
  return defineTool({
    description: "List all active MCP server connections with their status and server info.",
    input: listConnectionsInputSchema,
    output: listConnectionsOutputSchema,
    handler: async (): Promise<ListConnectionsOutput> => {
      const connections = registry.listConnections();
      return {
        connections,
        count: connections.length,
      };
    },
  });
}
