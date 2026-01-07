/**
 * Server configuration access for MCP UIs
 *
 * Provides access to server configuration that was injected at build time
 * by the @mcp-apps-kit/ui-react-builder vite plugin.
 *
 * @example
 * ```typescript
 * import { getMcpServerConfig, getMcpServerBaseUrl } from "@mcp-apps-kit/ui";
 *
 * // Get the full config object
 * const config = getMcpServerConfig();
 * console.log(config.baseUrl);
 *
 * // Or just get the base URL (with fallback)
 * const baseUrl = getMcpServerBaseUrl("http://localhost:3000");
 * ```
 */

/**
 * Server configuration type matching McpServerConfig from the vite plugin.
 */
export interface McpServerConfig {
  /**
   * Base URL of the MCP server.
   * @example "http://localhost:3000"
   */
  baseUrl?: string;

  /**
   * Additional custom configuration values.
   */
  [key: string]: unknown;
}

/**
 * Declare the global variable that can be injected either:
 * - At build time by the vite plugin (esbuild define)
 * - At runtime by the server (window.__MCP_SERVER_CONFIG__)
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const __MCP_SERVER_CONFIG__: McpServerConfig | undefined;

  interface Window {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __MCP_SERVER_CONFIG__?: McpServerConfig;
  }
}

/**
 * Get the server configuration.
 *
 * Checks for configuration in this order:
 * 1. Runtime injection via `window.__MCP_SERVER_CONFIG__` (server-side injection)
 * 2. Build-time injection via global `__MCP_SERVER_CONFIG__` (vite plugin)
 *
 * Returns an empty object if no config was injected.
 *
 * @returns The server configuration object
 *
 * @example
 * ```typescript
 * const config = getMcpServerConfig();
 * if (config.baseUrl) {
 *   fetch(`${config.baseUrl}/api/logs`, { ... });
 * }
 * ```
 */
export function getMcpServerConfig(): McpServerConfig {
  // Check for runtime injection first (server-side)
  if (typeof window !== "undefined" && window.__MCP_SERVER_CONFIG__) {
    return window.__MCP_SERVER_CONFIG__;
  }

  // Check for build-time injection (vite plugin)
  if (typeof __MCP_SERVER_CONFIG__ !== "undefined" && __MCP_SERVER_CONFIG__) {
    return __MCP_SERVER_CONFIG__;
  }

  return {};
}

/**
 * Get the server base URL from injected config.
 *
 * Convenience function that extracts just the base URL from the config.
 * Falls back to `window.location.origin` if available, or the provided default.
 *
 * @param defaultUrl - Fallback URL if not configured and window.location unavailable
 * @returns The server base URL
 *
 * @example
 * ```typescript
 * // Uses injected config, then window.location.origin, then the fallback
 * const baseUrl = getMcpServerBaseUrl("http://localhost:3000");
 *
 * // Configure debug logger with dynamic base URL
 * clientDebugLogger.configure({
 *   transport: "api",
 *   apiEndpoint: `${getMcpServerBaseUrl()}/api/logs`,
 * });
 * ```
 */
export function getMcpServerBaseUrl(defaultUrl = ""): string {
  // First, check if config was injected at build time
  const config = getMcpServerConfig();
  if (config.baseUrl) {
    return config.baseUrl;
  }

  // Fall back to window.location.origin for HTTP/HTTPS pages
  if (
    typeof window !== "undefined" &&
    (window.location.protocol === "http:" || window.location.protocol === "https:")
  ) {
    return window.location.origin;
  }

  // Last resort: use the provided default
  return defaultUrl;
}
