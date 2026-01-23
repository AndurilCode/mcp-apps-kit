/**
 * get_prompt tool
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "../connection";
import type { GetPromptOutput } from "../types";

export const getPromptInputSchema = z.object({
  name: z.string().describe("Name of the prompt to retrieve"),
  arguments: z
    .record(z.string(), z.string())
    .optional()
    .describe("Arguments to pass to the prompt"),
});

export const getPromptOutputSchema = z.object({
  description: z.string().optional(),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.object({
        type: z.enum(["text", "image", "resource"]),
        text: z.string().optional(),
        data: z.string().optional(),
        mimeType: z.string().optional(),
      }),
    })
  ),
});

export function createGetPromptTool(connectionManager: ConnectionManager) {
  return defineTool({
    description: "Get a prompt from the connected MCP server by name, optionally with arguments.",
    input: getPromptInputSchema,
    output: getPromptOutputSchema,
    handler: async (input): Promise<GetPromptOutput> => {
      const client = connectionManager.getClient();

      try {
        const result = await client.getPrompt(input.name, input.arguments);

        return {
          description: result.description,
          messages: result.messages.map((message) => ({
            role: message.role,
            content: {
              type: message.content.type,
              text: message.content.text,
              data: message.content.data,
              mimeType: message.content.mimeType,
            },
          })),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // Check for not found
        if (message.includes("not found") || message.includes("Not found")) {
          throw new Error(`Prompt not found: ${input.name}`);
        }

        // Check for missing arguments
        if (message.includes("required") || message.includes("argument")) {
          throw new Error(`Missing required argument for prompt '${input.name}': ${message}`);
        }

        throw new Error(`Failed to get prompt '${input.name}': ${message}`);
      }
    },
  });
}
