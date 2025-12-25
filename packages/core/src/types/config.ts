/**
 * Configuration type definitions for @mcp-apps-kit/core
 */

import type { ToolDefs } from "./tools";
import type { UIDefs } from "./ui";
import type { Plugin } from "../plugins/types";

// =============================================================================
// PROTOCOL CONFIGURATION
// =============================================================================

/**
 * Target protocol for metadata generation
 *
 * - `"mcp"`: MCP Apps protocol (Claude Desktop, etc.) - uses camelCase metadata
 * - `"openai"`: OpenAI/ChatGPT Apps protocol - uses snake_case metadata with openai/ prefixes
 */
export type Protocol = "mcp" | "openai";

// =============================================================================
// AUTHENTICATION
// =============================================================================

/**
 * OAuth 2.1 authentication configuration
 *
 * Used for securing tool access with OAuth-based authentication.
 */
export interface AuthConfig {
  /** Authentication type - currently only OAuth 2.1 is supported */
  type: "oauth2";

  /** OAuth scopes required for access */
  scopes: string[];

  /** Protected resource URL */
  protectedResource: string;

  /** Authorization server URL */
  authorizationServer: string;
}

// =============================================================================
// CORS
// =============================================================================

/**
 * CORS configuration for the HTTP server
 */
export interface CORSConfig {
  /**
   * Allowed origins for CORS requests.
   *
   * - `true`: Allow all origins
   * - `false`: Disable CORS
   * - `string`: Allow a specific origin
   * - `string[]`: Allow multiple specific origins
   */
  origin: string | string[] | boolean;

  /**
   * Whether to include credentials in CORS requests.
   * When true, Access-Control-Allow-Credentials header is set.
   */
  credentials?: boolean;
}

// =============================================================================
// APP CONFIGURATION
// =============================================================================

/**
 * Global configuration options for the app
 */
export interface GlobalConfig {
  /** OAuth authentication configuration */
  auth?: AuthConfig;

  /** CORS configuration for HTTP server */
  cors?: CORSConfig;

  /**
   * Target protocol for metadata generation.
   *
   * - `"mcp"` (default): MCP Apps protocol for Claude Desktop, etc.
   *   Uses camelCase metadata format (e.g., `_meta.ui.csp.connectDomains`)
   *
   * - `"openai"`: OpenAI/ChatGPT Apps protocol.
   *   Uses snake_case metadata with openai/ prefixes (e.g., `_meta["openai/widgetCSP"].connect_domains`)
   *
   * @default "mcp"
   */
  protocol?: Protocol;
}

/**
 * Main application configuration
 *
 * This is the input to `createApp()`.
 *
 * @example
 * ```typescript
 * const config: AppConfig = {
 *   name: "my-app",
 *   version: "1.0.0",
 *   tools: {
 *     greet: {
 *       description: "Greet a user",
 *       input: z.object({ name: z.string() }),
 *       handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
 *     },
 *   },
 *   ui: {
 *     "greeting-widget": {
 *       html: "./widget.html",
 *     },
 *   },
 * };
 * ```
 *
 * @typeParam T - The tool definitions type for type inference
 */
export interface AppConfig<T extends ToolDefs = ToolDefs> {
  /**
   * App name.
   * Used in MCP server registration and protocol metadata.
   *
   * Should be a valid npm package name format (lowercase, no spaces).
   */
  name: string;

  /**
   * Semantic version of the app.
   *
   * @example "1.0.0"
   */
  version: string;

  /**
   * Tool definitions.
   * Each key is the tool name, value is the tool definition.
   */
  tools: T;

  /**
   * UI resource definitions.
   * Keys are referenced from tool definitions via `ui` property.
   */
  ui?: UIDefs;

  /**
   * Global configuration options.
   */
  config?: GlobalConfig;

  /**
   * Plugins to extend app behavior.
   * Plugins provide lifecycle hooks and execution hooks without modifying tool handlers.
   *
   * @example
   * ```typescript
   * import { loggingPlugin } from '@mcp-apps-kit/core';
   *
   * const config = {
   *   // ... other config
   *   plugins: [
   *     loggingPlugin
   *   ]
   * };
   * ```
   */
  plugins?: Plugin[];
}
