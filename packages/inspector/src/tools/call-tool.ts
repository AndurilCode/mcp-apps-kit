/**
 * call_tool tool
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "../connection";
import type { CallToolOutput, ToolHints } from "../types";
import { UIHostManager } from "../ui-host";
import {
  findUIResourceForTool,
  fetchWidgetHTML,
  extractToolResult,
  type MCPCallToolResponse,
} from "./helpers";

/** Default timeout for tool calls in milliseconds */
const DEFAULT_TOOL_TIMEOUT_MS = 30000;

export const callToolInputSchema = z.object({
  name: z.string().describe("Name of the tool to call"),
  arguments: z.record(z.string(), z.unknown()).describe("Arguments to pass to the tool"),
  renderWidget: z
    .boolean()
    .optional()
    .describe("If true, render the UI widget and return a sessionId for subsequent operations"),
});

const toolHintsSchema = z.object({
  next: z.string().optional(),
  alternatives: z.array(z.string()).optional(),
  warning: z.string().optional(),
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
  sessionId: z.string().optional().describe("Widget session ID (when renderWidget=true)"),
  hints: toolHintsSchema.optional(),
});

export function createCallToolTool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Call a tool on the connected MCP server with the specified arguments. Returns the tool result including content blocks, errors, and execution duration. Optionally renders the UI widget and returns a session ID for subsequent inspection operations.",
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

        // Prepare base response
        const baseResponse = {
          content,
          isError: false,
          structuredContent: result.structuredContent,
          duration,
        };

        // If renderWidget is false or not provided, return without session
        if (!input.renderWidget) {
          return baseResponse;
        }

        // Render widget and create session
        let sessionId: string | undefined;
        try {
          // Extract tool result for widget (cast to MCPCallToolResponse for type compatibility)
          const toolResult = extractToolResult(result as MCPCallToolResponse);

          // Find UI resource for this tool
          const rawClient = client.raw;
          const uiResource = await findUIResourceForTool(rawClient, input.name);

          if (uiResource) {
            // Fetch widget HTML
            const html = await fetchWidgetHTML(rawClient, uiResource.uri);

            if (html) {
              // Render widget in browser
              // Use shared WidgetServer from ConnectionManager
              const sharedWidgetServer = await connectionManager.getWidgetServer();
              const uiHostManager = new UIHostManager(client, {
                sharedWidgetServer,
              });
              const environmentState = connectionManager.getEnvironmentState();
              const viewport = environmentState.viewport;
              const inspectorUrl = connectionManager.getInspectorUrl();

              const renderResult = await uiHostManager.renderInBrowser(
                html,
                uiResource.protocol,
                toolResult,
                input.name,
                input.arguments,
                environmentState,
                viewport,
                undefined, // externalHostContext
                inspectorUrl ?? undefined
              );

              const { page } = renderResult;

              // Get widget session ID from renderResult (from WidgetServer)
              // The session ID is in the URL path
              const pageUrl = page.url();
              const urlMatch = pageUrl.match(/\/host\/([a-f0-9-]+)/);
              const widgetSessionId = urlMatch?.[1];

              if (!widgetSessionId) {
                console.warn(
                  `[call_tool] Failed to extract widgetSessionId from page URL: ${pageUrl}`
                );
                // Widget session ID extraction failed, return result without session
                return baseResponse;
              }

              // Create touch callback to keep WidgetServer session alive
              const widgetServerTouch = uiHostManager.createSessionTouchCallback(widgetSessionId);

              // Create widget session in session manager
              const sessionManager = connectionManager.getWidgetSessionManager();
              // eslint-disable-next-line no-console
              console.log(
                `[call_tool] Creating session for ${input.name}, widgetSessionId: ${widgetSessionId}, hostUrl: ${pageUrl}`
              );
              const session = await sessionManager.createSession(
                input.name,
                input.arguments,
                toolResult,
                page,
                widgetSessionId,
                uiResource.protocol,
                "agent", // source
                undefined, // proxyMetadata
                widgetServerTouch
              );

              sessionId = session.id;
              // eslint-disable-next-line no-console
              console.log(`[call_tool] Session created: ${sessionId}`);
            }
          }
        } catch (error) {
          // Widget rendering failed, but tool call succeeded
          // Continue without session
          console.warn(`[call_tool] Failed to render widget:`, error);
        }

        // Add hints when widget session is created
        let hints: ToolHints | undefined;
        if (sessionId) {
          hints = {
            next: "Widget session created. Use widget_snapshot to discover elements, then widget_click/widget_fill to interact",
          };
        }

        return {
          ...baseResponse,
          sessionId,
          hints,
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        const message = error instanceof Error ? error.message : String(error);

        connectionManager.incrementCallCount();

        // Check for timeout
        if (message.includes("timeout") || message.includes("Timeout")) {
          // Extract timeout value from error message if present, otherwise use default
          const timeoutMatch = message.match(/(\d+)\s*ms/);
          const timeoutValue =
            timeoutMatch && timeoutMatch[1]
              ? parseInt(timeoutMatch[1], 10)
              : DEFAULT_TOOL_TIMEOUT_MS;
          const timeoutMsg = `Tool '${input.name}' timed out after ${timeoutValue}ms`;

          return {
            content: [
              {
                type: "text",
                text: timeoutMsg,
              },
            ],
            isError: true,
            error: {
              code: "TIMEOUT",
              message: timeoutMsg,
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
