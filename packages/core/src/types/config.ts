/**
 * Configuration type definitions for @mcp-apps-kit/core
 */

import type { ToolDefs } from "./tools";
import type { Plugin } from "../plugins/types";
import type { OAuthConfig } from "../server/oauth/types.js";
import type { UIDefs } from "./ui";

// =============================================================================
// ICON CONFIGURATION
// =============================================================================

/**
 * Icon theme for light/dark mode support
 */
export type IconTheme = "light" | "dark";

/**
 * Icon definition following the MCP specification.
 *
 * Supports both URL references and inline base64 data URIs.
 *
 * @see https://modelcontextprotocol.io/specification/2025-11-25/schema#implementation
 *
 * @example URL reference
 * ```typescript
 * { src: "https://example.com/icon.png", mimeType: "image/png", sizes: ["48x48"] }
 * ```
 *
 * @example Base64 data URI
 * ```typescript
 * { src: "data:image/svg+xml;base64,PHN2Zy...", mimeType: "image/svg+xml", sizes: ["any"] }
 * ```
 *
 * @example Theme-specific icon
 * ```typescript
 * { src: "https://example.com/icon-dark.png", theme: "dark" }
 * ```
 */
export interface Icon {
  /**
   * Icon source URI.
   *
   * Can be:
   * - HTTP/HTTPS URL (e.g., "https://example.com/icon.png")
   * - Data URI with base64 encoding (e.g., "data:image/png;base64,...")
   */
  src: string;

  /**
   * MIME type of the icon.
   *
   * Required MIME types that clients must support:
   * - `"image/png"`
   * - `"image/jpeg"`
   *
   * Optional MIME types:
   * - `"image/svg+xml"`
   * - `"image/webp"`
   *
   * @example "image/png"
   */
  mimeType?: string;

  /**
   * Icon sizes in "WxH" format.
   *
   * Use `["any"]` for scalable formats like SVG.
   *
   * @example ["48x48", "96x96"]
   * @example ["any"]
   */
  sizes?: string[];

  /**
   * Theme this icon is designed for.
   *
   * When specified, clients can select the appropriate icon
   * based on their current light/dark mode setting.
   */
  theme?: IconTheme;
}

// =============================================================================
// PROTOCOL CONFIGURATION
// =============================================================================

/**
 * Target protocol for metadata generation
 *
 * - `"mcp"`: MCP Apps protocol - uses camelCase metadata
 * - `"openai"`: OpenAI/ChatGPT Apps protocol - uses snake_case metadata with openai/ prefixes
 *
 * @internal
 */
export type Protocol = "mcp" | "openai";

// =============================================================================
// AUTHENTICATION
// =============================================================================
// OAuth 2.1 configuration is imported from server/oauth/types.ts
// and used in GlobalConfig below

// =============================================================================
// CORS
// =============================================================================

/**
 * CORS configuration for the HTTP server
 *
 * @internal
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
// DEBUG LOGGING
// =============================================================================

/**
 * Log level for debug logging
 *
 * - `"debug"`: All logs including debug messages
 * - `"info"`: Info, warning, and error logs (default)
 * - `"warn"`: Warning and error logs only
 * - `"error"`: Error logs only
 *
 * @internal
 */
export type DebugLogLevel = "debug" | "info" | "warn" | "error";

/**
 * Debug log transport mechanism
 *
 * - `"builtin"`: Use MCP protocol-level logging (default for MCP adapter)
 * - `"tool"`: Use the log_debug MCP tool
 * - `"api"`: Use self-hosted HTTP endpoint (default for OpenAI adapter)
 *
 * @internal
 */
export type DebugTransport = "builtin" | "tool" | "api";

// =============================================================================
// AUTO INSPECTOR CONFIGURATION
// =============================================================================

/**
 * Configuration for auto-inspector feature
 *
 * When enabled, automatically spawns the MCP Inspector and connects it
 * to this server on startup.
 *
 * @example
 * ```typescript
 * // Simple boolean - uses defaults
 * autoInspector: true
 * ```
 *
 * @example
 * ```typescript
 * // With options
 * autoInspector: {
 *   port: 8080,
 *   debug: true,
 * }
 * ```
 */
export interface AutoInspectorConfig {
  /** Inspector server port. Default: 6274 */
  port?: number;
  /** Enable inspector debug logging. Default: false */
  debug?: boolean;
  /** Only enable in development (NODE_ENV !== 'production'). Default: true */
  devOnly?: boolean;
}

/**
 * Debug logging configuration
 *
 * Enables debug logging that transports logs through the MCP protocol,
 * bypassing sandbox restrictions in iframe environments where console
 * access is unavailable (e.g., mobile ChatGPT).
 *
 * @example
 * ```typescript
 * const app = createApp({
 *   name: "my-app",
 *   version: "1.0.0",
 *   tools: { ... },
 *   config: {
 *     debug: {
 *       enabled: true,
 *       level: "debug",
 *       batchSize: 10,
 *       flushIntervalMs: 5000,
 *     },
 *   },
 * });
 * ```
 *
 * @internal
 */
export interface DebugConfig {
  /**
   * Enable the log_debug tool for client-to-server log transport.
   *
   * When true, registers the `log_debug` MCP tool so client UIs
   * can send debug logs to the server via the MCP protocol.
   *
   * Note: Server-side logging is enabled whenever a debug config
   * is provided, regardless of this setting.
   *
   * @default false
   */
  logTool?: boolean;

  /**
   * Minimum log level to output.
   *
   * Logs below this level will be filtered out.
   *
   * @default "info"
   */
  level?: DebugLogLevel;

  /**
   * Number of logs to batch before flushing.
   *
   * Batching reduces the number of MCP tool calls.
   * Set to 1 for immediate flushing of each log.
   *
   * @default 10
   */
  batchSize?: number;

  /**
   * Maximum time in milliseconds between flushes.
   *
   * Logs will be flushed after this interval even if
   * the batch size has not been reached.
   *
   * @default 5000
   */
  flushIntervalMs?: number;

  /**
   * Log transport mechanism.
   *
   * - `"builtin"`: Use MCP protocol-level logging (default for MCP adapter)
   * - `"tool"`: Use the log_debug MCP tool
   * - `"api"`: Use self-hosted HTTP endpoint (default for OpenAI adapter)
   *
   * When set to `"api"`, the server exposes a POST endpoint at the path
   * specified by `apiEndpoint` that accepts batched log entries.
   *
   * @default "builtin" for MCP, "api" for OpenAI
   */
  transport?: DebugTransport;

  /**
   * API endpoint path for 'api' transport.
   *
   * This is the path where the logging API will listen for POST requests.
   * The endpoint accepts JSON body with `{ entries: LogEntry[] }` and
   * returns `{ processed: number }`.
   *
   * Only used when `transport` is set to `"api"`.
   *
   * @default "/api/logs"
   *
   * @example
   * ```typescript
   * config: {
   *   debug: {
   *     transport: "api",
   *     apiEndpoint: "/debug/logs"
   *   }
   * }
   * ```
   */
  apiEndpoint?: string;
}

// =============================================================================
// OPENAI CONFIGURATION
// =============================================================================

/**
 * OpenAI Apps SDK specific configuration
 *
 * @internal
 */
export interface OpenAIConfig {
  /**
   * Domain verification challenge token for OpenAI Apps SDK.
   *
   * When provided, exposes a route at `/.well-known/openai-apps-challenge`
   * that returns this token as plain text. This is used by OpenAI to verify
   * domain ownership when registering your app.
   *
   * @example
   * ```typescript
   * config: {
   *   openai: {
   *     domain_challenge: "your-verification-token"
   *   }
   * }
   * ```
   */
  domain_challenge?: string;
}

// =============================================================================
// APP CONFIGURATION
// =============================================================================

/**
 * Global configuration options for the app
 *
 * @internal
 */
export interface GlobalConfig {
  /** OAuth 2.1 authentication configuration */
  oauth?: OAuthConfig;

  /** CORS configuration for HTTP server */
  cors?: CORSConfig;

  /** OpenAI Apps SDK specific configuration */
  openai?: OpenAIConfig;

  /**
   * Automatically spawn the MCP Inspector and connect it to this server.
   * Only works with HTTP transport. Disabled in production by default.
   *
   * @example
   * ```typescript
   * // Simple boolean - uses defaults
   * autoInspector: true
   * ```
   *
   * @example
   * ```typescript
   * // With options
   * autoInspector: {
   *   port: 8080,
   *   debug: true,
   * }
   * ```
   */
  autoInspector?: boolean | AutoInspectorConfig;

  /**
   * Target protocol for metadata generation.
   *
   * - `"mcp"` (default): MCP Apps protocol.
   *   Uses camelCase metadata format (e.g., `_meta.ui.csp.connectDomains`)
   *
   * - `"openai"`: OpenAI/ChatGPT Apps protocol.
   *   Uses snake_case metadata with openai/ prefixes (e.g., `_meta["openai/widgetCSP"].connect_domains`)
   *
   * @default "mcp"
   */
  protocol?: Protocol;

  /**
   * The route path for the MCP server endpoint.
   *
   * This is the path where the MCP server will listen for requests.
   * Must start with a forward slash.
   *
   * @default "/mcp"
   *
   * @example
   * ```typescript
   * config: {
   *   serverRoute: "/api/mcp"
   * }
   * ```
   */
  serverRoute?: string;

  /**
   * Debug logging configuration.
   *
   * Enables debug logging that transports logs through the MCP protocol,
   * bypassing sandbox restrictions in iframe environments.
   *
   * @example
   * ```typescript
   * config: {
   *   debug: {
   *     enabled: true,
   *     level: "debug",
   *   }
   * }
   * ```
   */
  debug?: DebugConfig;

  /**
   * Server configuration to inject into all UI resources at runtime.
   *
   * This config is injected as `window.__MCP_SERVER_CONFIG__` into all HTML UIs
   * when they are served. UIs can access it via `getMcpServerConfig()` or
   * `getMcpServerBaseUrl()` from `@mcp-apps-kit/ui`.
   *
   * Works for both vanilla HTML (`defineUI()`) and React UIs (`defineReactUI()`).
   *
   * @example
   * ```typescript
   * config: {
   *   serverConfig: {
   *     baseUrl: "http://localhost:3000",
   *     customSetting: "value",
   *   }
   * }
   * ```
   */
  serverConfig?: ServerConfig;
}

/**
 * Server configuration that can be injected into UI resources.
 *
 * These values become available in UIs via `getMcpServerConfig()` from `@mcp-apps-kit/ui`.
 */
export interface ServerConfig {
  /**
   * Base URL of the MCP server.
   *
   * Used by UIs to make API calls (e.g., debug logging via HTTP).
   * Should include protocol and port (e.g., "http://localhost:3000").
   *
   * @example "http://localhost:3000"
   * @example "https://api.myapp.com"
   */
  baseUrl?: string;

  /**
   * Additional custom configuration.
   *
   * Any extra values your UI needs at runtime.
   */
  [key: string]: unknown;
}

/**
 * Version-specific configuration for multi-version apps
 *
 * Each version has its own tools, UI, and optional config overrides.
 * Global config from VersionsConfig is merged with version-specific config.
 *
 * @typeParam T - The tool definitions type for type inference
 */
/**
 * Deep partial type that allows null at any level to remove/disable properties.
 *
 * - undefined: inherit from global config
 * - null: explicitly disable/remove the property
 * - value: override the property
 */
export type DeepPartialWithNull<T> = T extends object
  ? { [P in keyof T]?: DeepPartialWithNull<T[P]> | null }
  : T;

/**
 * Version-specific config type that allows null to disable inherited configs.
 *
 * - undefined: inherit from global config
 * - null: explicitly disable/remove the config (at any nesting level)
 * - object: deep-merge with global config
 */
export type VersionSpecificConfig = DeepPartialWithNull<GlobalConfig>;

export interface VersionConfig<T extends ToolDefs = ToolDefs> {
  /**
   * Semantic version for this API version.
   *
   * @example "1.0.0"
   */
  version: string;

  /**
   * Tool definitions for this version.
   * Each key is the tool name, value is the tool definition.
   */
  tools: T;

  /**
   * UI resource definitions for this version.
   */
  ui?: UIDefs;

  /**
   * Optional configuration overrides for this version.
   * Deep-merged with global config from VersionsConfig.
   *
   * - Properties set to undefined: inherit from global
   * - Properties set to null: explicitly disable/remove
   * - Properties set to objects: deep-merge with global
   *
   * @example
   * ```typescript
   * config: {
   *   debug: { level: "warn" }, // Override level, inherit other debug props
   *   oauth: null,              // Disable OAuth for this version
   * }
   * ```
   */
  config?: VersionSpecificConfig;

  /**
   * Optional version-specific plugins.
   * Merged with global plugins from VersionsConfig.
   */
  plugins?: Plugin[];
}

/**
 * Multi-version application configuration
 *
 * Allows exposing multiple MCP server versions under dedicated routes (e.g., /v1/mcp, /v2/mcp).
 * Each version has version-specific tools and UI, while optionally sharing global configuration.
 *
 * @example
 * ```typescript
 * const config: VersionsConfig = {
 *   name: "my-app",
 *   config: {
 *     oauth: { authorizationServer: "https://auth.example.com" },
 *     cors: { origin: true }
 *   },
 *   plugins: [sharedPlugin],
 *   versions: {
 *     v1: {
 *       version: "1.0.0",
 *       tools: { greet: {...} }
 *     },
 *     v2: {
 *       version: "2.0.0",
 *       tools: { greet: {...}, search: {...} },
 *       config: {
 *         oauth: { authorizationServer: "https://auth-v2.example.com" }
 *       }
 *     }
 *   }
 * };
 * ```
 *
 * @typeParam T - The tool definitions type for type inference (union of all version tool types)
 */
export interface VersionsConfig<T extends ToolDefs = ToolDefs> {
  /**
   * App name.
   * Used in MCP server registration and protocol metadata.
   *
   * Should be a valid npm package name format (lowercase, no spaces).
   */
  name: string;

  /**
   * Version definitions.
   * Keys must match pattern `/^v\d+$/` (e.g., "v1", "v2").
   * Each version will be exposed at `/{versionKey}/mcp`.
   */
  versions: Record<string, VersionConfig<T>>;

  /**
   * Shared global configuration options.
   * Merged with each version's config, with version-specific taking precedence.
   */
  config?: GlobalConfig;

  /**
   * Shared plugins.
   * Merged with each version's plugins.
   */
  plugins?: Plugin[];

  /**
   * Server icon URL or data URI (shorthand for single icon).
   *
   * Applied to all versions. For multiple icons or advanced configuration, use `icons` instead.
   *
   * @example
   * ```typescript
   * icon: "https://example.com/icon.png"
   * ```
   */
  icon?: string;

  /**
   * Server icons for MCP client display.
   *
   * Applied to all versions. Follows the MCP specification for Implementation icons.
   *
   * @see https://modelcontextprotocol.io/specification/2025-11-25/schema#implementation
   */
  icons?: Icon[];
}

/**
 * Main application configuration
 *
 * This is the input to `createApp()`. Supports both single-version and multi-version formats.
 *
 * @example Single-version (backward compatible)
 * ```typescript
 * const config: AppConfig = {
 *   name: "my-app",
 *   version: "1.0.0",
 *   tools: {
 *     greet: defineTool({
 *       description: "Greet a user",
 *       input: z.object({ name: z.string() }),
 *       output: z.object({ message: z.string() }),
 *       handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
 *       ui: defineUI({ html: "./widget.html" }),
 *     }),
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

  /**
   * Server icon URL or data URI (shorthand for single icon).
   *
   * For multiple icons or advanced configuration, use `icons` instead.
   *
   * @example URL
   * ```typescript
   * icon: "https://example.com/icon.png"
   * ```
   *
   * @example Data URI
   * ```typescript
   * icon: "data:image/svg+xml;base64,PHN2Zy..."
   * ```
   */
  icon?: string;

  /**
   * Server icons for MCP client display.
   *
   * Allows specifying multiple icons with different sizes, formats, and themes.
   * Follows the MCP specification for Implementation icons.
   *
   * @see https://modelcontextprotocol.io/specification/2025-11-25/schema#implementation
   *
   * @example
   * ```typescript
   * icons: [
   *   { src: "https://example.com/icon-48.png", mimeType: "image/png", sizes: ["48x48"] },
   *   { src: "https://example.com/icon-96.png", mimeType: "image/png", sizes: ["96x96"] },
   *   { src: "https://example.com/icon-dark.png", theme: "dark" }
   * ]
   * ```
   */
  icons?: Icon[];
}

/**
 * Union type for createApp input - supports both single and multi-version configs
 *
 * @typeParam T - The tool definitions type for type inference
 */
export type AppConfigInput<T extends ToolDefs = ToolDefs> = AppConfig<T> | VersionsConfig<T>;
