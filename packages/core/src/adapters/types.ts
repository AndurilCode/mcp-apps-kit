/**
 * Protocol adapter type definitions
 *
 * Defines the interface for protocol-specific adapters that handle
 * metadata generation for MCP and OpenAI protocols.
 */

import type { ToolDef } from "../types/tools";
import type { UIDef } from "../types/ui";

// =============================================================================
// RESULT TYPES
// =============================================================================

/**
 * Result of building tool metadata
 */
export interface ToolMetaResult {
  /** MCP annotations (optional) */
  annotations?: Record<string, unknown>;
  /** Protocol-specific metadata under _meta */
  _meta?: Record<string, unknown>;
}

/**
 * Result of building UI resource metadata
 */
export interface UIResourceMetaResult {
  /** MIME type for the resource */
  mimeType: string;
  /** Protocol-specific metadata under _meta */
  _meta?: Record<string, unknown>;
}

// =============================================================================
// PROTOCOL ADAPTER INTERFACE
// =============================================================================

/**
 * Protocol adapter interface
 *
 * Implementations handle protocol-specific metadata generation for:
 * - MCP Apps (Claude Desktop, etc.)
 * - OpenAI/ChatGPT Apps
 *
 * This allows server/index.ts to remain protocol-agnostic.
 */
export interface ProtocolAdapter {
  /**
   * Build tool metadata (annotations and _meta)
   *
   * @param toolDef - The tool definition
   * @param serverName - The server/app name for resource URI generation
   * @param uiUri - Optional pre-computed UI resource URI with cache-busting hash
   * @returns Protocol-specific annotations and _meta
   */
  buildToolMeta(toolDef: ToolDef, serverName: string, uiUri?: string): ToolMetaResult;

  /**
   * Build UI resource metadata
   *
   * @param uiDef - The UI resource definition
   * @returns Protocol-specific MIME type and _meta
   */
  buildUIResourceMeta(uiDef: UIDef): UIResourceMetaResult;
}
