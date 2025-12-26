/**
 * Debug Logging Module for Client UI
 *
 * Provides debug logging functionality for MCP Apps client UIs.
 *
 * @module debug
 */

export {
  // Types
  type DebugLogLevel,
  type LogEntry,
  type ClientDebugConfig,
  // Utilities
  shouldLog,
  safeSerialize,
  safeStringify,
  // Logger
  ClientDebugLogger,
  // Global instance
  clientDebugLogger,
} from "./logger";
