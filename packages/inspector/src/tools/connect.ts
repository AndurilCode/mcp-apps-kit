/**
 * connect_to_server tool
 *
 * Creates a new connection via the ConnectionRegistry.
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionRegistry } from "../connection-registry";
import type { ConnectOutput } from "../types";

export const connectOptionsSchema = z
  .object({
    trackHistory: z.boolean().optional().describe("Track call history. Default: true"),
    timeout: z.number().optional().describe("Connection timeout in ms. Default: 30000"),
  })
  .optional();

export const connectInputSchema = z.object({
  url: z
    .string()
    .describe("URL of the MCP server to connect to (e.g., http://localhost:3000/v1/mcp)"),
  options: connectOptionsSchema,
});

export const connectOutputSchema = z.object({
  connectionId: z.string().describe("Unique ID for this connection"),
  connected: z.boolean(),
  serverUrl: z.string(),
  serverInfo: z
    .object({
      name: z.string(),
      version: z.string(),
    })
    .nullable(),
  toolCount: z.number(),
  resourceCount: z.number(),
  promptCount: z.number(),
});

export interface ConnectOutputWithId extends ConnectOutput {
  connectionId: string;
}

export function createConnectTool(registry: ConnectionRegistry) {
  return defineTool({
    description:
      "Connect to a target MCP server. Creates a new connection and returns a connectionId that can be used with other tools. Multiple simultaneous connections are supported.",
    input: connectInputSchema,
    output: connectOutputSchema,
    handler: async (input): Promise<ConnectOutputWithId> => {
      try {
        const { id, connectionManager } = await registry.createConnection(input.url, input.options);

        const schema = connectionManager.getTargetSchema();

        return {
          connectionId: id,
          connected: true,
          serverUrl: input.url,
          serverInfo: connectionManager.getState().serverInfo,
          toolCount: schema?.tools.length ?? 0,
          resourceCount: schema?.resources.length ?? 0,
          promptCount: schema?.prompts.length ?? 0,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes("ECONNREFUSED")) {
          throw new Error(`Connection refused: ECONNREFUSED ${input.url}`);
        }
        if (message.includes("timeout") || message.includes("Timeout")) {
          const timeout = input.options?.timeout ?? 30000;
          throw new Error(`Connection timeout after ${timeout}ms to ${input.url}`);
        }
        if (message.includes("Invalid URL")) {
          throw new Error(message);
        }
        if (message.includes("Max connections limit")) {
          throw new Error(message);
        }

        throw new Error(`Failed to connect to ${input.url}: ${message}`);
      }
    },
  });
}
