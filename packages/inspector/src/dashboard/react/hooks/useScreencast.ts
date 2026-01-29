/**
 * useScreencast Hook
 *
 * Connects to the inspector SSE endpoint for real-time screencast streaming.
 */

import { useState, useEffect, useRef } from "react";

export type ScreencastStatus = "disconnected" | "connecting" | "streaming" | "error";

interface FrameData {
  image: string;
  timestamp?: number;
}

interface ErrorData {
  message: string;
}

export interface UseScreencastResult {
  imageData: string | null;
  status: ScreencastStatus;
  error: string | null;
}

export function useScreencast(baseUrl: string, sessionId: string | null): UseScreencastResult {
  const [imageData, setImageData] = useState<string | null>(null);
  const [status, setStatus] = useState<ScreencastStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clean up previous connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Reset state if no session
    if (!sessionId) {
      setImageData(null);
      setStatus("disconnected");
      setError(null);
      return;
    }

    const connect = (): void => {
      setStatus("connecting");
      setError(null);

      const eventSource = new EventSource(
        `${baseUrl}/dashboard/stream?sessionId=${encodeURIComponent(sessionId)}`
      );
      eventSourceRef.current = eventSource;

      eventSource.addEventListener("frame", (event: MessageEvent) => {
        setStatus("streaming");
        setError(null);
        try {
          const data = JSON.parse(event.data as string) as FrameData;
          setImageData(data.image);
        } catch {
          // Ignore parse errors
        }
      });

      eventSource.addEventListener("noSession", () => {
        setStatus("disconnected");
        setImageData(null);
        scheduleReconnect();
      });

      eventSource.addEventListener("error", (event: Event) => {
        // Only attempt to parse data if this is actually a MessageEvent with data
        if (event instanceof MessageEvent && typeof event.data === "string") {
          try {
            const data = JSON.parse(event.data) as ErrorData;
            setError(data.message);
          } catch {
            // Ignore parse errors
          }
        }
        setStatus("error");
        scheduleReconnect();
      });

      eventSource.onerror = () => {
        setStatus("disconnected");
        scheduleReconnect();
      };
    };

    const scheduleReconnect = (): void => {
      if (reconnectTimeoutRef.current) return;
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        if (sessionId) {
          connect();
        }
      }, 2000);
    };

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
  }, [baseUrl, sessionId]);

  return { imageData, status, error };
}
