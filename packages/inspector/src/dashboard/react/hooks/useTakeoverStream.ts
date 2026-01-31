/**
 * useTakeoverStream hook
 *
 * Connects to the `/dashboard/takeover-stream` SSE endpoint and exposes
 * the currently pending agent takeover request (if any).
 */

import { useState, useEffect } from "react";
import type { TakeoverRequest } from "../contexts";

export interface UseTakeoverStreamResult {
  /** The currently pending takeover request, or null */
  pendingRequest: TakeoverRequest | null;
}

/**
 * Subscribe to the takeover SSE stream and expose the pending request state.
 *
 * @param baseUrl - Base URL for the inspector API
 */
export function useTakeoverStream(baseUrl: string): UseTakeoverStreamResult {
  const [pendingRequest, setPendingRequest] = useState<TakeoverRequest | null>(null);

  useEffect(() => {
    const url = `${baseUrl}/dashboard/takeover-stream`;
    const eventSource = new EventSource(url);

    eventSource.addEventListener("takeover-request", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string) as TakeoverRequest;
        setPendingRequest(data);
      } catch {
        // Ignore malformed events
      }
    });

    eventSource.addEventListener("takeover-response", () => {
      // Any response (allow or deny) clears the pending request
      setPendingRequest(null);
    });

    eventSource.onerror = () => {
      // On error, EventSource auto-reconnects.
      // Clear pending state to avoid stale data.
      setPendingRequest(null);
    };

    return () => {
      eventSource.close();
    };
  }, [baseUrl]);

  return { pendingRequest };
}
