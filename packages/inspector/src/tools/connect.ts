/**
 * connect_to_server tool
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "../connection";
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
  force: z
    .boolean()
    .optional()
    .describe("Force reconnection if already connected to a different server"),
});

export const connectOutputSchema = z.object({
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

export function createConnectTool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Connect to a target MCP server. This establishes a connection that can be used to list and call tools, resources, and prompts on the target server.",
    input: connectInputSchema,
    output: connectOutputSchema,
    handler: async (input): Promise<ConnectOutput> => {
      try {
        // Check if already connected
        const currentState = connectionManager.getState();
        if (currentState.connected && currentState.serverUrl) {
          // If already connected to the same URL, return success silently
          if (currentState.serverUrl === input.url) {
            const schema = connectionManager.getTargetSchema();
            return {
              connected: true,
              serverUrl: input.url,
              serverInfo: currentState.serverInfo,
              toolCount: schema?.tools.length ?? 0,
              resourceCount: schema?.resources.length ?? 0,
              promptCount: schema?.prompts.length ?? 0,
            };
          }

          // If already connected to a different URL without force, throw error
          if (!input.force) {
            throw new Error(
              `Already connected to ${currentState.serverUrl}. Use force=true to disconnect and connect to ${input.url}.`
            );
          }
          // If force=true, disconnect first (handled by connectionManager.connect)
        }

        const result = await connectionManager.connect(input.url, input.options);

        return {
          connected: true,
          serverUrl: input.url,
          serverInfo: result.serverInfo,
          toolCount: result.toolCount,
          resourceCount: result.resourceCount,
          promptCount: result.promptCount,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // Handle specific error types
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

        throw new Error(`Failed to connect to ${input.url}: ${message}`);
      }
    },
  });
}
