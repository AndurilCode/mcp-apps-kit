/**
 * get_connection_status tool
 *
 * Shows status for a specific connection or all connections.
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionRegistry } from "../connection-registry";
import type { ConnectionStatusOutput } from "../types";

export const getConnectionStatusInputSchema = z.object({
  connectionId: z
    .string()
    .optional()
    .describe("Connection ID. If omitted, returns status for all connections."),
});

const connectionStatusSchema = z.object({
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
});

export const getConnectionStatusOutputSchema = z.object({
  connections: z.array(connectionStatusSchema),
  activeConnectionId: z.string().nullable(),
});

interface ConnectionStatusWithId extends ConnectionStatusOutput {
  id: string;
}

interface StatusOutput {
  connections: ConnectionStatusWithId[];
  activeConnectionId: string | null;
}

export function createGetConnectionStatusTool(registry: ConnectionRegistry) {
  return defineTool({
    description:
      "Get connection status. If connectionId is provided, shows that connection. Otherwise shows all connections.",
    input: getConnectionStatusInputSchema,
    output: getConnectionStatusOutputSchema,
    handler: async (input): Promise<StatusOutput> => {
      if (input.connectionId) {
        const connectionManager = registry.resolveConnection(input.connectionId);
        const state = connectionManager.getState();
        return {
          connections: [
            {
              id: connectionManager.id,
              connected: state.connected,
              serverUrl: state.serverUrl,
              serverInfo: state.serverInfo,
              historyEnabled: state.historyEnabled,
              callCount: state.callCount,
            },
          ],
          activeConnectionId: input.connectionId,
        };
      }

      // Return all connections
      const allConnections = registry.listConnections();
      return {
        connections: allConnections,
        activeConnectionId: null,
      };
    },
  });
}
