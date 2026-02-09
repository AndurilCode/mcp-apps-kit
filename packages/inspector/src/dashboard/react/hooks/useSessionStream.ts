/**
 * useSessionStream Hook
 *
 * Subscribes to the /dashboard/sessions/stream SSE endpoint for real-time
 * session lifecycle events (session-created, session-closed).
 */

import { useState, useEffect, useRef, useCallback } from "react";

export interface SessionEntry {
  sessionId: string;
  hostUrl: string;
}

export interface UseSessionStreamResult {
  /** Currently active sessions (ordered by creation) */
  sessions: SessionEntry[];
  /** Whether the SSE connection is active */
  connected: boolean;
}

export function useSessionStream(baseUrl: string): UseSessionStreamResult {
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    // Clean up previous
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`${baseUrl}/dashboard/sessions/stream`);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };

    es.addEventListener("session-created", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as { sessionId: string; hostUrl: string };
        setSessions((prev) => {
          // Don't duplicate
          if (prev.some((s) => s.sessionId === data.sessionId)) return prev;
          return [...prev, { sessionId: data.sessionId, hostUrl: data.hostUrl }];
        });
      } catch {
        // Ignore parse errors
      }
    });

    es.addEventListener("session-closed", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as { sessionId: string };
        setSessions((prev) => prev.filter((s) => s.sessionId !== data.sessionId));
      } catch {
        // Ignore parse errors
      }
    });

    es.onerror = () => {
      setConnected(false);
      es.close();
      // Reconnect after 2s
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connect();
      }, 2000);
    };
  }, [baseUrl]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [connect]);

  return { sessions, connected };
}
