/**
 * list_prompts tool
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "../connection";
import type { PromptInfo } from "../types";

export const listPromptsInputSchema = z.object({}).describe("No input required");

export const listPromptsOutputSchema = z.object({
  prompts: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
    })
  ),
});

export function createListPromptsTool(connectionManager: ConnectionManager) {
  return defineTool({
    description: "List all prompts available on the connected MCP server.",
    input: listPromptsInputSchema,
    output: listPromptsOutputSchema,
    handler: async (): Promise<{ prompts: PromptInfo[] }> => {
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
