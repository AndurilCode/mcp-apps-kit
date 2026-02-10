import { DebugLogger, type DebugLogLevel } from "@mcp-apps-kit/core";

const DEFAULT_LOG_LEVEL: DebugLogLevel = "info";
const DEBUG_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

function isDebugLogLevel(value: string): value is DebugLogLevel {
  return DEBUG_LOG_LEVELS.includes(value as (typeof DEBUG_LOG_LEVELS)[number]);
}

function resolveLogLevel(level?: DebugLogLevel): DebugLogLevel {
  if (level) {
    return level;
  }

  const envLevel = process.env.MCP_APPS_LOG_LEVEL;
  if (envLevel && isDebugLogLevel(envLevel)) {
    return envLevel;
  }

  return DEFAULT_LOG_LEVEL;
}

export function createLogger(source: string, level?: DebugLogLevel): DebugLogger {
  return new DebugLogger({ level: resolveLogLevel(level) }, undefined, source);
}

export const inspectorLogger = createLogger("inspector");
