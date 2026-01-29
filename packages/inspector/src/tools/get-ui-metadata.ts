/**
 * get_ui_metadata tool
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "../connection";
import type { GetUIMetadataOutput, UIProtocol } from "../types";

// MCP Apps MIME type
const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
// OpenAI Apps SDK MIME type
const OPENAI_MIME_TYPE = "text/html+skybridge";

/**
 * Detect protocol from MIME type
 */
function detectProtocol(mimeType: string | undefined): UIProtocol {
  if (!mimeType) return "unknown";
  if (mimeType === MCP_APP_MIME_TYPE) return "mcp-app";
  if (mimeType === OPENAI_MIME_TYPE) return "openai";
  return "unknown";
}

/**
 * Check if resource is a UI widget based on MIME type
 */
function isUIWidget(mimeType: string | undefined): boolean {
  return mimeType === MCP_APP_MIME_TYPE || mimeType === OPENAI_MIME_TYPE;
}

/**
 * Convert raw metadata to MCP format
 */
function toMcpFormat(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!meta) return {};

  // If already in MCP format (has ui.* structure)
  const uiMeta = meta.ui as Record<string, unknown> | undefined;
  if (uiMeta) {
    return { ui: uiMeta };
  }

  // Convert from OpenAI format
  const result: Record<string, unknown> = {};
  const uiObj: Record<string, unknown> = {};

  if (typeof meta["openai/widgetPrefersBorder"] === "boolean") {
    uiObj.prefersBorder = meta["openai/widgetPrefersBorder"];
  }
  if (typeof meta["openai/widgetDomain"] === "string") {
    uiObj.domain = meta["openai/widgetDomain"];
  }
  if (typeof meta["openai/widgetDescription"] === "string") {
    uiObj.widgetDescription = meta["openai/widgetDescription"];
  }

  // Convert OpenAI CSP to MCP format (snake_case to camelCase)
  const openaiCSP = meta["openai/widgetCSP"] as Record<string, unknown> | undefined;
  if (openaiCSP) {
    const csp: Record<string, unknown> = {};
    if (Array.isArray(openaiCSP.connect_domains)) {
      csp.connectDomains = openaiCSP.connect_domains;
    }
    if (Array.isArray(openaiCSP.resource_domains)) {
      csp.resourceDomains = openaiCSP.resource_domains;
    }
    if (Array.isArray(openaiCSP.redirect_domains)) {
      csp.redirectDomains = openaiCSP.redirect_domains;
    }
    if (Array.isArray(openaiCSP.frame_domains)) {
      csp.frameDomains = openaiCSP.frame_domains;
    }
    if (Object.keys(csp).length > 0) {
      uiObj.csp = csp;
    }
  }

  if (Object.keys(uiObj).length > 0) {
    result.ui = uiObj;
  }

  return result;
}

/**
 * Convert raw metadata to OpenAI format
 */
function toOpenaiFormat(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!meta) return {};

  // If already has OpenAI keys, return them
  const openaiKeys = Object.keys(meta).filter((k) => k.startsWith("openai/"));
  if (openaiKeys.length > 0) {
    const result: Record<string, unknown> = {};
    for (const key of openaiKeys) {
      result[key] = meta[key];
    }
    return result;
  }

  // Convert from MCP format
  const result: Record<string, unknown> = {};
  const uiMeta = meta.ui as Record<string, unknown> | undefined;

  if (uiMeta) {
    if (typeof uiMeta.prefersBorder === "boolean") {
      result["openai/widgetPrefersBorder"] = uiMeta.prefersBorder;
    }
    if (typeof uiMeta.domain === "string") {
      result["openai/widgetDomain"] = uiMeta.domain;
    }
    if (typeof uiMeta.widgetDescription === "string") {
      result["openai/widgetDescription"] = uiMeta.widgetDescription;
    }

    // Convert MCP CSP to OpenAI format (camelCase to snake_case)
    const mcpCSP = uiMeta.csp as Record<string, unknown> | undefined;
    if (mcpCSP) {
      const csp: Record<string, unknown> = {};
      if (Array.isArray(mcpCSP.connectDomains)) {
        csp.connect_domains = mcpCSP.connectDomains;
      }
      if (Array.isArray(mcpCSP.resourceDomains)) {
        csp.resource_domains = mcpCSP.resourceDomains;
      }
      if (Array.isArray(mcpCSP.redirectDomains)) {
        csp.redirect_domains = mcpCSP.redirectDomains;
      }
      if (Array.isArray(mcpCSP.frameDomains)) {
        csp.frame_domains = mcpCSP.frameDomains;
      }
      if (Object.keys(csp).length > 0) {
        result["openai/widgetCSP"] = csp;
      }
    }
  }

  return result;
}

export const getUIMetadataInputSchema = z.object({
  uri: z.string().describe("URI of the UI widget to get metadata for"),
});

export const getUIMetadataOutputSchema = z.object({
  uri: z.string(),
  mimeType: z.string(),
  detectedProtocol: z.enum(["mcp-app", "openai", "unknown"]),
  mcpFormat: z.record(z.string(), z.unknown()),
  openaiFormat: z.record(z.string(), z.unknown()),
  raw: z.record(z.string(), z.unknown()),
});

export function createGetUIMetadataTool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Get parsed metadata for a UI widget in both MCP Apps and OpenAI formats. Useful for debugging CSP configurations and understanding protocol-specific metadata.",
    input: getUIMetadataInputSchema,
    output: getUIMetadataOutputSchema,
    handler: async (input): Promise<GetUIMetadataOutput> => {
      // Validate connection before accessing client
      const state = connectionManager.getState();
      if (!state.connected) {
        throw new Error("No active connection. Call connect_to_server first.");
      }

      const client = connectionManager.getClient();
      const rawClient = client.raw;

      // Validate URI format
      try {
        new URL(input.uri);
      } catch {
        throw new Error(`Invalid URI format: '${input.uri}'`);
      }

      // List resources to find metadata for this URI
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

      const meta = resourceInfo._meta as Record<string, unknown> | undefined;
      const raw: Record<string, unknown> = meta ? { _meta: meta } : {};

      return {
        uri: input.uri,
        mimeType: resourceInfo.mimeType ?? "unknown",
        detectedProtocol: detectProtocol(resourceInfo.mimeType),
        mcpFormat: toMcpFormat(meta),
        openaiFormat: toOpenaiFormat(meta),
        raw,
      };
    },
  });
}
