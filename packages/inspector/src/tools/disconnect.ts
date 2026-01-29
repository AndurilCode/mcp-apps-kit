/**
 * disconnect tool
 *
 * Closes a connection via the ConnectionRegistry.
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionRegistry } from "../connection-registry";
import type { DisconnectOutput } from "../types";

export const disconnectInputSchema = z.object({
  connectionId: z
    .string()
    .optional()
    .describe("Connection ID to disconnect. Defaults to active connection."),
});

export const disconnectOutputSchema = z.object({
  disconnected: z.boolean(),
  connectionId: z.string(),
  previousUrl: z.string().nullable(),
});

export interface DisconnectOutputWithId extends DisconnectOutput {
  connectionId: string;
}

export function createDisconnectTool(registry: ConnectionRegistry) {
  return defineTool({
    description:
      "Disconnect from an MCP server. If no connectionId is provided, disconnects the active connection.",
    input: disconnectInputSchema,
    output: disconnectOutputSchema,
    handler: async (input): Promise<DisconnectOutputWithId> => {
      const connectionManager = registry.resolveConnection(input.connectionId);
      const id = connectionManager.id;
      const previousUrl = connectionManager.getState().serverUrl;

      await registry.closeConnection(id);

      return {
        disconnected: true,
        connectionId: id,
        previousUrl,
      };
    },
  });
}
