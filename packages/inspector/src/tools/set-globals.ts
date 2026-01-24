/**
 * set_globals, get_globals, and reset_globals tools
 *
 * Manage environment state for widget rendering and testing.
 * Settings affect subsequent preview_ui, screenshot_widget, and test_widget_interaction calls.
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "../connection";
import type { SetGlobalsOutput, GetGlobalsOutput, ResetGlobalsOutput } from "../types";

const viewportSchema = z.object({
  width: z.number().int().positive().describe("Width in pixels"),
  height: z.number().int().positive().describe("Height in pixels"),
});

const safeAreaInsetsSchema = z.object({
  top: z.number().min(0).describe("Top inset in pixels"),
  right: z.number().min(0).describe("Right inset in pixels"),
  bottom: z.number().min(0).describe("Bottom inset in pixels"),
  left: z.number().min(0).describe("Left inset in pixels"),
});

const userAgentSchema = z.object({
  device: z
    .object({
      type: z.string().optional().describe("Device type (e.g., 'desktop', 'mobile', 'tablet')"),
    })
    .optional(),
  capabilities: z
    .object({
      hover: z.boolean().optional().describe("Whether device supports hover"),
      touch: z.boolean().optional().describe("Whether device supports touch"),
    })
    .optional(),
});

const userLocationSchema = z.object({
  city: z.string().optional().describe("City name"),
  region: z.string().optional().describe("Region/state name"),
  country: z.string().optional().describe("Country code (e.g., 'US', 'UK')"),
  timezone: z.string().optional().describe("Timezone (e.g., 'America/New_York')"),
});

export const setGlobalsInputSchema = z.object({
  theme: z.enum(["light", "dark"]).optional().describe("UI theme"),
  locale: z.string().optional().describe("BCP 47 locale code (e.g., 'en-US', 'fr-FR')"),
  timeZone: z.string().optional().describe("IANA timezone (e.g., 'UTC', 'America/New_York')"),
  displayMode: z.enum(["inline", "fullscreen", "pip"]).optional().describe("Widget display mode"),
  viewport: viewportSchema.optional().describe("Screen dimensions"),
  maxHeight: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .describe("Max widget height in pixels (null to unset)"),
  safeAreaInsets: safeAreaInsetsSchema.optional().describe("Mobile safe area insets"),
  userAgent: userAgentSchema.optional().describe("Device and capability information"),
  userLocation: userLocationSchema
    .nullable()
    .optional()
    .describe("User location information (null to unset)"),
});

export const setGlobalsOutputSchema = z.object({
  updated: z.boolean(),
  currentState: z.object({
    theme: z.enum(["light", "dark"]),
    locale: z.string(),
    timeZone: z.string(),
    displayMode: z.enum(["inline", "fullscreen", "pip"]),
    viewport: viewportSchema,
    maxHeight: z.number().int().positive().optional(),
    safeAreaInsets: safeAreaInsetsSchema,
    userAgent: userAgentSchema,
    userLocation: userLocationSchema.optional(),
  }),
  message: z.string().optional(),
});

export const getGlobalsOutputSchema = z.object({
  currentState: z.object({
    theme: z.enum(["light", "dark"]),
    locale: z.string(),
    timeZone: z.string(),
    displayMode: z.enum(["inline", "fullscreen", "pip"]),
    viewport: viewportSchema,
    maxHeight: z.number().int().positive().optional(),
    safeAreaInsets: safeAreaInsetsSchema,
    userAgent: userAgentSchema,
    userLocation: userLocationSchema.optional(),
  }),
});

export const resetGlobalsOutputSchema = z.object({
  reset: z.boolean(),
  currentState: z.object({
    theme: z.enum(["light", "dark"]),
    locale: z.string(),
    timeZone: z.string(),
    displayMode: z.enum(["inline", "fullscreen", "pip"]),
    viewport: viewportSchema,
    maxHeight: z.number().int().positive().optional(),
    safeAreaInsets: safeAreaInsetsSchema,
    userAgent: userAgentSchema,
    userLocation: userLocationSchema.optional(),
  }),
});

export function createSetGlobalsTool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Configure environment settings (theme, locale, device, location) for widget rendering and testing. Settings affect subsequent preview_ui, screenshot_widget, and test_widget_interaction calls. Supports both MCP Apps and OpenAI protocols.",
    input: setGlobalsInputSchema,
    output: setGlobalsOutputSchema,
    handler: async (input): Promise<SetGlobalsOutput> => {
      // Handle null values (used to unset optional fields)
      const updatePayload: Record<string, unknown> = {};

      if (input.theme !== undefined) updatePayload.theme = input.theme;
      if (input.locale !== undefined) updatePayload.locale = input.locale;
      if (input.timeZone !== undefined) updatePayload.timeZone = input.timeZone;
      if (input.displayMode !== undefined) updatePayload.displayMode = input.displayMode;
      if (input.viewport !== undefined) updatePayload.viewport = input.viewport;
      if (input.maxHeight !== undefined) updatePayload.maxHeight = input.maxHeight ?? undefined;
      if (input.safeAreaInsets !== undefined) updatePayload.safeAreaInsets = input.safeAreaInsets;
      if (input.userAgent !== undefined) updatePayload.userAgent = input.userAgent;
      if (input.userLocation !== undefined)
        updatePayload.userLocation = input.userLocation ?? undefined;

      const currentState = connectionManager.setEnvironmentState(updatePayload);

      // Propagate changes to all active widget sessions
      const sessionManager = connectionManager.getWidgetSessionManager();
      const updatedSessions = await sessionManager.updateAllSessionGlobals(currentState);

      const changedFields = Object.keys(updatePayload);
      const message =
        changedFields.length > 0
          ? `Updated ${changedFields.length} setting(s): ${changedFields.join(", ")}. Propagated to ${updatedSessions} active session(s).`
          : "No settings were changed";

      return {
        updated: changedFields.length > 0,
        currentState,
        message,
      };
    },
  });
}

export function createGetGlobalsTool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Get current environment settings for widget rendering and testing. Returns theme, locale, device, location, and other configuration.",
    input: z.object({}),
    output: getGlobalsOutputSchema,
    handler: async (): Promise<GetGlobalsOutput> => {
      const currentState = connectionManager.getEnvironmentState();

      return {
        currentState,
      };
    },
  });
}

export function createResetGlobalsTool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Reset all environment settings to defaults (light theme, en-US locale, desktop device, etc.). Use this to start testing from a clean state.",
    input: z.object({}),
    output: resetGlobalsOutputSchema,
    handler: async (): Promise<ResetGlobalsOutput> => {
      const currentState = connectionManager.resetEnvironmentState();

      return {
        reset: true,
        currentState,
      };
    },
  });
}
