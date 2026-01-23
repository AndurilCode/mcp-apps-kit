/**
 * screenshot_widget tool
 *
 * Renders a tool's UI widget in a browser (Playwright) and captures a screenshot.
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import { writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConnectionManager } from "../connection";
import type { ScreenshotWidgetOutput } from "../types";
import { UIHostManager, detectProtocolFromMimeType, type DetectedProtocol } from "../ui-host";

export const screenshotWidgetInputSchema = z.object({
  tool: z.string().describe("Name of the tool to screenshot"),
  arguments: z.record(z.string(), z.unknown()).describe("Arguments to pass to the tool"),
  protocol: z
    .enum(["mcp", "openai", "auto"])
    .optional()
    .describe("Protocol to use (auto-detect if not specified)"),
  format: z.enum(["png", "jpeg"]).optional().describe("Screenshot format (default: png)"),
  fullPage: z.boolean().optional().describe("Capture full page or viewport only (default: false)"),
  viewport: z
    .object({
      width: z.number(),
      height: z.number(),
    })
    .optional()
    .describe("Viewport size (default: 800x600)"),
});

export const screenshotWidgetOutputSchema = z.object({
  hasUI: z.boolean(),
  noUIReason: z.string().optional(),
  protocol: z.enum(["mcp", "openai"]).optional(),
  screenshotPath: z.string().optional(),
  format: z.enum(["png", "jpeg"]).optional(),
  dimensions: z
    .object({
      width: z.number(),
      height: z.number(),
    })
    .optional(),
  errors: z.array(z.string()),
});

// Create screenshots directory in temp
const SCREENSHOTS_DIR = join(tmpdir(), "mcp-inspector-screenshots");

export function createScreenshotWidgetTool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Take a screenshot of a tool's UI widget by calling the tool and rendering its result in a browser. Saves the screenshot to a temp file and returns the file path.",
    input: screenshotWidgetInputSchema,
    output: screenshotWidgetOutputSchema,
    handler: async (input): Promise<ScreenshotWidgetOutput> => {
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

      // Step 5: Render in browser and take screenshot
      const uiHostManager = new UIHostManager(client);
      const viewport = input.viewport ?? { width: 800, height: 600 };

      try {
        const renderResult = await uiHostManager.renderInBrowser(
          html,
          protocol,
          toolResult,
          input.tool,
          viewport
        );

        const { page, errors } = renderResult;
        const format = input.format ?? "png";

        // Take screenshot
        const screenshotResult = await uiHostManager.takeScreenshot(page, {
          format,
          fullPage: input.fullPage,
        });

        // Close the page
        await page.close();

        // Dispose of the browser pool
        await uiHostManager.dispose();

        // Save screenshot to temp file
        await mkdir(SCREENSHOTS_DIR, { recursive: true });
        const timestamp = Date.now();
        const filename = `${input.tool}-${timestamp}.${format}`;
        const screenshotPath = join(SCREENSHOTS_DIR, filename);
        await writeFile(screenshotPath, screenshotResult.data);

        return {
          hasUI: true,
          protocol,
          screenshotPath,
          format,
          dimensions: viewport,
          errors,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // Clean up on error
        try {
          await uiHostManager.dispose();
        } catch {
          // Ignore cleanup errors
        }

        return {
          hasUI: true,
          protocol,
          errors: [`Screenshot failed: ${message}`],
        };
      }
    },
  });
}
