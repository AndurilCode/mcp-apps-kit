/**
 * Structured logger with level gating, timestamps, and source prefixes.
 *
 * Log level is controlled via the `MCP_APPS_LOG_LEVEL` environment variable.
 * Valid values: "debug" | "info" | "warn" | "error" | "silent" (default: "info").
 */

// =============================================================================
// Types
// =============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

// =============================================================================
// Level ordering
// =============================================================================

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

// =============================================================================
// Helpers
// =============================================================================

function resolveLevel(): LogLevel {
  const env =
    typeof process !== "undefined" ? (process.env.MCP_APPS_LOG_LEVEL ?? "").toLowerCase() : "";
  if (env in LEVEL_ORDER) return env as LogLevel;
  return "info";
}

function timestamp(): string {
  return new Date().toISOString();
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a scoped logger.
 *
 * @param source - Descriptive name included in every log line (e.g. "connection", "proxy-tools").
 */
export function createLogger(source: string): Logger {
  const level = resolveLevel();

  function shouldLog(msgLevel: LogLevel): boolean {
    return LEVEL_ORDER[msgLevel] >= LEVEL_ORDER[level];
  }

  function formatPrefix(msgLevel: string): string {
    return `${timestamp()} [${msgLevel.toUpperCase()}] [${source}]`;
  }

  /* eslint-disable no-console */
  return {
    debug(...args: unknown[]) {
      if (shouldLog("debug")) {
        console.debug(formatPrefix("debug"), ...args);
      }
    },
    info(...args: unknown[]) {
      if (shouldLog("info")) {
        console.info(formatPrefix("info"), ...args);
      }
    },
    warn(...args: unknown[]) {
      if (shouldLog("warn")) {
        console.warn(formatPrefix("warn"), ...args);
      }
    },
    error(...args: unknown[]) {
      if (shouldLog("error")) {
        console.error(formatPrefix("error"), ...args);
      }
    },
  };
  /* eslint-enable no-console */
}

// =============================================================================
// Default instance
// =============================================================================

export const defaultLogger: Logger = createLogger("inspector");
