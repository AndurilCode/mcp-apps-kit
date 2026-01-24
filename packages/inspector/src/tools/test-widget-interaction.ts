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
  sessionId: z
    .string()
    .optional()
    .describe("Use existing widget session instead of creating new one"),
  tool: z.string().optional().describe("Name of the tool (required if no sessionId)"),
  arguments: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Arguments to pass to the tool (required if no sessionId)"),
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
      "Test widget interactions by performing a sequence of actions (click, type, hover, wait) and capturing DOM snapshots. Can use an existing session. Returns snapshots after snapshot actions, plus any tool calls and state changes made by the widget.",
    input: testWidgetInteractionInputSchema,
    output: testWidgetInteractionOutputSchema,
    handler: async (input): Promise<TestWidgetInteractionOutput> => {
      const snapshots: Array<{ afterAction: number; dom: string; textContent: string }> = [];
      const toolCalls: Array<{ name: string; args: unknown }> = [];
      const stateChanges: Array<{ state: unknown; timestamp: number }> = [];
      const errors: string[] = [];

      // Check if using existing session
      if (input.sessionId) {
        const sessionManager = connectionManager.getWidgetSessionManager();
        const session = sessionManager.getSession(input.sessionId);

        if (!session) {
          return {
            hasUI: false,
            noUIReason: `Session not found: ${input.sessionId}`,
            snapshots: [],
            toolCalls: [],
            stateChanges: [],
            errors: [`Session ${input.sessionId} does not exist or has expired`],
          };
        }

        try {
          const { page, protocol } = session;

          // Get the widget iframe for interactions
          const frame = page.frame({ url: /\/widget\// });
          if (!frame) {
            return {
              hasUI: true,
              protocol,
              snapshots: [],
              toolCalls: [],
              stateChanges: [],
              errors: ["Widget iframe not found"],
            };
          }

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
                    await frame.click(selector);
                  } else if (position) {
                    await page.mouse.click(position.x, position.y);
                  }
                  break;

                case "type":
                  if (selector && text) {
                    await frame.fill(selector, text);
                  }
                  break;

                case "hover":
                  if (selector) {
                    await frame.hover(selector);
                  }
                  break;

                case "wait":
                  if (ms) {
                    await page.waitForTimeout(ms);
                  }
                  break;

                case "scroll":
                  if (selector) {
                    await frame.locator(selector).scrollIntoViewIfNeeded();
                  } else if (position) {
                    await frame.evaluate(({ x, y }) => {
                      // eslint-disable-next-line no-undef
                      window.scrollTo(x, y);
                    }, position);
                  }
                  break;

                case "snapshot":
                  {
                    const dom = await frame.content();
                    const textContent = (await frame.textContent("body")) ?? "";
                    snapshots.push({
                      afterAction: i,
                      dom,
                      textContent,
                    });
                  }
                  break;
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              errors.push(`Action ${i} (${actionType}) failed: ${message}`);
            }
          }

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
          return {
            hasUI: true,
            protocol: session.protocol,
            snapshots: [],
            toolCalls: [],
            stateChanges: [],
            errors: [`Interaction test failed: ${message}`],
          };
        }
      }

      // Validate required fields for standalone mode
      if (!input.tool || !input.arguments) {
        return {
          hasUI: false,
          noUIReason: "Either sessionId or both tool and arguments must be provided",
          snapshots: [],
          toolCalls: [],
          stateChanges: [],
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
      const environmentState = connectionManager.getEnvironmentState();

      try {
        const renderResult = await uiHostManager.renderInBrowser(
          html,
          protocol,
          toolResult,
          input.tool,
          environmentState,
          viewport
        );

        const { page } = renderResult;
        errors.push(...renderResult.errors);

        // Capture tool calls from console messages (host page logs them)
        page.on("console", (msg) => {
          const text = msg.text();
          if (text.startsWith("[WIDGET_TOOL_CALL] ")) {
            try {
              const data = JSON.parse(text.replace("[WIDGET_TOOL_CALL] ", "")) as {
                name: string;
                args: unknown;
              };
              toolCalls.push(data);
            } catch {
              // Ignore parse errors
            }
          }
        });

        // Get the widget iframe for interactions
        const frame = page.frame({ url: /\/widget\// });
        if (!frame) {
          errors.push("Widget iframe not found");
          await page.close();
          await uiHostManager.dispose();
          return {
            hasUI: true,
            protocol,
            snapshots,
            toolCalls,
            stateChanges,
            errors,
          };
        }

        // Perform each interaction on the iframe
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
                  await frame.click(selector);
                } else if (position) {
                  // For position-based clicks, use page mouse (frame doesn't have mouse)
                  // Note: position is relative to viewport, may need adjustment for iframe offset
                  await page.mouse.click(position.x, position.y);
                }
                break;

              case "type":
                if (selector && text) {
                  await frame.fill(selector, text);
                }
                break;

              case "hover":
                if (selector) {
                  await frame.hover(selector);
                }
                break;

              case "wait":
                await page.waitForTimeout(ms ?? 100);
                break;

              case "scroll":
                if (position) {
                  const scrollX = position.x;
                  const scrollY = position.y;
                  // Function runs in browser context via Playwright frame.evaluate
                  await frame.evaluate(
                    ({ x, y }: { x: number; y: number }) => {
                      // eslint-disable-next-line no-undef
                      window.scrollTo(x, y);
                    },
                    { x: scrollX, y: scrollY }
                  );
                }
                break;

              case "snapshot": {
                // Get snapshot from the iframe content
                const html = await frame.content();
                const textContent = await frame.evaluate(
                  () =>
                    // eslint-disable-next-line no-undef
                    document.body?.textContent?.trim() ?? ""
                );
                snapshots.push({
                  afterAction: i,
                  dom: html,
                  textContent,
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
