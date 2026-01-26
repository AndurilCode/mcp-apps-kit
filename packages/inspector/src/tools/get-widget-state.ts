/**
 * get_widget_state tool
 *
 * Extracts comprehensive widget state from a session created via /apps/mcp.
 * Provides visibility into tool input, output, globals, tool calls, and DOM.
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "../connection";
import type {
  GetWidgetStateOutput,
  WidgetStateSnapshot,
  WidgetToolCall,
  WidgetStateChange,
  WidgetDOMSnapshot,
} from "../types";

export const getWidgetStateInputSchema = z.object({
  sessionId: z.string().describe("Session ID of the widget to get state from"),
  includeDOM: z.boolean().optional().describe("Whether to include DOM snapshot (default: false)"),
});

// Schema for environment state (globals)
const environmentStateSchema = z.object({
  theme: z.enum(["light", "dark"]),
  locale: z.string(),
  timeZone: z.string(),
  displayMode: z.enum(["inline", "fullscreen", "pip"]),
  viewport: z.object({
    width: z.number(),
    height: z.number(),
  }),
  maxHeight: z.number().optional(),
  safeAreaInsets: z.object({
    top: z.number(),
    right: z.number(),
    bottom: z.number(),
    left: z.number(),
  }),
  userAgent: z.object({
    device: z
      .object({
        type: z.string().optional(),
      })
      .optional(),
    capabilities: z
      .object({
        hover: z.boolean().optional(),
        touch: z.boolean().optional(),
      })
      .optional(),
  }),
  userLocation: z
    .object({
      city: z.string().optional(),
      region: z.string().optional(),
      country: z.string().optional(),
      timezone: z.string().optional(),
    })
    .optional(),
});

export const getWidgetStateOutputSchema = z.object({
  success: z.boolean(),
  state: z
    .object({
      sessionId: z.string(),
      toolName: z.string(),
      protocol: z.enum(["mcp", "openai"]),
      globals: environmentStateSchema,
      toolInput: z.record(z.string(), z.unknown()),
      toolOutput: z.unknown(),
      toolResponseMetadata: z.record(z.string(), z.unknown()).optional(),
      toolCalls: z.array(
        z.object({
          name: z.string(),
          args: z.unknown(),
          timestamp: z.number(),
        })
      ),
      stateChanges: z.array(
        z.object({
          state: z.unknown(),
          timestamp: z.number(),
        })
      ),
      dom: z
        .object({
          html: z.string(),
          textContent: z.string(),
        })
        .optional(),
      consoleLogs: z.array(
        z.object({
          level: z.enum(["log", "info", "warn", "error", "debug"]),
          text: z.string(),
          source: z.enum(["widget", "host", "unknown"]),
          timestamp: z.number(),
          url: z.string().optional(),
          lineNumber: z.number().optional(),
        })
      ),
      pageErrors: z.array(z.string()),
      createdAt: z.number(),
      source: z.enum(["apps", "agent"]),
      proxyMetadata: z
        .object({
          targetServerUrl: z.string(),
          targetToolName: z.string(),
        })
        .optional(),
    })
    .optional(),
  error: z.string().optional(),
});

export function createGetWidgetStateTool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Get comprehensive state from a widget session. Returns tool input/output, environment globals, tool calls made by the widget, state changes, console logs, and optionally a DOM snapshot.",
    input: getWidgetStateInputSchema,
    output: getWidgetStateOutputSchema,
    handler: async (input): Promise<GetWidgetStateOutput> => {
      const sessionManager = connectionManager.getWidgetSessionManager();
      const session = sessionManager.getSession(input.sessionId);

      if (!session) {
        return {
          success: false,
          error: `Session not found: ${input.sessionId}`,
        };
      }

      if (session.page.isClosed()) {
        return {
          success: false,
          error: "Page closed",
        };
      }

      try {
        // Get environment state (globals)
        const environmentState = connectionManager.getEnvironmentState();

        // Target the widget iframe
        const frame = session.page.frame({ url: /\/widget\// });

        // Extract widget runtime state via evaluate
        let toolCalls: WidgetToolCall[] = [];
        let stateChanges: WidgetStateChange[] = [];
        let toolResponseMetadata: Record<string, unknown> | undefined;

        if (frame) {
          try {
            // Try to read runtime state from the widget
            // Different structures based on protocol
            /* eslint-disable no-undef */
            const runtimeState = await frame.evaluate(() => {
              // Type for OpenAI SDK-based widgets
              interface OpenAIRuntime {
                _toolCalls?: Array<{ name: string; args: unknown; timestamp: number }>;
                _stateChanges?: Array<{ state: unknown; timestamp: number }>;
                _metadata?: Record<string, unknown>;
              }

              // Type for MCP-based widgets
              interface MCPRuntime {
                toolCalls?: Array<{ name: string; args: unknown; timestamp: number }>;
                stateHistory?: Array<{ state: unknown; timestamp: number }>;
                responseMetadata?: Record<string, unknown>;
              }

              const w = window as Window & {
                openai?: OpenAIRuntime;
                __mcpWidgetRuntime?: MCPRuntime;
                __inspectorToolCalls?: Array<{ name: string; args: unknown; timestamp: number }>;
                __inspectorStateChanges?: Array<{ state: unknown; timestamp: number }>;
              };

              // Check for OpenAI SDK runtime
              if (w.openai) {
                return {
                  type: "openai" as const,
                  toolCalls: w.openai._toolCalls ?? w.__inspectorToolCalls ?? [],
                  stateChanges: w.openai._stateChanges ?? w.__inspectorStateChanges ?? [],
                  metadata: w.openai._metadata,
                };
              }

              // Check for MCP widget runtime
              if (w.__mcpWidgetRuntime) {
                return {
                  type: "mcp" as const,
                  toolCalls: w.__mcpWidgetRuntime.toolCalls ?? w.__inspectorToolCalls ?? [],
                  stateChanges:
                    w.__mcpWidgetRuntime.stateHistory ?? w.__inspectorStateChanges ?? [],
                  metadata: w.__mcpWidgetRuntime.responseMetadata,
                };
              }

              // Fallback to inspector-injected state
              return {
                type: "unknown" as const,
                toolCalls: w.__inspectorToolCalls ?? [],
                stateChanges: w.__inspectorStateChanges ?? [],
                metadata: undefined,
              };
            });
            /* eslint-enable no-undef */

            toolCalls = runtimeState.toolCalls;
            stateChanges = runtimeState.stateChanges;
            toolResponseMetadata = runtimeState.metadata;
          } catch {
            // Runtime state extraction failed, continue with empty arrays
          }
        }

        // Extract DOM if requested
        let dom: WidgetDOMSnapshot | undefined;
        if (input.includeDOM && frame) {
          try {
            const [html, textContent] = await Promise.all([
              frame.content(),
              frame
                .locator("body")
                .textContent()
                .then((t) => t?.trim() ?? ""),
            ]);
            dom = { html, textContent };
          } catch {
            // DOM extraction failed, continue without it
          }
        }

        // Build the state snapshot
        const state: WidgetStateSnapshot = {
          sessionId: session.id,
          toolName: session.toolName,
          protocol: session.protocol,
          globals: environmentState,
          toolInput: session.toolArgs,
          toolOutput: session.toolResult,
          toolResponseMetadata,
          toolCalls,
          stateChanges,
          dom,
          consoleLogs: session.consoleLogs,
          pageErrors: session.pageErrors,
          createdAt: session.createdAt,
          source: session.source,
          proxyMetadata: session.proxyMetadata,
        };

        return {
          success: true,
          state,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: message,
        };
      }
    },
  });
}
