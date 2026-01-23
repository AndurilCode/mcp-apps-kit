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
import { UIHostManager, detectProtocolFromMimeType, type DetectedProtocol } from "../ui-host";

export const previewUIInputSchema = z.object({
  tool: z.string().describe("Name of the tool to preview"),
  arguments: z.record(z.string(), z.unknown()).describe("Arguments to pass to the tool"),
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
      "Preview a tool's UI widget by calling the tool and rendering its result in the associated UI widget. Returns a DOM snapshot with extracted elements and text content.",
    input: previewUIInputSchema,
    output: previewUIOutputSchema,
    handler: async (input): Promise<PreviewUIOutput> => {
      const startTime = Date.now();
      const client = connectionManager.getClient();
      const rawClient = client.raw;

      // Step 1: Call the tool to get its result
      let toolResult: unknown;
      try {
        const callResult = await rawClient.callTool({
          name: input.tool,
          arguments: input.arguments,
        });

        // Extract structured content or parse from text
        if (callResult.structuredContent) {
          toolResult = callResult.structuredContent;
        } else if (
          callResult.content &&
          Array.isArray(callResult.content) &&
          callResult.content.length > 0
        ) {
          const textContent = callResult.content.find(
            (c: { type: string }) => c.type === "text"
          ) as { type: string; text?: string } | undefined;
          if (textContent?.text) {
            try {
              toolResult = JSON.parse(textContent.text);
            } catch {
              toolResult = textContent.text;
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          hasUI: false,
          noUIReason: `Tool call failed: ${message}`,
          errors: [message],
        };
      }

      // Step 2: Find the UI resource for this tool
      const resourcesResult = await rawClient.listResources();

      let uiResource: {
        uri: string;
        mimeType: string;
        protocol: DetectedProtocol;
      } | null = null;

      for (const resource of resourcesResult.resources) {
        const mimeType = resource.mimeType;
        if (!mimeType) continue;

        const protocol = detectProtocolFromMimeType(mimeType);
        if (!protocol) continue;

        // Check if URI matches tool name
        // UI resources typically use patterns like:
        // - ui://server/__ui_toolname?v=hash
        // - ui://server/toolname?v=hash
        const toolNamePatterns = [
          `__ui_${input.tool}`,
          `/${input.tool}?`,
          `/${input.tool}`,
          `toolName=${input.tool}`,
        ];
        const uriMatchesTool = toolNamePatterns.some(
          (pattern) =>
            resource.uri.includes(pattern) || resource.uri.endsWith(pattern.replace("?", ""))
        );
        if (uriMatchesTool) {
          uiResource = {
            uri: resource.uri,
            mimeType,
            protocol,
          };
          break;
        }
      }

      if (!uiResource) {
        return {
          hasUI: false,
          noUIReason: `No UI resource found for tool: ${input.tool}`,
          errors: [],
        };
      }

      // Step 3: Determine protocol to use
      let protocol: DetectedProtocol = uiResource.protocol;
      if (input.protocol && input.protocol !== "auto") {
        protocol = input.protocol;
      }

      // Step 4: Fetch the widget HTML
      let html: string;
      try {
        const contentResult = await rawClient.readResource({ uri: uiResource.uri });
        html = "";
        for (const content of contentResult.contents) {
          if ("text" in content && typeof content.text === "string") {
            html += content.text;
          }
        }
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

      try {
        const renderResult = await uiHostManager.renderHeadless(
          html,
          protocol,
          toolResult,
          input.tool,
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
