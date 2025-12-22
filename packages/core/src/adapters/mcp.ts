/**
 * MCP Protocol Adapter
 *
 * Handles metadata generation for MCP Apps protocol (Claude Desktop, etc.).
 * Uses camelCase naming and _meta.ui.* namespace.
 */

import type { ToolDef, ToolAnnotations } from "../types/tools";
import type { UIDef } from "../types/ui";
import type { ProtocolAdapter, ToolMetaResult, UIResourceMetaResult } from "./types";
import { mapVisibilityToMcp } from "../utils/metadata";
import { generateMcpCSPMetadata } from "../utils/csp";

// =============================================================================
// MCP ADAPTER
// =============================================================================

/**
 * MCP protocol adapter implementation
 *
 * Generates metadata in MCP Apps format:
 * - Visibility as array: ["model"], ["app"], or ["model", "app"]
 * - Metadata under _meta.ui.* namespace
 * - MIME type: text/html;profile=mcp-app
 * - CSP with camelCase keys (connectDomains, resourceDomains)
 */
export class McpAdapter implements ProtocolAdapter {
  /**
   * Build tool metadata for MCP protocol
   */
  buildToolMeta(toolDef: ToolDef, _serverName: string, uiUri?: string): ToolMetaResult {
    const uiMeta: Record<string, unknown> = {};

    // Add visibility as array: ["model"], ["app"], or ["model", "app"]
    uiMeta.visibility = mapVisibilityToMcp(toolDef.visibility);

    // Add UI resource link if specified (use pre-computed URI with cache-busting hash)
    if (uiUri) {
      uiMeta.resourceUri = uiUri;
    }

    // Build annotations if specified
    const annotations = this.buildAnnotations(toolDef.annotations);

    return {
      annotations,
      _meta: { ui: uiMeta },
    };
  }

  /**
   * Build MCP annotations from tool annotations
   */
  private buildAnnotations(annotations?: ToolAnnotations): Record<string, unknown> | undefined {
    if (!annotations) {
      return undefined;
    }

    const result: Record<string, unknown> = {};

    if (annotations.readOnlyHint !== undefined) {
      result.readOnlyHint = annotations.readOnlyHint;
    }
    if (annotations.destructiveHint !== undefined) {
      result.destructiveHint = annotations.destructiveHint;
    }
    if (annotations.openWorldHint !== undefined) {
      result.openWorldHint = annotations.openWorldHint;
    }
    if (annotations.idempotentHint !== undefined) {
      result.idempotentHint = annotations.idempotentHint;
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * Build UI resource metadata for MCP protocol
   */
  buildUIResourceMeta(uiDef: UIDef): UIResourceMetaResult {
    const uiMeta: Record<string, unknown> = {};

    // Add CSP metadata if specified
    if (uiDef.csp) {
      const cspMetadata = generateMcpCSPMetadata(uiDef.csp);
      if (Object.keys(cspMetadata).length > 0) {
        uiMeta.csp = cspMetadata;
      }
    }

    // Add prefersBorder if specified
    if (uiDef.prefersBorder !== undefined) {
      uiMeta.prefersBorder = uiDef.prefersBorder;
    }

    // Add domain if specified
    if (uiDef.domain) {
      uiMeta.domain = uiDef.domain;
    }

    const result: UIResourceMetaResult = {
      mimeType: "text/html;profile=mcp-app",
    };

    if (Object.keys(uiMeta).length > 0) {
      result._meta = { ui: uiMeta };
    }

    return result;
  }
}
