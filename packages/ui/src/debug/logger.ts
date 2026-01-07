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
 *
 * @internal
 */
export type DebugLogLevel = "debug" | "info" | "warn" | "error";

/**
 * Debug log transport mechanism
 *
 * - `"builtin"`: Use MCP protocol-level logging (default for MCP adapter)
 * - `"tool"`: Use the log_debug MCP tool
 * - `"api"`: Use HTTP endpoint (default for OpenAI adapter)
 *
 * @internal
 */
export type DebugTransport = "builtin" | "tool" | "api";

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
 * Debug configuration for the client logger
 *
 * @internal
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

  /**
   * Log transport mechanism.
   *
   * - `"builtin"`: Use MCP protocol-level logging (default for MCP adapter)
   * - `"tool"`: Use the log_debug MCP tool
   * - `"api"`: Use HTTP endpoint (default for OpenAI adapter)
   *
   * @default "tool"
   */
  transport?: DebugTransport;

  /**
   * API endpoint URL for 'api' transport.
   *
   * This is the full URL where logs will be sent via HTTP POST.
   * Only used when `transport` is set to `"api"`.
   *
   * @example "https://myapp.example.com/api/logs"
   */
  apiEndpoint?: string;
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

/**
 * Safely stringify data for console output
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
    return `${data.name}: ${data.message}`;
  }
  try {
    // Always use circular replacer to avoid double-stringify on circular refs
    return JSON.stringify(data, getCircularReplacer());
  } catch {
    return "[Unstringifiable]";
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
 *
 * @internal
 */
/**
 * Required config type with transport and apiEndpoint as optional
 * since they have different defaults based on adapter type
 */
type RequiredClientDebugConfig = Required<Omit<ClientDebugConfig, "transport" | "apiEndpoint">> & {
  transport: DebugTransport;
  apiEndpoint: string | undefined;
};

export class ClientDebugLogger {
  private adapter: ProtocolAdapter | null = null;
  private config: RequiredClientDebugConfig;
  private buffer: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private isFlushing = false;
  private mcpTransportFailed = false;
  private apiTransportFailed = false;

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
      transport: config.transport ?? "tool",
      apiEndpoint: config.apiEndpoint,
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
    this.apiTransportFailed = false;
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
    if (config.transport !== undefined) {
      this.config.transport = config.transport;
      // Reset failure states when transport changes
      this.mcpTransportFailed = false;
      this.apiTransportFailed = false;
    }
    if (config.apiEndpoint !== undefined) {
      this.config.apiEndpoint = config.apiEndpoint;
      // Reset API failure state when endpoint changes
      this.apiTransportFailed = false;
    }
  }

  /**
   * Check if MCP tool transport is enabled and available
   */
  private canUseToolTransport(): boolean {
    return (
      this.config.enabled &&
      this.config.transport === "tool" &&
      !this.mcpTransportFailed &&
      this.adapter?.isConnected() === true
    );
  }

  /**
   * Check if API transport is enabled and available
   */
  private canUseApiTransport(): boolean {
    return (
      this.config.enabled &&
      this.config.transport === "api" &&
      !this.apiTransportFailed &&
      !!this.config.apiEndpoint
    );
  }

  /**
   * Check if any remote transport is available
   */
  private canUseRemoteTransport(): boolean {
    return this.canUseToolTransport() || this.canUseApiTransport();
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
   * Flush logs to the API endpoint
   */
  private async flushToApi(entries: LogEntry[]): Promise<void> {
    if (!this.config.apiEndpoint) {
      throw new Error("API endpoint not configured");
    }

    const response = await fetch(this.config.apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ entries }),
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${String(response.status)}`);
    }
  }

  /**
   * Flush logs to the MCP tool
   */
  private async flushToTool(entries: LogEntry[]): Promise<void> {
    if (!this.adapter) {
      throw new Error("Adapter not connected");
    }
    await this.adapter.callTool("log_debug", { entries });
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

    // Check if we can use any remote transport
    if (!this.canUseRemoteTransport()) {
      // No remote transport - just clear buffer (already output to console in log())
      this.buffer = [];
      return;
    }

    this.isFlushing = true;
    const entriesToFlush = [...this.buffer];

    try {
      if (this.canUseApiTransport()) {
        await this.flushToApi(entriesToFlush);
      } else if (this.canUseToolTransport()) {
        await this.flushToTool(entriesToFlush);
      }
      // Clear buffer only after successful flush
      this.buffer = this.buffer.slice(entriesToFlush.length);
    } catch (error) {
      // If transport fails, disable it (already output to console in log())
      // Don't re-add entries since they were already output to console
      this.buffer = this.buffer.slice(entriesToFlush.length);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (this.config.transport === "api" && !this.apiTransportFailed) {
        this.apiTransportFailed = true;
        // eslint-disable-next-line no-console
        console.warn(
          `[ClientDebugLogger] API log transport failed: ${errorMessage}. Will only use console`
        );
      } else if (this.config.transport === "tool" && !this.mcpTransportFailed) {
        this.mcpTransportFailed = true;
        // eslint-disable-next-line no-console
        console.warn(
          `[ClientDebugLogger] MCP log transport failed: ${errorMessage}. Will only use console`
        );
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
    // (already output to console in log(), so just drop from buffer)
    // Use while loop to handle rapid logging scenarios
    while (this.buffer.length >= this.config.maxBufferSize) {
      this.buffer.shift();
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

    // Always output to console first
    this.outputToConsole(entry);

    // If remote transport is available, also send via API/tool
    if (this.canUseRemoteTransport()) {
      this.addToBuffer(entry);
    }
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
    // Clear buffer (already output to console in log())
    this.buffer = [];

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
 *
 * @internal
 */
export const clientDebugLogger = new ClientDebugLogger();
