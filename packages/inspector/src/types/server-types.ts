/**
 * Server Types
 *
 * MCP server interface for direct registration, target server schema types,
 * and inspector server options.
 */

import type { z } from "zod";

// =============================================================================
// MCP SERVER INTERFACE (for direct registration)
// =============================================================================

/**
 * Resource metadata for registration
 */
export interface ResourceMetadata {
  description?: string;
  mimeType?: string;
  _meta?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

/**
 * Resource read result
 */
export interface ResourceContents {
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
    _meta?: Record<string, unknown>;
  }>;
}

/**
 * Tool call result
 */
export interface ToolCallResult {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  structuredContent?: unknown;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

/**
 * MCP Server interface for direct tool and resource registration
 * Uses the same API as @modelcontextprotocol/sdk McpServer
 */
export interface McpServerLike {
  registerTool(
    name: string,
    metadata: {
      title?: string;
      description?: string;
      inputSchema?: Record<string, z.ZodType> | Record<string, unknown>;
      outputSchema?: Record<string, z.ZodType> | Record<string, unknown>;
      _meta?: Record<string, unknown>;
      annotations?: Record<string, unknown>;
    },
    handler: (args: Record<string, unknown>) => ToolCallResult | Promise<ToolCallResult>
  ): void;

  registerResource(
    name: string,
    uri: string,
    metadata: ResourceMetadata,
    handler: () => ResourceContents | Promise<ResourceContents>
  ): void;
}

// =============================================================================
// TARGET SERVER SCHEMA TYPES (for dual-mode proxy)
// =============================================================================

/**
 * Full metadata for a target server tool (preserves all MCP metadata for proxying)
 */
export interface TargetToolInfo {
  /** Tool name */
  name: string;
  /** Tool title (display name) */
  title?: string;
  /** Tool description */
  description?: string;
  /** JSON Schema for tool input */
  inputSchema?: Record<string, unknown>;
  /** JSON Schema for tool output */
  outputSchema?: Record<string, unknown>;
  /** MCP metadata (ui binding, etc.) */
  _meta?: Record<string, unknown>;
  /** Tool annotations */
  annotations?: Record<string, unknown>;
}

/**
 * Full metadata for a target server resource (preserves all MCP metadata for proxying)
 */
export interface TargetResourceInfo {
  /** Resource URI */
  uri: string;
  /** Resource name */
  name?: string;
  /** Resource description */
  description?: string;
  /** Resource MIME type */
  mimeType?: string;
  /** MCP metadata (UI bindings, etc.) */
  _meta?: Record<string, unknown>;
  /** Resource annotations */
  annotations?: Record<string, unknown>;
}

/**
 * Full metadata for a target server prompt
 */
export interface TargetPromptInfo {
  /** Prompt name */
  name: string;
  /** Prompt description */
  description?: string;
  /** Prompt arguments */
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
  /** MCP metadata */
  _meta?: Record<string, unknown>;
}

/**
 * Cached schema from a connected target server
 *
 * Used for:
 * - Generating proxy tools on /apps/mcp endpoint
 * - Full metadata preservation for transparent proxying
 */
export interface TargetServerSchema {
  /** Target server tools with full metadata */
  tools: TargetToolInfo[];
  /** Target server resources with full metadata */
  resources: TargetResourceInfo[];
  /** Target server prompts with full metadata */
  prompts: TargetPromptInfo[];
  /** Server info (name, version) */
  serverInfo: ServerInfo | null;
  /** When the schema was captured */
  capturedAt: number;
}

/**
 * Server info returned after connection
 */
export interface ServerInfo {
  name: string;
  version: string;
}

// =============================================================================
// SERVER OPTIONS
// =============================================================================

/**
 * Options for creating the inspector server
 */
export interface InspectorServerOptions {
  /** Maximum call history entries. Default: 1000 */
  maxHistorySize?: number;

  /** Default timeout for tool calls in ms. Default: 30000 */
  defaultTimeout?: number;

  /** Enable debug logging. Default: false */
  debug?: boolean;

  /** Session TTL in milliseconds. Default: 1800000 (30 minutes) */
  sessionTtl?: number;

  /**
   * Target MCP server URL for auto-connect mode.
   * When provided, the inspector auto-connects to this server on startup
   * and disables the connect_to_server/disconnect tools.
   */
  targetUrl?: string;
}
