/**
 * useSessions Hook
 *
 * Polls the inspector backend for active widget sessions.
 */

import { useState, useEffect, useCallback, useRef } from "react";

export interface SessionInfo {
  id: string;
  toolName: string;
  protocol: string;
  createdAt: number;
  lastAccessedAt: number;
  source: string;
}

interface SessionsResponse {
  sessions?: SessionInfo[];
}

export interface UseSessionsResult {
  sessions: SessionInfo[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSessions(
  baseUrl: string,
  connectionId: string | null = null,
  pollInterval = 2000
): UseSessionsResult {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cachedByConnection = useRef<Map<string, SessionInfo[]>>(new Map());

  const fetchSessions = useCallback(async () => {
    if (!connectionId) {
      setSessions([]);
      setIsLoading(false);
      return;
    }
    try {
      const params = `?connectionId=${encodeURIComponent(connectionId)}`;
      const res = await fetch(`${baseUrl}/dashboard/sessions${params}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as SessionsResponse;
      const fetched = data.sessions ?? [];
      setSessions(fetched);
      cachedByConnection.current.set(connectionId, fetched);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch sessions");
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl, connectionId]);

  useEffect(() => {
    if (!connectionId) {
      // No active connection — stop polling but keep cache intact
      setSessions([]);
      setIsLoading(false);
      return;
    }

    // Restore from cache immediately if available (avoids loading flash)
    const cached = cachedByConnection.current.get(connectionId);
    if (cached) {
      setSessions(cached);
      setIsLoading(false);
    } else {
      setSessions([]);
      setIsLoading(true);
    }

    // Always start polling to keep data fresh
    void fetchSessions();
    const interval = setInterval(() => {
      void fetchSessions();
    }, pollInterval);
    return () => {
      clearInterval(interval);
    };
  }, [fetchSessions, pollInterval, connectionId]);

  return { sessions, isLoading, error, refresh: fetchSessions };
}
