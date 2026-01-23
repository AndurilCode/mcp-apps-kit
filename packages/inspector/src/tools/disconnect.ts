/**
 * disconnect tool
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "../connection";
import type { DisconnectOutput } from "../types";

export const disconnectInputSchema = z.object({}).describe("No input required");

export const disconnectOutputSchema = z.object({
  disconnected: z.boolean(),
  previousUrl: z.string().nullable(),
});

export function createDisconnectTool(connectionManager: ConnectionManager) {
  return defineTool({
    description: "Disconnect from the currently connected MCP server.",
    input: disconnectInputSchema,
    output: disconnectOutputSchema,
    handler: async (): Promise<DisconnectOutput> => {
      const previousUrl = await connectionManager.disconnect();

      return {
        disconnected: true,
        previousUrl,
      };
    },
  });
}
