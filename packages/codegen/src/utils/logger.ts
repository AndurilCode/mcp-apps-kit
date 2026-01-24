/**
 * Shared logger utility for @mcp-apps-kit/codegen
 *
 * Provides a consistent logging interface across the codegen package.
 */

import type { PluginLogger } from "../types";

/**
 * Default logger that uses console methods with a prefix
 */
export const defaultLogger: PluginLogger = {
  info: (message: string) => {
    console.log(`[mcp-apps-plugin] ${message}`); // eslint-disable-line no-console
  },
  warn: (message: string) => {
    console.warn(`[mcp-apps-plugin] ${message}`); // eslint-disable-line no-console
  },
  error: (message: string) => {
    console.error(`[mcp-apps-plugin] ${message}`); // eslint-disable-line no-console
  },
};
