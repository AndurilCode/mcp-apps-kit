/**
 * Widget Query Tool
 *
 * Query elements in a widget using semantic locators (text, role, label, etc.)
 * to discover elements before interacting with them.
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "../connection";
import type { WidgetQueryOutput, QueryElementInfo } from "../types";
import { hasLocatorOptions, describeLocatorStrategy } from "./helpers";

// =============================================================================
// SCHEMAS
// =============================================================================

export const widgetQueryInputSchema = z.object({
  sessionId: z.string().describe("Session ID of the widget"),
  // Semantic locator options (use one)
  selector: z.string().optional().describe("CSS selector to query"),
  text: z.string().optional().describe("Visible text to find"),
  role: z.string().optional().describe("ARIA role to find (e.g., 'button', 'textbox')"),
  name: z.string().optional().describe("Accessible name (use with role)"),
  label: z.string().optional().describe("Label text for form elements"),
  placeholder: z.string().optional().describe("Placeholder text for inputs"),
  testId: z.string().optional().describe("data-testid attribute value"),
  exact: z.boolean().optional().describe("Match text exactly (default: false for substring)"),
  // Options
  maxResults: z.number().optional().describe("Maximum elements to return (default: 10)"),
  timeout: z.number().optional().describe("Timeout in ms (default: 5000)"),
});

export const widgetQueryOutputSchema = z.object({
  success: z.boolean(),
  count: z.number().optional(),
  elements: z
    .array(
      z.object({
        index: z.number(),
        tagName: z.string(),
        role: z.string().optional(),
        name: z.string().optional(),
        textContent: z.string(),
        value: z.string().optional(),
        isVisible: z.boolean(),
        isEnabled: z.boolean(),
        attributes: z.record(z.string(), z.string()).optional(),
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
  locatorStrategy: z.string().optional(),
  error: z.string().optional(),
});

// =============================================================================
// TOOL IMPLEMENTATION
// =============================================================================

export function createWidgetQueryTool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Query elements in a widget using semantic locators (text, role, label, placeholder, " +
      "testId, or CSS selector). Returns accessible properties and state. " +
      "Use this to discover elements before interacting with them.",
    input: widgetQueryInputSchema,
    output: widgetQueryOutputSchema,
    handler: async (input): Promise<WidgetQueryOutput> => {
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

      // Validate that at least one locator option is provided
      if (!hasLocatorOptions(input)) {
        return {
          success: false,
          error:
            "No locator specified. Provide one of: selector, text, role, label, placeholder, or testId",
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

        // Resolve the locator using semantic options
        // Note: resolveLocator returns .first(), but we need to count all matches
        // So we rebuild the base locator without .first()
        const locatorOptions = {
          selector: input.selector,
          text: input.text,
          role: input.role,
          name: input.name,
          label: input.label,
          placeholder: input.placeholder,
          testId: input.testId,
          exact: input.exact,
        };

        // Get a locator that matches all elements (not just first)
        let baseLocator;
        if (input.selector) {
          baseLocator = frame.locator(input.selector);
        } else if (input.testId) {
          baseLocator = frame.getByTestId(input.testId);
        } else if (input.role) {
          const roleOptions: { name?: string | RegExp; exact?: boolean } = {};
          if (input.name) {
            roleOptions.name = input.exact
              ? input.name
              : new RegExp(input.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            roleOptions.exact = input.exact;
          }
          baseLocator = frame.getByRole(
            input.role as Parameters<typeof frame.getByRole>[0],
            roleOptions
          );
        } else if (input.label) {
          baseLocator = frame.getByLabel(input.label, { exact: input.exact });
        } else if (input.placeholder) {
          baseLocator = frame.getByPlaceholder(input.placeholder, { exact: input.exact });
        } else if (input.text) {
          baseLocator = frame.getByText(input.text, { exact: input.exact });
        } else {
          // This shouldn't happen due to hasLocatorOptions check, but handle it
          return {
            success: false,
            error: "No valid locator options provided",
          };
        }

        const locatorStrategy = describeLocatorStrategy(locatorOptions);
        const count = await baseLocator.count();
        const maxResults = input.maxResults ?? 10;
        const elements: QueryElementInfo[] = [];

        for (let i = 0; i < Math.min(count, maxResults); i++) {
          const el = baseLocator.nth(i);

          try {
            const [
              tagName,
              textContent,
              value,
              isVisible,
              isEnabled,
              boundingBox,
              ariaRole,
              ariaName,
              id,
              className,
            ] = await Promise.all([
              el.evaluate((e) => e.tagName.toLowerCase()),
              el.textContent().then((t) => t?.trim().slice(0, 200) ?? ""),
              el.inputValue().catch(() => undefined),
              el.isVisible(),
              el.isEnabled(),
              el.boundingBox(),
              el.getAttribute("role"),
              el.getAttribute("aria-label"),
              el.getAttribute("id"),
              el.getAttribute("class"),
            ]);

            // Build attributes object for key identifying attributes
            const attributes: Record<string, string> = {};
            if (id) attributes["id"] = id;
            if (className) attributes["class"] = className;

            elements.push({
              index: i,
              tagName,
              role: ariaRole ?? undefined,
              name: ariaName ?? undefined,
              textContent,
              value,
              isVisible,
              isEnabled,
              attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
              boundingBox: boundingBox ?? undefined,
            });
          } catch {
            // Element may have been removed from DOM during iteration
            // Skip it and continue
          }
        }

        return {
          success: true,
          count,
          elements,
          locatorStrategy,
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
