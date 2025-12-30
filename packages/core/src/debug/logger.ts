/**
 * Server-side Debug Logger
 *
 * Provides structured logging that can be transported through the MCP protocol.
 * Handles log level filtering, batching, and circular reference handling.
 *
 * @module debug/logger
 */

import type { DebugConfig, DebugLogLevel } from "../types/config";

// =============================================================================
// TYPES
// =============================================================================

/**
 * A single log entry
 *
 * @internal
 */
export interface LogEntry {
  /** Log level */
  level: DebugLogLevel;
  /** Log message */
  message: string;
  /** Optional structured data */
  data?: unknown;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Optional source identifier */
  source?: string;
}

/**
 * Input schema for the log_debug tool
 *
 * @internal
 */
export interface LogDebugInput {
  /** Array of log entries to process */
  entries: LogEntry[];
}

/**
 * Output schema for the log_debug tool
 *
 * @internal
 */
export interface LogDebugOutput {
  /** Number of entries processed */
  processed: number;
}

/**
 * Logger output handler function type
 *
 * @internal
 */
export type LogOutputHandler = (entry: LogEntry) => void;

// =============================================================================
// LOG LEVEL UTILITIES
// =============================================================================

/**
 * Numeric values for log levels (lower = more verbose)
 */
const LogLevelValue: Record<DebugLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Check if a log level should be output given the minimum level
 *
 * @internal
 */
export function shouldLog(level: DebugLogLevel, minLevel: DebugLogLevel): boolean {
  return LogLevelValue[level] >= LogLevelValue[minLevel];
}

// =============================================================================
// SERIALIZATION UTILITIES
// =============================================================================

/**
 * JSON replacer function that handles circular references
 */
function getCircularReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet();
  return (_key: string, value: unknown): unknown => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);
    }
    return value;
  };
}

/**
 * Safely stringify data, handling circular references
 *
 * @internal
 */
export function safeStringify(data: unknown): string {
  if (data === undefined) {
    return "undefined";
  }
  if (data === null) {
    return "null";
  }
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof Error) {
    return JSON.stringify(
      {
        name: data.name,
        message: data.message,
        stack: data.stack,
      },
      null,
      2
    );
  }
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    try {
      return JSON.stringify(data, getCircularReplacer(), 2);
    } catch {
      return "[Unstringifiable]";
    }
  }
}

/**
 * Safely serialize data for transport, handling circular references
 *
 * @internal
 */
export function safeSerialize(data: unknown): unknown {
  if (data === undefined || data === null) {
    return data;
  }
  if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") {
    return data;
  }
  if (data instanceof Error) {
    return {
      name: data.name,
      message: data.message,
      stack: data.stack,
    };
  }
  try {
    // Test if it's safely serializable
    JSON.stringify(data);
    return data;
  } catch {
    try {
      // Try with circular reference handling
      const serialized = JSON.stringify(data, getCircularReplacer());
      return JSON.parse(serialized) as unknown;
    } catch {
      return "[Unserializable]";
    }
  }
}

// =============================================================================
// SERVER LOGGER
// =============================================================================

/**
 * Default console output handler for server-side logging
 *
 * @internal
 */
export const consoleOutputHandler: LogOutputHandler = (entry: LogEntry): void => {
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]${entry.source ? ` [${entry.source}]` : ""}`;
  const message =
    entry.data !== undefined ? `${entry.message} ${safeStringify(entry.data)}` : entry.message;
  const formattedMessage = `${prefix} ${message}`;

  /* eslint-disable no-console */
  switch (entry.level) {
    case "debug":
      console.debug(formattedMessage);
      break;
    case "info":
      console.info(formattedMessage);
      break;
    case "warn":
      console.warn(formattedMessage);
      break;
    case "error":
      console.error(formattedMessage);
      break;
  }
  /* eslint-enable no-console */
};

/**
 * Server-side Debug Logger
 *
 * Provides structured logging with configurable output handlers.
 * Use this on the server to output logs received from clients via the log_debug tool.
 *
 * @internal
 */
export class DebugLogger {
  private minLevel: DebugLogLevel;
  private outputHandler: LogOutputHandler;
  private source: string;

  /**
   * Create a debug logger
   *
   * @param config - Debug configuration
   * @param outputHandler - Handler for log output (defaults to console)
   * @param source - Optional source identifier for log entries
   */
  constructor(
    config: Pick<DebugConfig, "level"> = {},
    outputHandler: LogOutputHandler = consoleOutputHandler,
    source?: string
  ) {
    this.minLevel = config.level ?? "info";
    this.outputHandler = outputHandler;
    this.source = source ?? "mcp-apps";
  }

  /**
   * Set the minimum log level
   */
  setLevel(level: DebugLogLevel): void {
    this.minLevel = level;
  }

  /**
   * Set the output handler
   */
  setOutputHandler(handler: LogOutputHandler): void {
    this.outputHandler = handler;
  }

  /**
   * Create a log entry
   */
  private createEntry(level: DebugLogLevel, message: string, data?: unknown): LogEntry {
    return {
      level,
      message,
      data: data !== undefined ? safeSerialize(data) : undefined,
      timestamp: new Date().toISOString(),
      source: this.source,
    };
  }

  /**
   * Log a message if it meets the minimum level
   */
  private log(level: DebugLogLevel, message: string, data?: unknown): void {
    if (!shouldLog(level, this.minLevel)) {
      return;
    }
    const entry = this.createEntry(level, message, data);
    this.outputHandler(entry);
  }

  /**
   * Log a debug message
   */
  debug(message: string, data?: unknown): void {
    this.log("debug", message, data);
  }

  /**
   * Log an info message
   */
  info(message: string, data?: unknown): void {
    this.log("info", message, data);
  }

  /**
   * Log a warning message
   */
  warn(message: string, data?: unknown): void {
    this.log("warn", message, data);
  }

  /**
   * Log an error message
   */
  error(message: string, data?: unknown): void {
    this.log("error", message, data);
  }

  /**
   * Process log entries from the log_debug tool
   *
   * This is called by the server when it receives batched logs from a client.
   */
  processEntries(entries: LogEntry[]): number {
    let processed = 0;
    for (const entry of entries) {
      if (shouldLog(entry.level, this.minLevel)) {
        this.outputHandler({
          ...entry,
          // Preserve original timestamp but add source if missing
          source: entry.source ?? this.source,
        });
        processed++;
      }
    }
    return processed;
  }
}

// =============================================================================
// GLOBAL LOGGER INSTANCE
// =============================================================================

/**
 * Global debug logger instance
 *
 * This is initialized with default settings and can be configured
 * when createApp is called with debug configuration.
 */
export const debugLogger = new DebugLogger({ level: "info" });

/**
 * Configure the global debug logger
 *
 * @internal
 */
export function configureDebugLogger(config: DebugConfig): void {
  debugLogger.setLevel(config.level ?? "info");
}
