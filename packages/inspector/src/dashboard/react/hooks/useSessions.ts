/**
 * useSessions Hook
 *
 * Polls the inspector backend for active widget sessions.
 */

import { useState, useEffect, useCallback } from "react";

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

export function useSessions(baseUrl: string, pollInterval = 2000): UseSessionsResult {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/dashboard/sessions`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as SessionsResponse;
      setSessions(data.sessions ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch sessions");
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    void fetchSessions();
    const interval = setInterval(() => {
      void fetchSessions();
    }, pollInterval);
    return () => {
      clearInterval(interval);
    };
  }, [fetchSessions, pollInterval]);

  return { sessions, isLoading, error, refresh: fetchSessions };
}
