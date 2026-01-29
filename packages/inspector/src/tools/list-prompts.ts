/**
 * list_prompts tool
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionRegistry } from "../connection-registry";
import type { PromptInfo } from "../types";

export const listPromptsInputSchema = z.object({
  connectionId: z.string().optional().describe("Connection ID. Defaults to active connection."),
});

export const listPromptsOutputSchema = z.object({
  prompts: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
    })
  ),
});

export function createListPromptsTool(registry: ConnectionRegistry) {
  return defineTool({
    description: "List all prompts available on the connected MCP server.",
    input: listPromptsInputSchema,
    output: listPromptsOutputSchema,
    handler: async (input): Promise<{ prompts: PromptInfo[] }> => {
      const connectionManager = registry.resolveConnection(input.connectionId);
      const client = connectionManager.getClient();

      try {
        const prompts = await client.listPrompts();

        return {
          prompts: prompts.map((prompt) => ({
            name: prompt.name,
            description: prompt.description,
          })),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to list prompts: ${message}`);
      }
    },
  });
}
