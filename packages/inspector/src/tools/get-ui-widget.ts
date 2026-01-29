/**
 * get_ui_widget tool
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "../connection";
import type { GetUIWidgetOutput, UIWidgetMetadata, UIWidgetCSP } from "../types";

// MCP Apps MIME type
const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
// OpenAI Apps SDK MIME type
const OPENAI_MIME_TYPE = "text/html+skybridge";

/**
 * Check if resource is a UI widget based on MIME type
 */
function isUIWidget(mimeType: string | undefined): boolean {
  return mimeType === MCP_APP_MIME_TYPE || mimeType === OPENAI_MIME_TYPE;
}

/**
 * Parse metadata from resource _meta
 */
function parseMetadata(meta: Record<string, unknown> | undefined): UIWidgetMetadata {
  if (!meta) return {};

  const result: UIWidgetMetadata = {};

  // MCP Apps format: _meta.ui.*
  const uiMeta = meta.ui as Record<string, unknown> | undefined;
  if (uiMeta) {
    if (typeof uiMeta.prefersBorder === "boolean") {
      result.prefersBorder = uiMeta.prefersBorder;
    }
    if (typeof uiMeta.autoResize === "boolean") {
      result.autoResize = uiMeta.autoResize;
    }
    if (typeof uiMeta.domain === "string") {
      result.domain = uiMeta.domain;
    }
    if (typeof uiMeta.widgetDescription === "string") {
      result.widgetDescription = uiMeta.widgetDescription;
    }

    // Parse CSP
    const cspMeta = uiMeta.csp as Record<string, unknown> | undefined;
    if (cspMeta) {
      const csp: UIWidgetCSP = {};
      if (Array.isArray(cspMeta.connectDomains)) {
        csp.connectDomains = cspMeta.connectDomains as string[];
      }
      if (Array.isArray(cspMeta.resourceDomains)) {
        csp.resourceDomains = cspMeta.resourceDomains as string[];
      }
      if (Array.isArray(cspMeta.redirectDomains)) {
        csp.redirectDomains = cspMeta.redirectDomains as string[];
      }
      if (Array.isArray(cspMeta.frameDomains)) {
        csp.frameDomains = cspMeta.frameDomains as string[];
      }
      if (Object.keys(csp).length > 0) {
        result.csp = csp;
      }
    }
  }

  // OpenAI format: flat keys with openai/ prefix
  if (typeof meta["openai/widgetPrefersBorder"] === "boolean") {
    result.prefersBorder = meta["openai/widgetPrefersBorder"];
  }
  if (typeof meta["openai/widgetDomain"] === "string") {
    result.domain = meta["openai/widgetDomain"];
  }
  if (typeof meta["openai/widgetDescription"] === "string") {
    result.widgetDescription = meta["openai/widgetDescription"];
  }

  // OpenAI CSP format
  const openaiCSP = meta["openai/widgetCSP"] as Record<string, unknown> | undefined;
  if (openaiCSP) {
    const csp: UIWidgetCSP = result.csp ?? {};
    if (Array.isArray(openaiCSP.connect_domains)) {
      csp.connectDomains = openaiCSP.connect_domains as string[];
    }
    if (Array.isArray(openaiCSP.resource_domains)) {
      csp.resourceDomains = openaiCSP.resource_domains as string[];
    }
    if (Array.isArray(openaiCSP.redirect_domains)) {
      csp.redirectDomains = openaiCSP.redirect_domains as string[];
    }
    if (Array.isArray(openaiCSP.frame_domains)) {
      csp.frameDomains = openaiCSP.frame_domains as string[];
    }
    if (Object.keys(csp).length > 0) {
      result.csp = csp;
    }
  }

  return result;
}

export const getUIWidgetInputSchema = z.object({
  uri: z.string().describe("URI of the UI widget to retrieve"),
});

export const getUIWidgetOutputSchema = z.object({
  uri: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  mimeType: z.string(),
  html: z.string(),
  htmlLength: z.number(),
  metadata: z.object({
    prefersBorder: z.boolean().optional(),
    autoResize: z.boolean().optional(),
    domain: z.string().optional(),
    widgetDescription: z.string().optional(),
    csp: z
      .object({
        connectDomains: z.array(z.string()).optional(),
        resourceDomains: z.array(z.string()).optional(),
        redirectDomains: z.array(z.string()).optional(),
        frameDomains: z.array(z.string()).optional(),
      })
      .optional(),
  }),
});

export function createGetUIWidgetTool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Get the HTML content and metadata for a specific UI widget by URI. Returns the full widget HTML, parsed metadata, and CSP configuration.",
    input: getUIWidgetInputSchema,
    output: getUIWidgetOutputSchema,
    handler: async (input): Promise<GetUIWidgetOutput> => {
      const client = connectionManager.getClient();
      const rawClient = client.raw;

      // Validate URI format
      try {
        new URL(input.uri);
      } catch {
        throw new Error(`Invalid URI format: '${input.uri}'`);
      }

      // First, list resources to find metadata for this URI
      const resourcesResult = await rawClient.listResources();
      const resourceInfo = resourcesResult.resources.find((r) => r.uri === input.uri);

      // Check if resource exists
      if (!resourceInfo) {
        throw new Error(`UI widget not found: ${input.uri}`);
      }

      // Check if it's a UI widget
      if (!isUIWidget(resourceInfo.mimeType)) {
        throw new Error(
          `Resource is not a UI widget: ${input.uri} (mimeType: ${resourceInfo.mimeType ?? "unknown"})`
        );
      }

      // Read the resource content
      let html = "";
      try {
        const contentResult = await rawClient.readResource({ uri: input.uri });
        for (const content of contentResult.contents) {
          if ("text" in content && typeof content.text === "string") {
            html += content.text;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to read UI widget: ${input.uri}: ${message}`);
      }

      // Parse metadata from resource _meta
      const meta = resourceInfo._meta as Record<string, unknown> | undefined;

      return {
        uri: input.uri,
        name: resourceInfo.name,
        description: resourceInfo.description,
        mimeType: resourceInfo.mimeType ?? "unknown",
        html,
        htmlLength: html.length,
        metadata: parseMetadata(meta),
      };
    },
  });
}
