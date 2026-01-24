/**
 * preview_ui tool
 *
 * Renders a tool's UI widget with its result in headless mode (jsdom)
 * and returns a DOM snapshot with extracted elements.
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "../connection";
import type { PreviewUIOutput } from "../types";
import { UIHostManager, type DetectedProtocol } from "../ui-host";
import {
  extractToolResult,
  findUIResourceForTool,
  fetchWidgetHTML,
  resolveProtocol,
} from "./helpers";

export const previewUIInputSchema = z.object({
  sessionId: z
    .string()
    .optional()
    .describe("Use existing widget session instead of creating new one"),
  tool: z.string().optional().describe("Name of the tool to preview (required if no sessionId)"),
  arguments: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Arguments to pass to the tool (required if no sessionId)"),
  protocol: z
    .enum(["mcp", "openai", "auto"])
    .optional()
    .describe("Protocol to use (auto-detect if not specified)"),
  waitMs: z.number().optional().describe("Time to wait for render in milliseconds (default: 100)"),
});

export const previewUIOutputSchema = z.object({
  hasUI: z.boolean(),
  noUIReason: z.string().optional(),
  protocol: z.enum(["mcp", "openai"]).optional(),
  resourceUri: z.string().optional(),
  dom: z.string().optional(),
  textContent: z.string().optional(),
  elements: z
    .array(
      z.object({
        tagName: z.string(),
        id: z.string().optional(),
        className: z.string().optional(),
        textContent: z.string().optional(),
        attributes: z.record(z.string(), z.string()),
        children: z.number(),
      })
    )
    .optional(),
  toolResultDisplayed: z.boolean().optional(),
  errors: z.array(z.string()),
  renderDuration: z.number().optional(),
});

export function createPreviewUITool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Preview a tool's UI widget by calling the tool and rendering its result in the associated UI widget. Can use an existing session. Returns a DOM snapshot with extracted elements and text content.",
    input: previewUIInputSchema,
    output: previewUIOutputSchema,
    handler: async (input): Promise<PreviewUIOutput> => {
      const startTime = Date.now();

      // Check if using existing session
      if (input.sessionId) {
        const sessionManager = connectionManager.getWidgetSessionManager();
        const session = sessionManager.getSession(input.sessionId);

        if (!session) {
          return {
            hasUI: false,
            noUIReason: `Session not found: ${input.sessionId}`,
            errors: [`Session ${input.sessionId} does not exist or has expired`],
          };
        }

        try {
          const { page, protocol, toolResult } = session;

          // Get DOM from the widget iframe
          const frame = page.frame({ url: /\/widget\// });
          if (!frame) {
            return {
              hasUI: true,
              protocol,
              errors: ["Widget iframe not found"],
            };
          }

          const dom = await frame.content();
          const textContent = await frame.textContent("body");

          const renderDuration = Date.now() - startTime;

          // Check if tool result data appears in the rendered DOM
          const toolResultStr = JSON.stringify(toolResult);
          const toolResultDisplayed =
            textContent?.includes(toolResultStr) ??
            // Check for partial matches (common values from result)
            (typeof toolResult === "object" &&
              toolResult !== null &&
              Object.values(toolResult as Record<string, unknown>).some(
                (v) => typeof v === "string" && v.length > 3 && textContent?.includes(v)
              ));

          return {
            hasUI: true,
            protocol,
            resourceUri: undefined, // Not available from session
            dom,
            textContent: textContent ?? undefined,
            elements: undefined, // Would require DOM parsing
            toolResultDisplayed,
            errors: [],
            renderDuration,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            hasUI: true,
            protocol: session.protocol,
            errors: [`Preview failed: ${message}`],
          };
        }
      }

      // Validate required fields for standalone mode
      if (!input.tool || !input.arguments) {
        return {
          hasUI: false,
          noUIReason: "Either sessionId or both tool and arguments must be provided",
          errors: ["Missing required parameters"],
        };
      }

      // Standalone mode: call tool and render widget
      const client = connectionManager.getClient();
      const rawClient = client.raw;

      // Step 1: Call the tool to get its result
      let toolResult: unknown;
      try {
        const callResult = await rawClient.callTool({
          name: input.tool,
          arguments: input.arguments,
        });
        toolResult = extractToolResult(callResult);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          hasUI: false,
          noUIReason: `Tool call failed: ${message}`,
          errors: [message],
        };
      }

      // Step 2: Find the UI resource for this tool
      const uiResource = await findUIResourceForTool(rawClient, input.tool);
      if (!uiResource) {
        return {
          hasUI: false,
          noUIReason: `No UI resource found for tool: ${input.tool}`,
          errors: [],
        };
      }

      // Step 3: Determine protocol to use
      const protocol: DetectedProtocol = resolveProtocol(uiResource.protocol, input.protocol);

      // Step 4: Fetch the widget HTML
      let html: string;
      try {
        html = await fetchWidgetHTML(rawClient, uiResource.uri);
        if (!html) {
          return {
            hasUI: false,
            noUIReason: `No HTML content in resource: ${uiResource.uri}`,
            errors: [],
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          hasUI: false,
          noUIReason: `Failed to fetch widget HTML: ${message}`,
          errors: [message],
        };
      }

      // Step 5: Render the widget using UIHostManager
      const uiHostManager = new UIHostManager(client);
      const environmentState = connectionManager.getEnvironmentState();

      try {
        const renderResult = await uiHostManager.renderHeadless(
          html,
          protocol,
          toolResult,
          input.tool,
          environmentState,
          input.waitMs ?? 100
        );

        const renderDuration = Date.now() - startTime;

        // Check if tool result data appears in the rendered DOM
        const toolResultStr = JSON.stringify(toolResult);
        const toolResultDisplayed =
          renderResult.textContent.includes(toolResultStr) ||
          // Check for partial matches (common values from result)
          (typeof toolResult === "object" &&
            toolResult !== null &&
            Object.values(toolResult as Record<string, unknown>).some(
              (v) => typeof v === "string" && v.length > 3 && renderResult.textContent.includes(v)
            ));

        return {
          hasUI: true,
          protocol,
          resourceUri: uiResource.uri,
          dom: renderResult.html,
          textContent: renderResult.textContent,
          elements: renderResult.elements,
          toolResultDisplayed,
          errors: renderResult.errors,
          renderDuration,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          hasUI: true,
          protocol,
          resourceUri: uiResource.uri,
          errors: [`Render failed: ${message}`],
        };
      }
    },
  });
}
