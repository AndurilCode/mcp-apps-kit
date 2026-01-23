/**
 * test_widget_interaction tool
 *
 * Tests widget interactions by performing actions (click, type, etc.)
 * and capturing DOM snapshots after each action.
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "../connection";
import type { TestWidgetInteractionOutput } from "../types";
import { UIHostManager, detectProtocolFromMimeType, type DetectedProtocol } from "../ui-host";

const interactionActionSchema = z.object({
  action: z
    .enum(["click", "type", "hover", "wait", "snapshot", "scroll"])
    .describe("Action to perform"),
  selector: z.string().optional().describe("CSS selector for the target element"),
  text: z.string().optional().describe("Text to type (for type action)"),
  ms: z.number().optional().describe("Milliseconds to wait (for wait action)"),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional()
    .describe("Position for scroll/click (optional)"),
});

export const testWidgetInteractionInputSchema = z.object({
  tool: z.string().describe("Name of the tool"),
  arguments: z.record(z.string(), z.unknown()).describe("Arguments to pass to the tool"),
  interactions: z.array(interactionActionSchema).describe("List of interactions to perform"),
  protocol: z
    .enum(["mcp", "openai", "auto"])
    .optional()
    .describe("Protocol to use (auto-detect if not specified)"),
  viewport: z
    .object({
      width: z.number(),
      height: z.number(),
    })
    .optional()
    .describe("Viewport size (default: 800x600)"),
});

export const testWidgetInteractionOutputSchema = z.object({
  hasUI: z.boolean(),
  noUIReason: z.string().optional(),
  protocol: z.enum(["mcp", "openai"]).optional(),
  snapshots: z.array(
    z.object({
      afterAction: z.number(),
      dom: z.string(),
      textContent: z.string(),
    })
  ),
  toolCalls: z.array(
    z.object({
      name: z.string(),
      args: z.unknown(),
    })
  ),
  stateChanges: z.array(
    z.object({
      state: z.unknown(),
      timestamp: z.number(),
    })
  ),
  errors: z.array(z.string()),
});

export function createTestWidgetInteractionTool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Test widget interactions by performing a sequence of actions (click, type, hover, wait) and capturing DOM snapshots. Returns snapshots after snapshot actions, plus any tool calls and state changes made by the widget.",
    input: testWidgetInteractionInputSchema,
    output: testWidgetInteractionOutputSchema,
    handler: async (input): Promise<TestWidgetInteractionOutput> => {
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
          snapshots: [],
          toolCalls: [],
          stateChanges: [],
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
          snapshots: [],
          toolCalls: [],
          stateChanges: [],
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
            snapshots: [],
            toolCalls: [],
            stateChanges: [],
            errors: [],
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          hasUI: false,
          noUIReason: `Failed to fetch widget HTML: ${message}`,
          snapshots: [],
          toolCalls: [],
          stateChanges: [],
          errors: [message],
        };
      }

      // Step 5: Render in browser and perform interactions
      const uiHostManager = new UIHostManager(client);
      const viewport = input.viewport ?? { width: 800, height: 600 };
      const errors: string[] = [];
      const snapshots: Array<{ afterAction: number; dom: string; textContent: string }> = [];

      try {
        const renderResult = await uiHostManager.renderInBrowser(
          html,
          protocol,
          toolResult,
          input.tool,
          viewport
        );

        const { page, mcpEmulator, openaiEmulator } = renderResult;
        errors.push(...renderResult.errors);

        // Perform each interaction
        for (let i = 0; i < input.interactions.length; i++) {
          const actionItem = input.interactions[i];
          if (!actionItem) continue;

          const actionType = actionItem.action;
          const selector = actionItem.selector;
          const text = actionItem.text;
          const ms = actionItem.ms;
          const position = actionItem.position;

          try {
            switch (actionType) {
              case "click":
                if (selector) {
                  await page.click(selector);
                } else if (position) {
                  await page.mouse.click(position.x, position.y);
                }
                break;

              case "type":
                if (selector && text) {
                  await page.fill(selector, text);
                }
                break;

              case "hover":
                if (selector) {
                  await page.hover(selector);
                }
                break;

              case "wait":
                await page.waitForTimeout(ms ?? 100);
                break;

              case "scroll":
                if (position) {
                  const scrollX = position.x;
                  const scrollY = position.y;
                  // Function runs in browser context via Playwright page.evaluate
                  await page.evaluate(
                    ({ x, y }: { x: number; y: number }) => {
                      // eslint-disable-next-line no-undef
                      window.scrollTo(x, y);
                    },
                    { x: scrollX, y: scrollY }
                  );
                }
                break;

              case "snapshot": {
                const snapshot = await uiHostManager.getDOMSnapshot(page);
                snapshots.push({
                  afterAction: i,
                  dom: snapshot.html,
                  textContent: snapshot.textContent,
                });
                break;
              }
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            errors.push(`Action ${i} (${actionType}) failed: ${message}`);
          }
        }

        // Close the page
        await page.close();

        // Get tool calls and state changes from emulators
        const toolCalls: Array<{ name: string; args: unknown }> = [];
        const stateChanges: Array<{ state: unknown; timestamp: number }> = [];

        if (mcpEmulator) {
          const history = mcpEmulator.getToolCallHistory();
          for (const call of history) {
            toolCalls.push({ name: call.name, args: call.args });
          }
        }

        if (openaiEmulator) {
          const oaiToolCalls = openaiEmulator.getToolCalls();
          for (const call of oaiToolCalls) {
            toolCalls.push({ name: call.name, args: call.args });
          }
          const changes = openaiEmulator.getStateChanges();
          for (const change of changes) {
            stateChanges.push({ state: change.state, timestamp: change.timestamp });
          }
        }

        // Dispose of the browser pool
        await uiHostManager.dispose();

        return {
          hasUI: true,
          protocol,
          snapshots,
          toolCalls,
          stateChanges,
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
          snapshots,
          toolCalls: [],
          stateChanges: [],
          errors: [`Interaction test failed: ${message}`],
        };
      }
    },
  });
}
