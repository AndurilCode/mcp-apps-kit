/**
 * test_widget_interaction tool
 *
 * Tests widget interactions by performing actions (click, type, etc.)
 * and capturing DOM snapshots after each action.
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionRegistry } from "../connection-registry";
import type { TestWidgetInteractionOutput } from "../types";
import { UIHostManager, type DetectedProtocol } from "../ui-host";
import {
  extractToolResult,
  findUIResourceForTool,
  fetchWidgetHTML,
  resolveProtocol,
} from "./helpers";

const interactionActionSchema = z.object({
  action: z
    .enum(["click", "type", "hover", "wait", "snapshot", "scroll", "drag"])
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
  target: z
    .union([
      z.string().describe("CSS selector for drag target"),
      z.object({ x: z.number(), y: z.number() }).describe("Position for drag target"),
    ])
    .optional()
    .describe("Target element or position for drag action"),
  steps: z.number().optional().describe("Number of steps for drag animation (default: 10)"),
});

export const testWidgetInteractionInputSchema = z.object({
  connectionId: z.string().optional().describe("Connection ID. Defaults to active connection."),
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

/**
 * @deprecated Use individual widget tools instead: widget_click, widget_fill, widget_drag, widget_snapshot.
 * This tool will be removed in a future version.
 *
 * Migration guide:
 * - For clicking: use widget_click with semantic locators
 * - For typing: use widget_fill with label/placeholder locators
 * - For dragging: use widget_drag with source/target selectors
 * - For snapshots: use widget_snapshot (returns accessibility tree)
 * - For assertions: use widget_snapshot_diff to compare states
 */
export function createTestWidgetInteractionTool(registry: ConnectionRegistry) {
  return defineTool({
    description:
      "[DEPRECATED - Use widget_click, widget_fill, widget_drag, widget_snapshot instead] " +
      "Test widget interactions by performing a sequence of actions (click, type, hover, wait) and capturing DOM snapshots. Can use an existing session. Returns snapshots after snapshot actions, plus any tool calls and state changes made by the widget.",
    input: testWidgetInteractionInputSchema,
    output: testWidgetInteractionOutputSchema,
    handler: async (input): Promise<TestWidgetInteractionOutput> => {
      const connectionManager = registry.resolveConnection(input.connectionId);
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
                  await page.waitForTimeout(ms ?? 100);
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

                case "drag":
                  {
                    const target = actionItem.target;
                    const dragSteps = actionItem.steps ?? 10;
                    if (!target) {
                      errors.push(`Action ${i} (drag) failed: target is required`);
                      break;
                    }

                    // Get source position
                    let startX: number, startY: number;
                    if (selector) {
                      const sourceBbox = await frame.locator(selector).first().boundingBox();
                      if (!sourceBbox) {
                        errors.push(`Action ${i} (drag) failed: source not found`);
                        break;
                      }
                      startX = sourceBbox.x + sourceBbox.width / 2;
                      startY = sourceBbox.y + sourceBbox.height / 2;
                    } else if (position) {
                      startX = position.x;
                      startY = position.y;
                    } else {
                      errors.push(`Action ${i} (drag) failed: selector or position required`);
                      break;
                    }

                    // Get target position
                    let endX: number, endY: number;
                    if (typeof target === "string") {
                      const targetBbox = await frame.locator(target).first().boundingBox();
                      if (!targetBbox) {
                        errors.push(`Action ${i} (drag) failed: target not found`);
                        break;
                      }
                      endX = targetBbox.x + targetBbox.width / 2;
                      endY = targetBbox.y + targetBbox.height / 2;
                    } else {
                      endX = target.x;
                      endY = target.y;
                    }

                    // Get iframe offset
                    const frameEl = await frame.frameElement();
                    const frameBbox = await frameEl.boundingBox();
                    const offsetX = frameBbox?.x ?? 0;
                    const offsetY = frameBbox?.y ?? 0;

                    // Perform drag
                    const mouse = page.mouse;
                    await mouse.move(offsetX + startX, offsetY + startY);
                    await mouse.down();
                    for (let step = 1; step <= dragSteps; step++) {
                      const progress = step / dragSteps;
                      await mouse.move(
                        offsetX + startX + (endX - startX) * progress,
                        offsetY + startY + (endY - startY) * progress
                      );
                      await page.waitForTimeout(10);
                    }
                    await mouse.up();
                    await page.waitForTimeout(50);
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
        toolResult = extractToolResult(callResult);
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
      const uiResource = await findUIResourceForTool(rawClient, input.tool);
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
      const protocol: DetectedProtocol = resolveProtocol(uiResource.protocol, input.protocol);

      // Step 4: Fetch the widget HTML
      let html: string;
      try {
        html = await fetchWidgetHTML(rawClient, uiResource.uri);
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
      const inspectorUrl = connectionManager.getInspectorUrl();

      try {
        // Set up console listener BEFORE rendering to capture all tool calls from initial render
        const consoleHandler = (msg: import("playwright").ConsoleMessage) => {
          const text = msg.text();
          if (text.startsWith("[WIDGET_TOOL_CALL] ")) {
            try {
              const parsed: unknown = JSON.parse(text.replace("[WIDGET_TOOL_CALL] ", ""));
              // Validate shape: must be an object with string 'name' and 'args' property
              if (
                typeof parsed === "object" &&
                parsed !== null &&
                "name" in parsed &&
                typeof (parsed as Record<string, unknown>).name === "string" &&
                "args" in parsed
              ) {
                toolCalls.push({
                  name: (parsed as Record<string, unknown>).name as string,
                  args: (parsed as Record<string, unknown>).args,
                });
              }
            } catch {
              // Ignore parse errors
            }
          }
        };

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

        const { page } = renderResult;
        errors.push(...renderResult.errors);

        // Attach console handler to capture any future tool calls
        page.on("console", consoleHandler);

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
                if (selector) {
                  if (position) {
                    // Scroll element to specific position
                    await frame.locator(selector).evaluate(
                      (el: Element, { x, y }: { x: number; y: number }) => {
                        el.scrollTo(x, y);
                      },
                      { x: position.x, y: position.y }
                    );
                  } else {
                    // Scroll element into view
                    await frame.locator(selector).scrollIntoViewIfNeeded();
                  }
                } else if (position) {
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

              case "drag":
                {
                  const target = actionItem.target;
                  const dragSteps = actionItem.steps ?? 10;
                  if (!target) {
                    errors.push(`Action ${i} (drag) failed: target is required`);
                    break;
                  }

                  // Get source position
                  let startX: number, startY: number;
                  if (selector) {
                    const sourceBbox = await frame.locator(selector).first().boundingBox();
                    if (!sourceBbox) {
                      errors.push(`Action ${i} (drag) failed: source not found`);
                      break;
                    }
                    startX = sourceBbox.x + sourceBbox.width / 2;
                    startY = sourceBbox.y + sourceBbox.height / 2;
                  } else if (position) {
                    startX = position.x;
                    startY = position.y;
                  } else {
                    errors.push(`Action ${i} (drag) failed: selector or position required`);
                    break;
                  }

                  // Get target position
                  let endX: number, endY: number;
                  if (typeof target === "string") {
                    const targetBbox = await frame.locator(target).first().boundingBox();
                    if (!targetBbox) {
                      errors.push(`Action ${i} (drag) failed: target not found`);
                      break;
                    }
                    endX = targetBbox.x + targetBbox.width / 2;
                    endY = targetBbox.y + targetBbox.height / 2;
                  } else {
                    endX = target.x;
                    endY = target.y;
                  }

                  // Get iframe offset
                  const frameEl = await frame.frameElement();
                  const frameBbox = await frameEl.boundingBox();
                  const offsetX = frameBbox?.x ?? 0;
                  const offsetY = frameBbox?.y ?? 0;

                  // Perform drag
                  const mouse = page.mouse;
                  await mouse.move(offsetX + startX, offsetY + startY);
                  await mouse.down();
                  for (let step = 1; step <= dragSteps; step++) {
                    const progress = step / dragSteps;
                    await mouse.move(
                      offsetX + startX + (endX - startX) * progress,
                      offsetY + startY + (endY - startY) * progress
                    );
                    await page.waitForTimeout(10);
                  }
                  await mouse.up();
                  await page.waitForTimeout(50);
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
          toolCalls,
          stateChanges,
          errors: [`Interaction test failed: ${message}`],
        };
      }
    },
  });
}
