/**
 * useConnections Hook
 *
 * Manages multiple MCP server connections for the dashboard.
 * Fetches from /dashboard/connections, creates/deletes connections via REST.
 * Integrates with useServerHistory for URL autocomplete.
 */

import { useCallback, useEffect, useState } from "react";
import type { ConnectionParams } from "@mcp-apps-kit/testing";
import { useServerHistory, type ServerHistoryEntry } from "./useServerHistory";
import type { AuthRequiredEvent } from "../../../oauth/discovery";

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
  /** Whether this connection uses OAuth authentication */
  isOAuth?: boolean;
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
  authRequired?: boolean;
  discoveryResults?: AuthRequiredEvent;
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
  createConnection: (params: ConnectionParams) => Promise<DashboardConnection | null>;
  closeConnection: (id: string) => Promise<boolean>;
  getMatchingEntries: (filter: string) => ServerHistoryEntry[];
  /** Reconnect an existing connection (e.g., after OAuth completes) */
  reconnectConnection: (id: string) => Promise<boolean>;
  /** Discovery results from 401 auto-detection on the most recent connection attempt */
  authDiscovery: AuthRequiredEvent | null;
  /** Clear the auth discovery state */
  clearAuthDiscovery: () => void;
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
  const [authDiscovery, setAuthDiscovery] = useState<AuthRequiredEvent | null>(null);

  const clearAuthDiscovery = useCallback(() => {
    setAuthDiscovery(null);
  }, []);

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
    async (params: ConnectionParams): Promise<DashboardConnection | null> => {
      setIsCreating(true);
      setError(null);
      setAuthDiscovery(null);
      try {
        const res = await fetch(`${baseUrl}/dashboard/connections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as CreateConnectionResponse;

        // Capture auth discovery results from 401 auto-detection
        if (data.authRequired && data.discoveryResults) {
          setAuthDiscovery(data.discoveryResults);
        }

        // Pre-registration flow: auth URL ready, open browser for authorization
        if (data.authRequired && data.authorizationUrl) {
          window.open(data.authorizationUrl, "_blank", "noopener,noreferrer");
        }

        const newConn: DashboardConnection = {
          id: data.id,
          url: data.url,
          serverInfo: data.serverInfo ?? null,
          status: data.authRequired ? "disconnected" : "connected",
        };
        setConnections((prev) => {
          const filtered = prev.filter((c) => c.id !== newConn.id);
          return [...filtered, newConn];
        });
        setActiveConnectionId(newConn.id);
        if (params.transport === "stdio") {
          addEntry({
            url: data.url || `stdio:${params.command}`,
            protocolType: "mcp",
            name: data.serverInfo?.name,
            transport: "stdio",
            command: params.command,
            args: params.args,
          });
        } else {
          addEntry({
            url: data.url,
            protocolType: "mcp",
            name: data.serverInfo?.name,
          });
        }
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

  const reconnectConnection = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const res = await fetch(`${baseUrl}/dashboard/connections/${id}/reconnect`, {
          method: "POST",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          id: string;
          url: string;
          connected: boolean;
          serverInfo: { name?: string; version?: string } | null;
        };
        // Update connection status + mark as OAuth
        setConnections((prev) =>
          prev.map((c) =>
            c.id === id
              ? {
                  ...c,
                  status: data.connected ? "connected" : "disconnected",
                  serverInfo: data.serverInfo,
                  isOAuth: true,
                }
              : c
          )
        );
        // Clear auth discovery since we're now connected
        setAuthDiscovery(null);
        return data.connected;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Reconnect failed");
        return false;
      }
    },
    [baseUrl]
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
    reconnectConnection,
    closeConnection,
    getMatchingEntries,
    authDiscovery,
    clearAuthDiscovery,
  };
}

/**
 * Default export for the useConnections hook.
 */
export default useConnections;
