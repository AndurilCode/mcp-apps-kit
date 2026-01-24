/**
 * Session management tools
 *
 * Tools for managing active widget rendering sessions.
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "../connection";
import type { SessionInfo } from "../widget-session-manager";

/**
 * list_sessions tool
 */
export const listSessionsOutputSchema = z.object({
  sessions: z.array(
    z.object({
      id: z.string(),
      toolName: z.string(),
      protocol: z.enum(["mcp", "openai"]),
      createdAt: z.number(),
      logCount: z.number(),
      errorCount: z.number(),
    })
  ),
  count: z.number(),
});

export function createListSessionsTool(connectionManager: ConnectionManager) {
  return defineTool({
    description: "List all active widget rendering sessions",
    input: z.object({}),
    output: listSessionsOutputSchema,
    handler: async (): Promise<{
      sessions: SessionInfo[];
      count: number;
    }> => {
      const sessionManager = connectionManager.getWidgetSessionManager();
      const sessions = sessionManager.listSessions();

      return {
        sessions,
        count: sessions.length,
      };
    },
  });
}

/**
 * close_session tool
 */
export const closeSessionInputSchema = z.object({
  sessionId: z.string().describe("ID of the session to close"),
});

export const closeSessionOutputSchema = z.object({
  closed: z.boolean(),
  message: z.string().optional(),
});

export function createCloseSessionTool(connectionManager: ConnectionManager) {
  return defineTool({
    description: "Close a specific widget rendering session and clean up resources",
    input: closeSessionInputSchema,
    output: closeSessionOutputSchema,
    handler: async (input): Promise<{ closed: boolean; message?: string }> => {
      const sessionManager = connectionManager.getWidgetSessionManager();
      const closed = await sessionManager.closeSession(input.sessionId);

      if (closed) {
        return {
          closed: true,
          message: `Session ${input.sessionId} closed successfully`,
        };
      } else {
        return {
          closed: false,
          message: `Session ${input.sessionId} not found`,
        };
      }
    },
  });
}

/**
 * close_all_sessions tool
 */
export const closeAllSessionsOutputSchema = z.object({
  closed: z.number(),
  message: z.string().optional(),
});

export function createCloseAllSessionsTool(connectionManager: ConnectionManager) {
  return defineTool({
    description: "Close all active widget rendering sessions and clean up resources",
    input: z.object({}),
    output: closeAllSessionsOutputSchema,
    handler: async (): Promise<{ closed: number; message?: string }> => {
      const sessionManager = connectionManager.getWidgetSessionManager();
      const closed = await sessionManager.closeAllSessions();

      return {
        closed,
        message: closed > 0 ? `Closed ${closed} session(s)` : "No active sessions to close",
      };
    },
  });
}
