/**
 * MCP Protocol Adapter
 *
 * Handles metadata generation for MCP Apps protocol (Claude Desktop, etc.).
 * Uses camelCase naming and _meta.ui.* namespace.
 */

import type { ToolDef } from "../types/tools";
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
  buildToolMeta(toolDef: ToolDef, serverName: string): ToolMetaResult {
    const uiMeta: Record<string, unknown> = {};

    // Add visibility as array: ["model"], ["app"], or ["model", "app"]
    uiMeta.visibility = mapVisibilityToMcp(toolDef.visibility);

    // Add UI resource link if specified
    if (toolDef.ui) {
      uiMeta.resourceUri = `ui://${serverName}/${toolDef.ui}`;
    }

    return {
      _meta: { ui: uiMeta },
    };
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
