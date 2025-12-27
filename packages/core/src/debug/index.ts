/**
 * Debug Logging Module
 *
 * Provides debug logging functionality for MCP Apps.
 *
 * @module debug
 */

export {
  // Types
  type LogEntry,
  type LogDebugInput,
  type LogDebugOutput,
  type LogOutputHandler,
  // Utilities
  shouldLog,
  safeStringify,
  safeSerialize,
  // Logger
  DebugLogger,
  consoleOutputHandler,
  // Global instance
  debugLogger,
  configureDebugLogger,
} from "./logger";
