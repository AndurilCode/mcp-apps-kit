/**
 * useWidgetUrl Hook
 *
 * Fetches the direct widget URL for embedding a session in an iframe.
 * Used by WidgetDisplay to render interactive content in human mode.
 */

import { useState, useEffect, useRef } from "react";

export interface UseWidgetUrlResult {
  url: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useWidgetUrl(
  baseUrl: string,
  sessionId: string | null,
  connectionId: string | null
): UseWidgetUrlResult {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    // Abort any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    // Reset when no session
    urlRef.current = null;
    if (!sessionId) {
      setUrl(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const fetchUrl = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ sessionId });
        if (connectionId) {
          params.set("connectionId", connectionId);
        }
        const res = await fetch(`${baseUrl}/dashboard/widget-url?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          setError(data.error ?? `HTTP ${res.status}`);
          setUrl(null);
          return;
        }

        const data = (await res.json()) as { url: string };
        setUrl(data.url);
        urlRef.current = data.url;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          return; // Ignore aborted requests
        }
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        setUrl(null);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchUrl();

    // Retry on failure — widget server may still be starting up from background render
    const retryInterval = setInterval(() => {
      if (!controller.signal.aborted && urlRef.current === null) {
        void fetchUrl();
      }
    }, 2000);

    return () => {
      controller.abort();
      clearInterval(retryInterval);
    };
  }, [baseUrl, sessionId, connectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { url, isLoading, error };
}
