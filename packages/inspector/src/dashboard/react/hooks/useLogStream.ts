/**
 * useLogStream Hook
 *
 * Connects to the inspector SSE endpoint for real-time log streaming.
 */

import { useState, useEffect, useRef, useCallback } from "react";

export interface LogEntry {
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
          setLogs((prev) => [...prev, ...newLogs]);
        }
      } catch {
        // Ignore parse errors
      }
    });

    // Handle individual log entries
    eventSource.addEventListener("log", (event: MessageEvent) => {
      try {
        const log = JSON.parse(event.data as string) as LogEntry;
        setLogs((prev) => [...prev, log]);
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
