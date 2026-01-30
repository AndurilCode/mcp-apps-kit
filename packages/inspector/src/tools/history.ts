/**
 * get_call_history and clear_history tools
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionRegistry } from "../connection-registry";
import type { HistoryOutput, ClearHistoryOutput } from "../types";

// =============================================================================
// get_call_history
// =============================================================================

export const getCallHistoryInputSchema = z.object({
  connectionId: z.string().optional().describe("Connection ID. Defaults to active connection."),
});

export const getCallHistoryOutputSchema = z.object({
  history: z.array(
    z.object({
      name: z.string(),
      args: z.record(z.string(), z.unknown()),
      result: z.object({
        content: z.array(
          z.object({
            type: z.enum(["text", "image", "resource"]),
            text: z.string().optional(),
            data: z.string().optional(),
            mimeType: z.string().optional(),
          })
        ),
        isError: z.boolean(),
      }),
      duration: z.number(),
      timestamp: z.string(),
    })
  ),
  totalCalls: z.number(),
  errorCount: z.number(),
  averageDuration: z.number(),
  message: z.string().optional(),
});

export function createGetCallHistoryTool(registry: ConnectionRegistry) {
  return defineTool({
    description:
      "Get the history of tool calls made to the connected server. Returns call details including name, arguments, results, and timing.",
    input: getCallHistoryInputSchema,
    output: getCallHistoryOutputSchema,
    handler: async (input): Promise<HistoryOutput> => {
      const connectionManager = registry.resolveConnection(input.connectionId);
      // Check if history tracking is enabled
      if (!connectionManager.isHistoryEnabled()) {
        return {
          history: [],
          totalCalls: 0,
          errorCount: 0,
          averageDuration: 0,
          message: "History tracking is disabled. Enable with trackHistory: true when connecting.",
        };
      }

      const history = connectionManager.getCallHistory();

      // Calculate statistics
      const totalCalls = history.length;
      const errorCount = history.filter((h) => h.result.isError).length;
      const totalDuration = history.reduce((sum, h) => sum + h.duration, 0);
      const averageDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;

      return {
        history,
        totalCalls,
        errorCount,
        averageDuration,
      };
    },
  });
}

// =============================================================================
// clear_history
// =============================================================================

export const clearHistoryInputSchema = z.object({
  connectionId: z.string().optional().describe("Connection ID. Defaults to active connection."),
});

export const clearHistoryOutputSchema = z.object({
  cleared: z.boolean(),
  previousCount: z.number(),
});

export function createClearHistoryTool(registry: ConnectionRegistry) {
  return defineTool({
    description: "Clear the call history for the current connection.",
    input: clearHistoryInputSchema,
    output: clearHistoryOutputSchema,
    handler: async (input): Promise<ClearHistoryOutput> => {
      const connectionManager = registry.resolveConnection(input.connectionId);
      const previousCount = connectionManager.clearHistory();

      return {
        cleared: true,
        previousCount,
      };
    },
  });
}
