/**
 * useResourceReader Hook
 *
 * Reads MCP resources via the dashboard backend.
 * Only available in human mode — backend returns 403 in agent mode.
 */

import { useState, useCallback } from "react";

// =============================================================================
// Types
// =============================================================================

export interface ResourceContent {
  uri: string;
  text?: string;
  blob?: string;
  mimeType?: string;
}

export interface ResourceReadResult {
  contents: ResourceContent[];
}

export interface UseResourceReaderResult {
  read: (uri: string) => Promise<void>;
  isReading: boolean;
  lastContent: ResourceReadResult | null;
  error: string | null;
}

// =============================================================================
// Hook
// =============================================================================

export function useResourceReader(
  baseUrl: string,
  connectionId: string | null
): UseResourceReaderResult {
  const [isReading, setIsReading] = useState(false);
  const [lastContent, setLastContent] = useState<ResourceReadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(
    async (uri: string): Promise<void> => {
      setIsReading(true);
      setError(null);

      try {
        const res = await fetch(`${baseUrl}/dashboard/read-resource`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(connectionId ? { connectionId } : {}),
            uri,
          }),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }

        const data = (await res.json()) as ResourceReadResult;
        setLastContent(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Resource read failed");
        setLastContent(null);
      } finally {
        setIsReading(false);
      }
    },
    [baseUrl, connectionId]
  );

  return { read, isReading, lastContent, error };
}
