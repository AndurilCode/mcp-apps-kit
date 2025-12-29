/**
 * MCP Apps Protocol Constants
 *
 * @packageDocumentation
 */

/**
 * The latest MCP Apps protocol version supported by this SDK.
 * Used during client-host handshake to ensure compatibility.
 */
export const LATEST_PROTOCOL_VERSION = "2025-11-05";

/**
 * MIME type for MCP App UI resources.
 * Used when registering UI resources with the MCP server.
 */
export const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

/**
 * Metadata key for UI resource URIs in tool definitions.
 * Used to link tools to their associated UI widgets.
 */
export const RESOURCE_URI_META_KEY = "ui/resourceUri";
