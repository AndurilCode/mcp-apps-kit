/**
 * useConnection Hook
 *
 * Extends useConnectionStatus with connect/disconnect actions,
 * protocol type tracking, and server history integration.
 */

import { useState, useCallback, useEffect } from "react";
import { useServerHistory, type ProtocolType, type ServerHistoryEntry } from "./useServerHistory";

export interface ConnectionStatus {
  connected: boolean;
  serverUrl: string | null;
  serverName: string | null;
  toolCount: number;
  resourceCount: number;
  promptCount: number;
  protocolType: ProtocolType | null;
}

export interface UseConnectionResult {
  status: ConnectionStatus;
  isLoading: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: (url: string, force?: boolean) => Promise<boolean>;
  disconnect: () => Promise<boolean>;
  refresh: () => Promise<void>;
  history: ServerHistoryEntry[];
  getMatchingEntries: (filter: string) => ServerHistoryEntry[];
  clearHistory: () => void;
}

const DEFAULT_STATUS: ConnectionStatus = {
  connected: false,
  serverUrl: null,
  serverName: null,
  toolCount: 0,
  resourceCount: 0,
  promptCount: 0,
  protocolType: null,
};

/**
 * Hook to manage connection state with actions
 * @param baseUrl - Base URL for the inspector API
 * @param pollInterval - Polling interval in ms (default: 2000)
 */
export function useConnection(baseUrl: string, pollInterval = 2000): UseConnectionResult {
  const [status, setStatus] = useState<ConnectionStatus>(DEFAULT_STATUS);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { history, addEntry, clearHistory, getMatchingEntries } = useServerHistory();

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      const data = (await response.json()) as {
        connection?: {
          connected?: boolean;
          serverUrl?: string;
          serverName?: string;
          toolCount?: number;
          resourceCount?: number;
          promptCount?: number;
          protocolType?: ProtocolType | null;
        };
      };
      setStatus({
        connected: data.connection?.connected ?? false,
        serverUrl: data.connection?.serverUrl ?? null,
        serverName: data.connection?.serverName ?? null,
        toolCount: data.connection?.toolCount ?? 0,
        resourceCount: data.connection?.resourceCount ?? 0,
        promptCount: data.connection?.promptCount ?? 0,
        protocolType: data.connection?.protocolType ?? null,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch status");
      setStatus(DEFAULT_STATUS);
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl]);

  // Initial fetch
  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // Poll for status updates
  useEffect(() => {
    const interval = setInterval(() => {
      // Don't poll while connecting
      if (!isConnecting) {
        void fetchStatus();
      }
    }, pollInterval);

    return () => {
      clearInterval(interval);
    };
  }, [fetchStatus, pollInterval, isConnecting]);

  const connect = useCallback(
    async (url: string, force = false): Promise<boolean> => {
      setIsConnecting(true);
      setError(null);

      try {
        const response = await fetch(`${baseUrl}/api/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, force }),
        });

        const data = (await response.json()) as {
          success: boolean;
          error?: string;
          connected?: boolean;
          serverUrl?: string;
          serverInfo?: { name?: string; version?: string } | null;
          toolCount?: number;
          resourceCount?: number;
          promptCount?: number;
          protocolType?: ProtocolType;
        };

        if (!data.success) {
          setError(data.error ?? "Connection failed");
          return false;
        }

        // Update status immediately
        const newStatus: ConnectionStatus = {
          connected: data.connected ?? false,
          serverUrl: data.serverUrl ?? null,
          serverName: data.serverInfo?.name ?? null,
          toolCount: data.toolCount ?? 0,
          resourceCount: data.resourceCount ?? 0,
          promptCount: data.promptCount ?? 0,
          protocolType: data.protocolType ?? null,
        };
        setStatus(newStatus);

        // Add to history
        if (data.success && data.protocolType) {
          addEntry({
            url,
            protocolType: data.protocolType,
            name: data.serverInfo?.name,
          });
        }

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Connection failed";
        setError(message);
        return false;
      } finally {
        setIsConnecting(false);
      }
    },
    [baseUrl, addEntry]
  );

  const disconnect = useCallback(async (): Promise<boolean> => {
    setIsConnecting(true);
    setError(null);

    try {
      const response = await fetch(`${baseUrl}/api/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = (await response.json()) as {
        success: boolean;
        error?: string;
      };

      if (!data.success) {
        setError(data.error ?? "Disconnect failed");
        return false;
      }

      // Update status immediately
      setStatus(DEFAULT_STATUS);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Disconnect failed";
      setError(message);
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [baseUrl]);

  return {
    status,
    isLoading,
    isConnecting,
    error,
    connect,
    disconnect,
    refresh: fetchStatus,
    history,
    getMatchingEntries,
    clearHistory,
  };
}

export default useConnection;
