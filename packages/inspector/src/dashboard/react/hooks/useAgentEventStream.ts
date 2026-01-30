/**
 * useAgentEventStream Hook
 *
 * Connects to the inspector SSE endpoint for real-time session-agnostic agent event streaming.
 * Agent events track tool calls made by the inspector agent on the connected MCP server.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { AgnosticInspectorEvent } from "../../../types";

interface EventsBatchData {
  events?: AgnosticInspectorEvent[];
}

export interface UseAgentEventStreamResult {
  events: AgnosticInspectorEvent[];
  clearEvents: () => void;
}

export function useAgentEventStream(
  baseUrl: string,
  connectionId: string | null = null
): UseAgentEventStreamResult {
  const [events, setEvents] = useState<AgnosticInspectorEvent[]>([]);
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

    // Clear events when connection changes
    setEvents([]);

    // Don't connect when there's no active connection
    if (!connectionId) {
      return;
    }

    const params = `?connectionId=${encodeURIComponent(connectionId)}`;
    const eventSource = new EventSource(`${baseUrl}/dashboard/agent-events${params}`);
    eventSourceRef.current = eventSource;

    // Handle initial batch of events
    eventSource.addEventListener("events", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as EventsBatchData;
        const newEvents = data.events;
        if (newEvents && Array.isArray(newEvents)) {
          setEvents((prev) => [...prev, ...newEvents]);
        }
      } catch {
        // Ignore parse errors
      }
    });

    // Handle individual event entries
    eventSource.addEventListener("event", (event: MessageEvent) => {
      try {
        const agentEvent = JSON.parse(event.data as string) as AgnosticInspectorEvent;
        setEvents((prev) => [...prev, agentEvent]);
      } catch {
        // Ignore parse errors
      }
    });

    eventSource.onerror = () => {
      // Connection lost, will attempt to reconnect automatically
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [baseUrl, connectionId]);

  return { events, clearEvents };
}
