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
});

export function createWidgetFillTool(connectionManager: ConnectionManager) {
  return defineTool({
    description: "Fill an input element in a widget iframe with a value.",
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
        await frame.fill(input.selector, input.value, { timeout });

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
