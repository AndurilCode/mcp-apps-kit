/**
 * read_resource tool
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "../connection";
import type { ReadResourceOutput } from "../types";

export const readResourceInputSchema = z.object({
  uri: z.string().describe("URI of the resource to read"),
});

export const readResourceOutputSchema = z.object({
  contents: z.array(
    z.object({
      type: z.enum(["text", "image", "resource"]),
      text: z.string().optional(),
      data: z.string().optional(),
      mimeType: z.string().optional(),
    })
  ),
});

export function createReadResourceTool(connectionManager: ConnectionManager) {
  return defineTool({
    description: "Read a resource from the connected MCP server by URI.",
    input: readResourceInputSchema,
    output: readResourceOutputSchema,
    handler: async (input): Promise<ReadResourceOutput> => {
      const client = connectionManager.getClient();

      try {
        const result = await client.readResource(input.uri);

        return {
          contents: result.contents.map((content) => ({
            type: content.type,
            text: content.text,
            data: content.data,
            mimeType: content.mimeType,
          })),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // Check for not found
        if (message.includes("not found") || message.includes("Not found")) {
          throw new Error(`Resource not found: ${input.uri}`);
        }

        throw new Error(`Failed to read resource ${input.uri}: ${message}`);
      }
    },
  });
}
