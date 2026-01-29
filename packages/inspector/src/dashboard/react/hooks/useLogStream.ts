/**
 * useLogStream Hook
 *
 * Connects to the inspector SSE endpoint for real-time log streaming.
 */

import { useState, useEffect, useRef, useCallback } from "react";

export interface LogEntry {
  /** Stable unique identifier for this log entry */
  id: string;
  level: "log" | "info" | "warn" | "error" | "debug";
  text: string;
  source: "widget" | "host" | "unknown";
  timestamp: number;
  url?: string;
  lineNumber?: number;
}

interface LogsBatchData {
  logs?: LogEntry[];
}

export interface UseLogStreamResult {
  logs: LogEntry[];
  clearLogs: () => void;
}

let logIdCounter = 0;

function generateLogId(): string {
  return `log-${Date.now()}-${++logIdCounter}`;
}

function ensureLogId(log: Omit<LogEntry, "id"> & { id?: string }): LogEntry {
  return {
    ...log,
    id: log.id ?? generateLogId(),
  };
}

export function useLogStream(baseUrl: string, sessionId: string | null): UseLogStreamResult {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  useEffect(() => {
    // Clean up previous connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Clear logs and exit if no session
    if (!sessionId) {
      setLogs([]);
      return;
    }

    const eventSource = new EventSource(
      `${baseUrl}/dashboard/logs?sessionId=${encodeURIComponent(sessionId)}`
    );
    eventSourceRef.current = eventSource;

    // Handle initial batch of logs
    eventSource.addEventListener("logs", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as LogsBatchData;
        const newLogs = data.logs;
        if (newLogs && Array.isArray(newLogs)) {
          const logsWithIds = newLogs.map(ensureLogId);
          setLogs((prev) => {
            const existingIds = new Set(prev.map((l) => l.id));
            const uniqueNew = logsWithIds.filter((l) => !existingIds.has(l.id));
            return [...prev, ...uniqueNew];
          });
        }
      } catch {
        // Ignore parse errors
      }
    });

    // Handle individual log entries
    eventSource.addEventListener("log", (event: MessageEvent) => {
      try {
        const log = ensureLogId(JSON.parse(event.data as string) as LogEntry);
        setLogs((prev) => {
          if (prev.some((l) => l.id === log.id)) {
            return prev;
          }
          return [...prev, log];
        });
      } catch {
        // Ignore parse errors
      }
    });

    // Handle session disconnect
    eventSource.addEventListener("disconnected", () => {
      eventSource.close();
      eventSourceRef.current = null;
    });

    // Handle no session
    eventSource.addEventListener("noSession", () => {
      eventSource.close();
      eventSourceRef.current = null;
    });

    eventSource.onerror = () => {
      // Connection lost, will be re-established when session changes
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [baseUrl, sessionId]);

  return { logs, clearLogs };
}
