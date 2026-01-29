/**
 * Constants for MCP Apps Kit
 */

/**
 * MIME type for MCP Apps (Claude Desktop) widgets
 *
 * Used to identify UI resources that should be rendered using the
 * MCP Apps protocol (JSON-RPC over postMessage via ext-apps).
 */
export const MCP_WIDGET_MIME_TYPE = "text/html;profile=mcp-app";

/**
 * MIME type for OpenAI Apps (ChatGPT) widgets
 *
 * Used to identify UI resources that should be rendered using the
 * OpenAI Apps SDK protocol (window.openai + DOM events).
 */
export const OPENAI_WIDGET_MIME_TYPE = "text/html+skybridge";
