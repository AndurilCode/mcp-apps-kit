/**
 * Client-side Debug Logger
 *
 * Provides debug logging for MCP Apps client UIs that batches logs
 * and transports them through the MCP protocol to bypass sandbox restrictions.
 *
 * @module debug/logger
 */

import type { ProtocolAdapter } from "../adapters/types";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Log level for debug logging
 */
export type DebugLogLevel = "debug" | "info" | "warn" | "error";

/**
 * A single log entry
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
 * Debug configuration for the client logger
 */
export interface ClientDebugConfig {
  /**
   * Enable debug logging via MCP transport
   * @default false
   */
  enabled?: boolean;

  /**
   * Minimum log level to output
   * @default "info"
   */
  level?: DebugLogLevel;

  /**
   * Number of logs to batch before flushing
   * @default 10
   */
  batchSize?: number;

  /**
   * Maximum buffer size to prevent memory overflow.
   * When exceeded, oldest entries are dropped.
   * @default 100
   */
  maxBufferSize?: number;

  /**
   * Maximum time in milliseconds between flushes
   * @default 5000
   */
  flushIntervalMs?: number;

  /**
   * Source identifier for log entries
   * @default "mcp-apps-ui"
   */
  source?: string;
}

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
 * Safely serialize data for transport, handling circular references
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

/**
 * Safely stringify data for console output
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
    return `${data.name}: ${data.message}`;
  }
  try {
    return JSON.stringify(data);
  } catch {
    try {
      return JSON.stringify(data, getCircularReplacer());
    } catch {
      return "[Unstringifiable]";
    }
  }
}

// =============================================================================
// CLIENT DEBUG LOGGER
// =============================================================================

/**
 * Client-side Debug Logger
 *
 * Batches log entries and transports them through the MCP protocol
 * to the server, bypassing sandbox restrictions.
 *
 * Features:
 * - Intelligent batching with configurable batch size and flush interval
 * - Immediate flushing for error-level logs
 * - Circular reference handling
 * - Fallback to console when not connected
 * - Graceful degradation in restricted environments
 */
export class ClientDebugLogger {
  private adapter: ProtocolAdapter | null = null;
  private config: Required<ClientDebugConfig>;
  private buffer: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private isFlushing = false;
  private mcpTransportFailed = false;

  /**
   * Create a client debug logger
   *
   * @param config - Debug configuration
   */
  constructor(config: ClientDebugConfig = {}) {
    this.config = {
      enabled: config.enabled ?? false,
      level: config.level ?? "info",
      batchSize: config.batchSize ?? 10,
      maxBufferSize: config.maxBufferSize ?? 100,
      flushIntervalMs: config.flushIntervalMs ?? 5000,
      source: config.source ?? "mcp-apps-ui",
    };
  }

  /**
   * Set the protocol adapter for MCP transport
   *
   * Must be called after the adapter is connected for
   * logs to be transported through MCP.
   *
   * Note: Setting a new adapter resets the transport failure state,
   * allowing MCP transport to be retried with the new adapter.
   */
  setAdapter(adapter: ProtocolAdapter): void {
    this.adapter = adapter;
    // Reset failure state when adapter changes - new adapter might have log_debug tool
    this.mcpTransportFailed = false;
  }

  /**
   * Configure the logger
   */
  configure(config: Partial<ClientDebugConfig>): void {
    if (config.enabled !== undefined) {
      this.config.enabled = config.enabled;
    }
    if (config.level !== undefined) {
      this.config.level = config.level;
    }
    if (config.batchSize !== undefined) {
      this.config.batchSize = config.batchSize;
    }
    if (config.maxBufferSize !== undefined) {
      this.config.maxBufferSize = config.maxBufferSize;
    }
    if (config.flushIntervalMs !== undefined) {
      this.config.flushIntervalMs = config.flushIntervalMs;
      // Reset flush timer with new interval
      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      }
      this.scheduleFlush();
    }
    if (config.source !== undefined) {
      this.config.source = config.source;
    }
  }

  /**
   * Check if MCP transport is enabled and available
   */
  private canUseMcpTransport(): boolean {
    return this.config.enabled && !this.mcpTransportFailed && this.adapter?.isConnected() === true;
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
      source: this.config.source,
    };
  }

  /**
   * Schedule a flush if not already scheduled
   */
  private scheduleFlush(): void {
    if (this.flushTimer || this.buffer.length === 0) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.config.flushIntervalMs);
  }

  /**
   * Flush all buffered logs to the server
   */
  async flush(): Promise<void> {
    if (this.isFlushing || this.buffer.length === 0) {
      return;
    }

    // Cancel any scheduled flush
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Check if we can use MCP transport
    if (!this.canUseMcpTransport()) {
      // Output to console as fallback
      for (const entry of this.buffer) {
        this.outputToConsole(entry);
      }
      this.buffer = [];
      return;
    }

    this.isFlushing = true;
    const entriesToFlush = [...this.buffer];
    this.buffer = [];

    try {
      if (this.adapter) {
        await this.adapter.callTool("log_debug", { entries: entriesToFlush });
      }
    } catch {
      // If MCP call fails (e.g., log_debug tool not registered),
      // disable MCP transport and fall back to console permanently
      if (!this.mcpTransportFailed) {
        this.mcpTransportFailed = true;
        // Log once that we're falling back to console
        // eslint-disable-next-line no-console
        console.info("[ClientDebugLogger] MCP log transport unavailable, using console fallback");
      }
      // Output failed entries to console
      for (const entry of entriesToFlush) {
        this.outputToConsole(entry);
      }
    } finally {
      this.isFlushing = false;

      // Schedule next flush if there are more entries
      if (this.buffer.length > 0) {
        this.scheduleFlush();
      }
    }
  }

  /**
   * Output a log entry to the console
   */
  private outputToConsole(entry: LogEntry): void {
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
    const message =
      entry.data !== undefined ? `${entry.message} ${safeStringify(entry.data)}` : entry.message;
    const formattedMessage = `${prefix} ${message}`;

    try {
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
    } catch {
      // Ignore console errors in restricted environments
    }
  }

  /**
   * Add a log entry to the buffer
   */
  private addToBuffer(entry: LogEntry): void {
    // Handle buffer overflow - drop oldest entries if we've reached max size
    if (this.buffer.length >= this.config.maxBufferSize) {
      const dropped = this.buffer.shift();
      if (dropped) {
        // Output dropped entry to console as fallback
        this.outputToConsole(dropped);
      }
    }

    this.buffer.push(entry);

    // Immediate flush for error-level logs
    if (entry.level === "error") {
      void this.flush();
      return;
    }

    // Check if we've reached batch size
    if (this.buffer.length >= this.config.batchSize) {
      void this.flush();
      return;
    }

    // Schedule flush if not already scheduled
    this.scheduleFlush();
  }

  /**
   * Log a message
   */
  private log(level: DebugLogLevel, message: string, data?: unknown): void {
    if (!shouldLog(level, this.config.level)) {
      return;
    }

    const entry = this.createEntry(level, message, data);

    // If MCP transport is not available, output directly to console
    if (!this.canUseMcpTransport()) {
      this.outputToConsole(entry);
      return;
    }

    // Add to buffer for batching
    this.addToBuffer(entry);
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
   * Cleanup resources
   *
   * Call this when the client is being destroyed.
   */
  destroy(): void {
    // Flush any remaining logs
    if (this.buffer.length > 0) {
      // Output to console since we're destroying
      for (const entry of this.buffer) {
        this.outputToConsole(entry);
      }
      this.buffer = [];
    }

    // Cancel any pending flush
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    this.adapter = null;
  }
}

// =============================================================================
// GLOBAL CLIENT LOGGER INSTANCE
// =============================================================================

/**
 * Global client debug logger instance
 *
 * Use this for logging in UI components. Configure it after
 * connecting to the MCP server.
 */
export const clientDebugLogger = new ClientDebugLogger();
