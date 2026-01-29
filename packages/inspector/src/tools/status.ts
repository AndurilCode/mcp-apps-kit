/**
 * get_connection_status tool
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "../connection";
import type { ConnectionStatusOutput } from "../types";

export const getConnectionStatusInputSchema = z.object({}).describe("No input required");

export const getConnectionStatusOutputSchema = z.object({
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

export function createGetConnectionStatusTool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Get the current connection status including server URL, server info, and history tracking state.",
    input: getConnectionStatusInputSchema,
    output: getConnectionStatusOutputSchema,
    handler: async (): Promise<ConnectionStatusOutput> => {
      const state = connectionManager.getState();

      return {
        connected: state.connected,
        serverUrl: state.serverUrl,
        serverInfo: state.serverInfo,
        historyEnabled: state.historyEnabled,
        callCount: state.callCount,
      };
    },
  });
}
