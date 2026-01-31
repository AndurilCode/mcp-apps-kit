/**
 * screenshot_widget tool
 *
 * Renders a tool's UI widget in a browser (Playwright) and captures a screenshot.
 * Can use an existing session or create a new one.
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import { writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConnectionRegistry } from "../connection-registry";
import type { ScreenshotWidgetOutput } from "../types";
import { UIHostManager, type DetectedProtocol } from "../ui-host";
import {
  extractToolResult,
  findUIResourceForTool,
  fetchWidgetHTML,
  resolveProtocol,
  assertAgentMode,
} from "./helpers";

export const screenshotWidgetInputSchema = z.object({
  connectionId: z.string().optional().describe("Connection ID. Defaults to active connection."),
  sessionId: z
    .string()
    .optional()
    .describe("Use existing widget session instead of creating new one"),
  tool: z.string().optional().describe("Name of the tool to screenshot (required if no sessionId)"),
  arguments: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Arguments to pass to the tool (required if no sessionId)"),
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

export function createScreenshotWidgetTool(registry: ConnectionRegistry) {
  return defineTool({
    description:
      "Take a screenshot of a tool's UI widget. Can use an existing widget session (via sessionId) or call the tool and render a new widget. Saves the screenshot to a temp file and returns the file path.",
    input: screenshotWidgetInputSchema,
    output: screenshotWidgetOutputSchema,
    handler: async (input): Promise<ScreenshotWidgetOutput> => {
      const modeCheck = assertAgentMode();
      if (modeCheck.blocked) return modeCheck.result;
      const connectionManager = registry.resolveConnection(input.connectionId);
      const format = input.format ?? "png";
      const viewport = input.viewport ?? { width: 800, height: 600 };

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
          const { page, protocol } = session;

          // Target the widget iframe for screenshot (unless fullPage is requested)
          const frame = page.frame({ url: /\/widget\// });
          let screenshotResult: { data: Buffer; format: "png" | "jpeg" };

          if (frame && !input.fullPage) {
            // Screenshot widget iframe content only
            const body = frame.locator("body");
            const data = await body.screenshot({ type: format });
            screenshotResult = { data, format };
          } else {
            // Fallback to full page (includes host frame)
            const data = await page.screenshot({
              type: format,
              fullPage: input.fullPage,
            });
            screenshotResult = { data, format };
          }

          // Save screenshot to temp file
          await mkdir(SCREENSHOTS_DIR, { recursive: true });
          const timestamp = Date.now();
          const filename = `${session.toolName}-${timestamp}.${format}`;
          const screenshotPath = join(SCREENSHOTS_DIR, filename);
          await writeFile(screenshotPath, screenshotResult.data);

          // Get actual viewport dimensions from the page
          let actualDimensions: { width: number; height: number } | undefined;
          try {
            const pageViewport = page.viewportSize?.();
            if (pageViewport) {
              actualDimensions = pageViewport;
            } else {
              /* eslint-disable no-undef */
              actualDimensions = await page.evaluate(() => ({
                width: window.innerWidth,
                height: window.innerHeight,
              }));
              /* eslint-enable no-undef */
            }
          } catch {
            // Fall back to input viewport if we can't get actual dimensions
            actualDimensions = viewport;
          }

          return {
            hasUI: true,
            protocol,
            screenshotPath,
            format,
            dimensions: actualDimensions,
            errors: [],
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            hasUI: true,
            protocol: session.protocol,
            errors: [`Screenshot failed: ${message}`],
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

      // Step 5: Render in browser and take screenshot
      const uiHostManager = new UIHostManager(client);
      const environmentState = connectionManager.getEnvironmentState();
      const inspectorUrl = connectionManager.getInspectorUrl();

      type PageType = Awaited<ReturnType<typeof uiHostManager.renderInBrowser>>["page"];
      let page: PageType | undefined;

      try {
        const renderResult = await uiHostManager.renderInBrowser(
          html,
          protocol,
          toolResult,
          input.tool,
          input.arguments ?? {},
          environmentState,
          viewport,
          undefined, // externalHostContext
          inspectorUrl ?? undefined
        );

        page = renderResult.page;
        const { errors } = renderResult;

        // Target the widget iframe for screenshot (unless fullPage is requested)
        const frame = page.frame({ url: /\/widget\// });
        let screenshotResult: { data: Buffer; format: "png" | "jpeg" };

        if (frame && !input.fullPage) {
          // Screenshot widget iframe content only
          const body = frame.locator("body");
          const data = await body.screenshot({ type: format });
          screenshotResult = { data, format };
        } else {
          // Fallback to full page (includes host frame)
          screenshotResult = await uiHostManager.takeScreenshot(page, {
            format,
            fullPage: input.fullPage,
          });
        }

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

        return {
          hasUI: true,
          protocol,
          errors: [`Screenshot failed: ${message}`],
        };
      } finally {
        // Clean up resources
        if (page) {
          await page.close().catch(() => {});
        }
        await uiHostManager.dispose().catch(() => {});
      }
    },
  });
}
