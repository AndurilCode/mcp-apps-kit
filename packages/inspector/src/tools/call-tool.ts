/**
 * call_tool tool
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "../connection";
import type { CallToolOutput } from "../types";

export const callToolInputSchema = z.object({
  name: z.string().describe("Name of the tool to call"),
  arguments: z.record(z.string(), z.unknown()).describe("Arguments to pass to the tool"),
});

export const callToolOutputSchema = z.object({
  content: z.array(
    z.object({
      type: z.enum(["text", "image", "resource"]),
      text: z.string().optional(),
      data: z.string().optional(),
      mimeType: z.string().optional(),
    })
  ),
  isError: z.boolean(),
  structuredContent: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
  duration: z.number(),
});

export function createCallToolTool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Call a tool on the connected MCP server with the specified arguments. Returns the tool result including content blocks, errors, and execution duration.",
    input: callToolInputSchema,
    output: callToolOutputSchema,
    handler: async (input): Promise<CallToolOutput> => {
      const client = connectionManager.getClient();
      const startTime = Date.now();

      try {
        const result = await client.callTool(input.name, input.arguments);
        const duration = Date.now() - startTime;

        connectionManager.incrementCallCount();

        // Convert content blocks to our format
        const content = result.content.map((block) => ({
          type: block.type,
          text: block.text,
          data: block.data,
          mimeType: block.mimeType,
        }));

        // Check if result indicates an error
        if (result.isError) {
          // Extract error message from content
          const errorText = content.find((c) => c.type === "text")?.text ?? "Unknown error";

          return {
            content,
            isError: true,
            error: {
              code: "TOOL_ERROR",
              message: errorText,
            },
            duration,
          };
        }

        return {
          content,
          isError: false,
          structuredContent: result.structuredContent,
          duration,
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        const message = error instanceof Error ? error.message : String(error);

        connectionManager.incrementCallCount();

        // Check for timeout
        if (message.includes("timeout") || message.includes("Timeout")) {
          return {
            content: [{ type: "text", text: `Tool '${input.name}' timed out after 30000ms` }],
            isError: true,
            error: {
              code: "TIMEOUT",
              message: `Tool '${input.name}' timed out after 30000ms`,
            },
            duration,
          };
        }

        // Check for not found
        if (message.includes("not found") || message.includes("Unknown tool")) {
          return {
            content: [{ type: "text", text: `Tool not found: ${input.name}` }],
            isError: true,
            error: {
              code: "NOT_FOUND",
              message: `Tool not found: ${input.name}`,
            },
            duration,
          };
        }

        // Check for validation error
        if (
          message.includes("validation") ||
          message.includes("Validation") ||
          message.includes("required")
        ) {
          return {
            content: [{ type: "text", text: `Validation error: ${message}` }],
            isError: true,
            error: {
              code: "VALIDATION_ERROR",
              message,
            },
            duration,
          };
        }

        return {
          content: [{ type: "text", text: message }],
          isError: true,
          error: {
            code: "UNKNOWN_ERROR",
            message,
          },
          duration,
        };
      }
    },
  });
}
