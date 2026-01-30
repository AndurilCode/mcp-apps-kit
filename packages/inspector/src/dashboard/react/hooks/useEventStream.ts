/**
 * useEventStream Hook
 *
 * Connects to the inspector SSE endpoint for real-time event streaming.
 * Events track all system activities: tool calls, globals changes, DOM interactions, etc.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { InspectorEvent } from "../../../types";

interface EventsBatchData {
  events?: InspectorEvent[];
}

export interface UseEventStreamResult {
  events: InspectorEvent[];
  clearEvents: () => void;
}

export function useEventStream(
  baseUrl: string,
  sessionId: string | null,
  connectionId: string | null = null
): UseEventStreamResult {
  const [events, setEvents] = useState<InspectorEvent[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  useEffect(() => {
    // Clean up previous connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Clear events and exit if no session
    if (!sessionId) {
      setEvents([]);
      return;
    }

    const params = new URLSearchParams({ sessionId });
    if (connectionId) {
      params.set("connectionId", connectionId);
    }
    const eventSource = new EventSource(`${baseUrl}/dashboard/events?${params.toString()}`);
    eventSourceRef.current = eventSource;

    // Handle initial batch of events
    eventSource.addEventListener("events", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as EventsBatchData;
        const newEvents = data.events;
        if (newEvents && Array.isArray(newEvents)) {
          setEvents((prev) => {
            const existingIds = new Set(prev.map((e) => e.id));
            const uniqueNew = newEvents.filter((e) => !existingIds.has(e.id));
            return [...prev, ...uniqueNew];
          });
        }
      } catch {
        // Ignore parse errors
      }
    });

    // Handle individual event entries
    eventSource.addEventListener("event", (event: MessageEvent) => {
      try {
        const inspectorEvent = JSON.parse(event.data as string) as InspectorEvent;
        setEvents((prev) => [...prev, inspectorEvent]);
      } catch {
        // Ignore parse errors
      }
    });

    // Handle session disconnect
    eventSource.addEventListener("disconnected", () => {
      eventSource.close();
      eventSourceRef.current = null;
    });

    // Handle no session
    eventSource.addEventListener("noSession", () => {
      eventSource.close();
      eventSourceRef.current = null;
    });

    eventSource.onerror = () => {
      // Connection lost, will be re-established when session changes
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [baseUrl, sessionId, connectionId]);

  return { events, clearEvents };
}
