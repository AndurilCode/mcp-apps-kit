/**
 * useConnections Hook
 *
 * Manages multiple MCP server connections for the dashboard.
 * Fetches from /dashboard/connections, creates/deletes connections via REST.
 * Integrates with useServerHistory for URL autocomplete.
 */

import { useCallback, useEffect, useState } from "react";
import { useServerHistory, type ServerHistoryEntry } from "./useServerHistory";

/**
 * Dashboard connection lifecycle status.
 */
export type DashboardConnectionStatus = "connected" | "disconnected" | "connecting" | "error";

/**
 * Connection data used by the dashboard UI.
 */
export interface DashboardConnection {
  id: string;
  url: string;
  serverInfo: { name?: string; version?: string } | null;
  status: DashboardConnectionStatus;
}

interface ConnectionsResponse {
  connections?: Array<{
    id: string;
    connected?: boolean;
    serverUrl?: string | null;
    serverInfo?: { name?: string; version?: string } | null;
  }>;
}

interface CreateConnectionResponse {
  id: string;
  url: string;
  serverInfo?: { name?: string; version?: string } | null;
}

/**
 * Return shape for the useConnections hook.
 */
export interface UseConnectionsResult {
  connections: DashboardConnection[];
  activeConnectionId: string | null;
  setActiveConnectionId: (id: string) => void;
  isLoading: boolean;
  isCreating: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createConnection: (url: string) => Promise<DashboardConnection | null>;
  closeConnection: (id: string) => Promise<boolean>;
  getMatchingEntries: (filter: string) => ServerHistoryEntry[];
}

function normalizeConnection(entry: {
  id: string;
  connected?: boolean;
  serverUrl?: string | null;
  serverInfo?: { name?: string; version?: string } | null;
}): DashboardConnection {
  return {
    id: entry.id,
    url: entry.serverUrl ?? "",
    serverInfo: entry.serverInfo ?? null,
    status: entry.connected ? "connected" : "disconnected",
  };
}

/**
 * Manage dashboard connections and related UI state.
 *
 * @param baseUrl - Base URL for the inspector dashboard API.
 * @returns Hook state and connection actions.
 */
export function useConnections(baseUrl: string): UseConnectionsResult {
  const [connections, setConnections] = useState<DashboardConnection[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { addEntry, getMatchingEntries } = useServerHistory();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/dashboard/connections`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as ConnectionsResponse;
      const normalized = (data.connections ?? []).map(normalizeConnection);
      setConnections(normalized);
      if (normalized.length === 0) {
        setActiveConnectionId(null);
      } else if (!activeConnectionId || !normalized.some((c) => c.id === activeConnectionId)) {
        setActiveConnectionId(normalized[0]?.id ?? null);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch connections");
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl, activeConnectionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createConnection = useCallback(
    async (url: string): Promise<DashboardConnection | null> => {
      setIsCreating(true);
      setError(null);
      try {
        const res = await fetch(`${baseUrl}/dashboard/connections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as CreateConnectionResponse;
        const newConn: DashboardConnection = {
          id: data.id,
          url: data.url,
          serverInfo: data.serverInfo ?? null,
          status: "connected",
        };
        setConnections((prev) => {
          const filtered = prev.filter((c) => c.id !== newConn.id);
          return [...filtered, newConn];
        });
        setActiveConnectionId(newConn.id);
        addEntry({
          url: data.url,
          protocolType: "mcp",
          name: data.serverInfo?.name,
        });
        return newConn;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Connection failed");
        return null;
      } finally {
        setIsCreating(false);
      }
    },
    [baseUrl, addEntry]
  );

  const closeConnection = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const res = await fetch(`${baseUrl}/dashboard/connections/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        setConnections((prev) => {
          const updated = prev.filter((c) => c.id !== id);
          // Use functional update for activeConnectionId to avoid stale closure
          setActiveConnectionId((prevActive) => {
            if (prevActive !== id) return prevActive;
            return updated[0]?.id ?? null;
          });
          return updated;
        });
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to close connection");
        return false;
      }
    },
    [baseUrl]
  );

  return {
    connections,
    activeConnectionId,
    setActiveConnectionId,
    isLoading,
    isCreating,
    error,
    refresh,
    createConnection,
    closeConnection,
    getMatchingEntries,
  };
}

/**
 * Default export for the useConnections hook.
 */
export default useConnections;
