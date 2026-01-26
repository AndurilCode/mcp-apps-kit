/**
 * Widget Control Tools for Dual Mode
 *
 * These tools allow coding agents to interact with widget sessions
 * created via /apps/mcp (ChatGPT). All tools use Playwright for browser automation.
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "../connection";
import type {
  WidgetEvaluateOutput,
  WidgetClickOutput,
  WidgetFillOutput,
  WidgetWaitForSelectorOutput,
  WidgetLocatorOutput,
  LocatorElementInfo,
  WidgetDragOutput,
  WidgetRefreshOutput,
} from "../types";

// =============================================================================
// WIDGET EVALUATE TOOL
// =============================================================================

export const widgetEvaluateInputSchema = z.object({
  sessionId: z.string().describe("Session ID of the widget to evaluate in"),
  expression: z.string().describe("JavaScript code to evaluate in the widget iframe"),
});

export const widgetEvaluateOutputSchema = z.object({
  success: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

export function createWidgetEvaluateTool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Execute JavaScript code in a widget iframe. The expression is evaluated in the context of the widget and the result is returned (must be JSON-serializable).",
    input: widgetEvaluateInputSchema,
    output: widgetEvaluateOutputSchema,
    handler: async (input): Promise<WidgetEvaluateOutput> => {
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
        // Target the widget iframe
        const frame = session.page.frame({ url: /\/widget\// });
        if (!frame) {
          return {
            success: false,
            error: "Widget iframe not found",
          };
        }

        // Evaluate the expression in the widget iframe
        // Intentionally using eval to execute arbitrary JS in widget context
        const result: unknown = await frame.evaluate((expr: string) => {
          return eval(expr) as unknown;
        }, input.expression);

        return {
          success: true,
          result,
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

// =============================================================================
// WIDGET CLICK TOOL
// =============================================================================

export const widgetClickInputSchema = z.object({
  sessionId: z.string().describe("Session ID of the widget"),
  selector: z.string().describe("CSS selector of the element to click"),
  timeout: z.number().optional().describe("Timeout in ms (default: 5000)"),
});

export const widgetClickOutputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

export function createWidgetClickTool(connectionManager: ConnectionManager) {
  return defineTool({
    description: "Click an element in a widget iframe by CSS selector.",
    input: widgetClickInputSchema,
    output: widgetClickOutputSchema,
    handler: async (input): Promise<WidgetClickOutput> => {
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
        // Target the widget iframe
        const frame = session.page.frame({ url: /\/widget\// });
        if (!frame) {
          return {
            success: false,
            error: "Widget iframe not found",
          };
        }

        const timeout = input.timeout ?? 5000;
        await frame.click(input.selector, { timeout });

        return { success: true };
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

// =============================================================================
// WIDGET FILL TOOL
// =============================================================================

export const widgetFillInputSchema = z.object({
  sessionId: z.string().describe("Session ID of the widget"),
  selector: z.string().describe("CSS selector of the input element"),
  value: z.string().describe("Value to fill in the input"),
  timeout: z.number().optional().describe("Timeout in ms (default: 5000)"),
});

export const widgetFillOutputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  elementType: z.string().optional(),
  fillMethod: z.enum(["fill", "type", "selectOption", "contenteditable"]).optional(),
});

export function createWidgetFillTool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Fill an input, textarea, select, or contenteditable element in a widget iframe with a value. Automatically detects element type and uses the appropriate fill method.",
    input: widgetFillInputSchema,
    output: widgetFillOutputSchema,
    handler: async (input): Promise<WidgetFillOutput> => {
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
        // Target the widget iframe
        const frame = session.page.frame({ url: /\/widget\// });
        if (!frame) {
          return {
            success: false,
            error: "Widget iframe not found",
          };
        }

        const timeout = input.timeout ?? 5000;
        const locator = frame.locator(input.selector).first();

        // Wait for element to be visible
        await locator.waitFor({ state: "visible", timeout });

        // Detect element type
        const elementInfo = await locator.evaluate((el) => {
          const tagName = el.tagName.toLowerCase();
          const isContentEditable =
            el.getAttribute("contenteditable") === "true" ||
            el.getAttribute("contenteditable") === "";
          const inputType = el.getAttribute("type") ?? "text";
          return { tagName, isContentEditable, inputType };
        });

        const { tagName, isContentEditable, inputType } = elementInfo;
        let fillMethod: "fill" | "type" | "selectOption" | "contenteditable" = "fill";
        let elementType = tagName;

        // Handle different element types
        if (tagName === "select") {
          // For select elements, use selectOption
          fillMethod = "selectOption";
          await locator.selectOption(input.value, { timeout });
        } else if (isContentEditable) {
          // For contenteditable elements, use click + type with clear
          fillMethod = "contenteditable";
          elementType = `${tagName}[contenteditable]`;
          await locator.click({ timeout });
          // Select all and delete existing content
          await locator.press("Control+a");
          await locator.press("Backspace");
          // Type the new value
          await locator.pressSequentially(input.value, { delay: 10 });
        } else if (tagName === "textarea") {
          // For textarea, try fill first, fall back to type if needed
          elementType = "textarea";
          try {
            await locator.fill(input.value, { timeout });
            fillMethod = "fill";
          } catch {
            // Fallback: click, clear, and type
            fillMethod = "type";
            await locator.click({ timeout });
            await locator.press("Control+a");
            await locator.pressSequentially(input.value, { delay: 10 });
          }
        } else if (tagName === "input") {
          elementType = `input[type=${inputType}]`;
          // For input elements, use standard fill
          await locator.fill(input.value, { timeout });
          fillMethod = "fill";
        } else {
          // Unknown element type - try fill, then type as fallback
          try {
            await locator.fill(input.value, { timeout });
            fillMethod = "fill";
          } catch {
            // Fallback: click and type
            fillMethod = "type";
            await locator.click({ timeout });
            await locator.pressSequentially(input.value, { delay: 10 });
          }
        }

        return {
          success: true,
          elementType,
          fillMethod,
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

// =============================================================================
// WIDGET WAIT FOR SELECTOR TOOL
// =============================================================================

export const widgetWaitForSelectorInputSchema = z.object({
  sessionId: z.string().describe("Session ID of the widget"),
  selector: z.string().describe("CSS selector to wait for"),
  state: z
    .enum(["attached", "detached", "visible", "hidden"])
    .optional()
    .describe("State to wait for (default: visible)"),
  timeout: z.number().optional().describe("Timeout in ms (default: 5000)"),
});

export const widgetWaitForSelectorOutputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

export function createWidgetWaitForSelectorTool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Wait for an element matching a CSS selector to reach a specific state in a widget iframe.",
    input: widgetWaitForSelectorInputSchema,
    output: widgetWaitForSelectorOutputSchema,
    handler: async (input): Promise<WidgetWaitForSelectorOutput> => {
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
        // Target the widget iframe
        const frame = session.page.frame({ url: /\/widget\// });
        if (!frame) {
          return {
            success: false,
            error: "Widget iframe not found",
          };
        }

        const timeout = input.timeout ?? 5000;
        const state = input.state ?? "visible";
        await frame.waitForSelector(input.selector, { state, timeout });

        return { success: true };
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

// =============================================================================
// WIDGET LOCATOR TOOL
// =============================================================================

export const widgetLocatorInputSchema = z.object({
  sessionId: z.string().describe("Session ID of the widget"),
  selector: z.string().describe("CSS selector to query"),
  timeout: z.number().optional().describe("Timeout in ms (default: 5000)"),
});

export const widgetLocatorOutputSchema = z.object({
  success: z.boolean(),
  count: z.number().optional(),
  elements: z
    .array(
      z.object({
        tagName: z.string(),
        textContent: z.string(),
        id: z.string().optional(),
        className: z.string().optional(),
        isVisible: z.boolean(),
        isEnabled: z.boolean(),
        boundingBox: z
          .object({
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number(),
          })
          .optional(),
      })
    )
    .optional(),
  error: z.string().optional(),
});

export function createWidgetLocatorTool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Query elements in a widget iframe by CSS selector. Returns info about matching elements (up to 10).",
    input: widgetLocatorInputSchema,
    output: widgetLocatorOutputSchema,
    handler: async (input): Promise<WidgetLocatorOutput> => {
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
        // Target the widget iframe
        const frame = session.page.frame({ url: /\/widget\// });
        if (!frame) {
          return {
            success: false,
            error: "Widget iframe not found",
          };
        }

        const locator = frame.locator(input.selector);
        const count = await locator.count();

        // Get info for first 10 elements
        const elements: LocatorElementInfo[] = [];
        const maxElements = Math.min(count, 10);

        for (let i = 0; i < maxElements; i++) {
          const el = locator.nth(i);

          const [tagName, textContent, id, className, isVisible, isEnabled, boundingBox] =
            await Promise.all([
              el.evaluate((e) => e.tagName.toLowerCase()),
              el.textContent().then((t) => t?.trim() ?? ""),
              el.getAttribute("id").then((v) => v ?? undefined),
              el.getAttribute("class").then((v) => v ?? undefined),
              el.isVisible(),
              el.isEnabled(),
              el.boundingBox(),
            ]);

          elements.push({
            tagName,
            textContent,
            id,
            className,
            isVisible,
            isEnabled,
            boundingBox: boundingBox ?? undefined,
          });
        }

        return {
          success: true,
          count,
          elements,
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

// =============================================================================
// WIDGET DRAG TOOL
// =============================================================================

export const widgetDragInputSchema = z.object({
  sessionId: z.string().describe("Session ID of the widget"),
  source: z
    .union([
      z.string().describe("CSS selector of the element to drag"),
      z.object({ x: z.number(), y: z.number() }).describe("Position to start drag from"),
    ])
    .describe("Source element (selector) or position to drag from"),
  target: z
    .union([
      z.string().describe("CSS selector of the element to drop on"),
      z.object({ x: z.number(), y: z.number() }).describe("Position to drop at"),
    ])
    .describe("Target element (selector) or position to drop at"),
  timeout: z.number().optional().describe("Timeout in ms (default: 5000)"),
  steps: z
    .number()
    .optional()
    .describe("Number of intermediate steps for smoother drag animation (default: 10)"),
});

export const widgetDragOutputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  startPosition: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
  endPosition: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
});

export function createWidgetDragTool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Drag an element from source to target in a widget iframe. Supports both CSS selectors and pixel positions. Useful for drag-and-drop interactions like moving tasks between columns.",
    input: widgetDragInputSchema,
    output: widgetDragOutputSchema,
    handler: async (input): Promise<WidgetDragOutput> => {
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
        // Target the widget iframe
        const frame = session.page.frame({ url: /\/widget\// });
        if (!frame) {
          return {
            success: false,
            error: "Widget iframe not found",
          };
        }

        const timeout = input.timeout ?? 5000;
        const steps = input.steps ?? 10;

        // Get start position
        let startPosition: { x: number; y: number };
        if (typeof input.source === "string") {
          const sourceLocator = frame.locator(input.source).first();
          await sourceLocator.waitFor({ state: "visible", timeout });
          const sourceBbox = await sourceLocator.boundingBox();
          if (!sourceBbox) {
            return {
              success: false,
              error: `Source element not found or not visible: ${input.source}`,
            };
          }
          // Center of the source element
          startPosition = {
            x: sourceBbox.x + sourceBbox.width / 2,
            y: sourceBbox.y + sourceBbox.height / 2,
          };
        } else {
          startPosition = input.source;
        }

        // Get end position
        let endPosition: { x: number; y: number };
        if (typeof input.target === "string") {
          const targetLocator = frame.locator(input.target).first();
          await targetLocator.waitFor({ state: "visible", timeout });
          const targetBbox = await targetLocator.boundingBox();
          if (!targetBbox) {
            return {
              success: false,
              error: `Target element not found or not visible: ${input.target}`,
            };
          }
          // Center of the target element
          endPosition = {
            x: targetBbox.x + targetBbox.width / 2,
            y: targetBbox.y + targetBbox.height / 2,
          };
        } else {
          endPosition = input.target;
        }

        // Get the iframe's position relative to the page to adjust coordinates
        const frameElement = await frame.frameElement();
        const frameBbox = await frameElement.boundingBox();
        if (!frameBbox) {
          return {
            success: false,
            error: "Could not determine iframe position",
          };
        }

        // Adjust positions to page coordinates (add iframe offset)
        const pageStartX = frameBbox.x + startPosition.x;
        const pageStartY = frameBbox.y + startPosition.y;
        const pageEndX = frameBbox.x + endPosition.x;
        const pageEndY = frameBbox.y + endPosition.y;

        // Perform the drag operation using page mouse
        const mouse = session.page.mouse;

        // Move to start position
        await mouse.move(pageStartX, pageStartY);

        // Press mouse button
        await mouse.down();

        // Move in steps to simulate smooth drag
        for (let i = 1; i <= steps; i++) {
          const progress = i / steps;
          const currentX = pageStartX + (pageEndX - pageStartX) * progress;
          const currentY = pageStartY + (pageEndY - pageStartY) * progress;
          await mouse.move(currentX, currentY);
          // Small delay for drag events to register
          await session.page.waitForTimeout(10);
        }

        // Release mouse button
        await mouse.up();

        // Small delay for drop events to process
        await session.page.waitForTimeout(50);

        return {
          success: true,
          startPosition,
          endPosition,
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

// =============================================================================
// WIDGET REFRESH TOOL
// =============================================================================

export const widgetRefreshInputSchema = z.object({
  sessionId: z.string().describe("Session ID of the widget to refresh"),
  tool: z
    .string()
    .optional()
    .describe("Tool name to call for fresh data (defaults to original tool)"),
  arguments: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Arguments for the tool call (defaults to original arguments)"),
});

export const widgetRefreshOutputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  newToolResult: z.unknown().optional(),
  widgetUpdated: z.boolean().optional(),
});

export function createWidgetRefreshTool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Refresh a widget session with fresh data by re-calling the tool and pushing the new result to the widget. This syncs the widget UI with the current server state after mutations.",
    input: widgetRefreshInputSchema,
    output: widgetRefreshOutputSchema,
    handler: async (input): Promise<WidgetRefreshOutput> => {
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

      // Check if connected to server
      const state = connectionManager.getState();
      if (!state.connected) {
        return {
          success: false,
          error: "Not connected to server",
        };
      }

      try {
        // Determine which tool and arguments to use
        const toolName = input.tool ?? session.toolName;
        const toolArgs = input.arguments ?? session.toolArgs;

        // Call the tool to get fresh data
        const client = connectionManager.getClient();
        const result = await client.callTool(toolName, toolArgs);

        // Extract the new tool result
        let newToolResult: unknown;
        if (result.structuredContent) {
          newToolResult = result.structuredContent;
        } else if (result.content.length > 0) {
          const textContent = result.content.find(
            (c: { type: string; text?: string }) => c.type === "text"
          );
          if (textContent?.text) {
            try {
              newToolResult = JSON.parse(textContent.text);
            } catch {
              newToolResult = textContent.text;
            }
          }
        }

        // Update the session's toolResult
        session.toolResult = newToolResult;

        // Push the new data to the widget via postMessage
        const frame = session.page.frame({ url: /\/widget\// });
        let widgetUpdated = false;

        if (frame) {
          try {
            if (session.protocol === "mcp") {
              // MCP protocol: Send ui/context with updated toolOutput
              /* eslint-disable no-undef */
              await session.page.evaluate(
                ({ toolOutput }) => {
                  const iframe = document.getElementById(
                    "widget-frame"
                  ) as HTMLIFrameElement | null;
                  if (iframe?.contentWindow) {
                    // Send updated context to widget
                    iframe.contentWindow.postMessage(
                      {
                        jsonrpc: "2.0",
                        method: "ui/context",
                        params: {
                          toolOutput,
                        },
                      },
                      "*"
                    );
                  }
                },
                { toolOutput: newToolResult }
              );
              /* eslint-enable no-undef */
              widgetUpdated = true;
            } else {
              // OpenAI protocol: Use updateOutput message
              /* eslint-disable no-undef */
              await session.page.evaluate(
                ({ output }) => {
                  const iframe = document.getElementById(
                    "widget-frame"
                  ) as HTMLIFrameElement | null;
                  if (iframe?.contentWindow) {
                    iframe.contentWindow.postMessage(
                      {
                        type: "updateOutput",
                        output,
                      },
                      "*"
                    );
                  }
                },
                { output: newToolResult }
              );
              /* eslint-enable no-undef */
              widgetUpdated = true;
            }
          } catch {
            // Widget update failed, but tool call succeeded
          }
        }

        return {
          success: true,
          newToolResult,
          widgetUpdated,
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
