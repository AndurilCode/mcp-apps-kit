/**
 * LogsPanel Component
 *
 * Displays a list of console log entries from widget sessions.
 * Extracted from InspectorDashboard for reuse in split view.
 */

import React, { useEffect, useRef } from "react";
import type { LogEntry } from "../hooks/useLogStream";
import { styles } from "../styles";

export interface LogsPanelProps {
  /** Array of log entries to display */
  logs: LogEntry[];
  /** Callback to clear all logs */
  onClearLogs: () => void;
  /** Whether to show the header (default: true) */
  showHeader?: boolean;
}

/**
 * Format timestamp as HH:MM:SS.mmm
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  const s = date.getSeconds().toString().padStart(2, "0");
  const ms = date.getMilliseconds().toString().padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

function LogEntryRow({ log }: { log: LogEntry }): React.ReactElement {
  const levelStyle =
    log.level === "error"
      ? styles.logLevelError
      : log.level === "warn"
        ? styles.logLevelWarn
        : log.level === "info"
          ? styles.logLevelInfo
          : log.level === "debug"
            ? styles.logLevelDebug
            : styles.logLevelLog;

  const badgeStyle =
    log.source === "host"
      ? styles.logBadgeHost
      : log.source === "widget"
        ? styles.logBadgeWidget
        : styles.logBadgeUnknown;

  return (
    <div style={styles.logEntry}>
      <span style={styles.logTime}>{formatTime(log.timestamp)}</span>
      <span style={{ ...styles.logBadge, ...badgeStyle }}>{log.source}</span>
      <span style={{ ...styles.logLevel, ...levelStyle }}>[{log.level}]</span>
      <span style={{ ...styles.logText, ...levelStyle }}>{log.text}</span>
    </div>
  );
}

export function LogsPanel({
  logs,
  onClearLogs,
  showHeader = true,
}: LogsPanelProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div style={styles.eventsPanel as React.CSSProperties}>
      {showHeader && (
        <div style={styles.eventsPanelHeader as React.CSSProperties}>
          <span style={styles.eventsPanelTitle as React.CSSProperties}>Logs</span>
          <div style={styles.eventsPanelControls as React.CSSProperties}>
            <span style={styles.logCount}>{logs.length} logs</span>
            <button style={styles.clearLogsBtn as React.CSSProperties} onClick={onClearLogs}>
              Clear
            </button>
          </div>
        </div>
      )}
      <div ref={containerRef} style={styles.logsContainer}>
        {logs.length === 0 ? (
          <div style={styles.logsEmpty}>No logs yet</div>
        ) : (
          logs.map((log) => <LogEntryRow key={log.id} log={log} />)
        )}
      </div>
    </div>
  );
}

export default LogsPanel;
