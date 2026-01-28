/**
 * useConnectionStatus Hook
 *
 * Polls the inspector health endpoint to track connection status to the target MCP server.
 */

import { useState, useEffect, useCallback } from "react";

export interface ConnectionStatus {
  connected: boolean;
  serverUrl: string | null;
}

export interface UseConnectionStatusResult {
  status: ConnectionStatus;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Hook to track connection status to the target MCP server
 * @param baseUrl - Base URL for the inspector API
 * @param pollInterval - Polling interval in ms (default: 2000)
 */
export function useConnectionStatus(
  baseUrl: string,
  pollInterval = 2000
): UseConnectionStatusResult {
  const [status, setStatus] = useState<ConnectionStatus>({
    connected: false,
    serverUrl: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      const data = (await response.json()) as {
        connection?: { connected?: boolean; serverUrl?: string };
      };
      setStatus({
        connected: data.connection?.connected ?? false,
        serverUrl: data.connection?.serverUrl ?? null,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch status");
      setStatus({ connected: false, serverUrl: null });
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
      void fetchStatus();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [fetchStatus, pollInterval]);

  return {
    status,
    isLoading,
    error,
    refresh: fetchStatus,
  };
}

export default useConnectionStatus;
