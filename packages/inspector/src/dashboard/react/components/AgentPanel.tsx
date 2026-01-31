/**
 * AgentPanel Component
 *
 * Displays a list of session-agnostic agent events (tool calls on connected MCP server).
 * Features:
 * - Category filter dropdown
 * - Event count display
 * - Clear button
 * - Auto-scroll to bottom
 * - Renders list of EventRow components
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { AgnosticInspectorEvent, EventCategory } from "../../../types";
import { styles } from "../styles";
import { EventRow } from "./EventRow";

export interface AgentPanelProps {
  /** Array of agent events to display */
  events: AgnosticInspectorEvent[];
  /** Callback to clear all events */
  onClearEvents: () => void;
  /** Whether to show the header (default: true) */
  showHeader?: boolean;
  /** Whether to show the title in the header (default: true) */
  showTitle?: boolean;
  /** Whether to show the clear button in the header (default: true) */
  showClearButton?: boolean;
}

// Agent events only use the "agent" category, but we support filtering for consistency
const AGENT_CATEGORIES: EventCategory[] = ["agent"];

export function AgentPanel({
  events,
  onClearEvents,
  showHeader = true,
  showTitle = true,
  showClearButton = true,
}: AgentPanelProps): React.ReactElement {
  const [categoryFilter, setCategoryFilter] = useState<EventCategory | "all">("all");
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter events by category
  const filteredEvents = useMemo(() => {
    if (categoryFilter === "all") {
      return events;
    }
    return events.filter((e) => e.category === categoryFilter);
  }, [events, categoryFilter]);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [filteredEvents]);

  const handleCategoryChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setCategoryFilter(e.target.value as EventCategory | "all");
  }, []);

  return (
    <div style={styles.eventsPanel as React.CSSProperties}>
      {showHeader && (
        <div style={styles.eventsPanelHeader as React.CSSProperties}>
          {showTitle && <span style={styles.eventsPanelTitle as React.CSSProperties}>Agent</span>}
          <div style={styles.eventsPanelControls as React.CSSProperties}>
            <select
              style={styles.filterSelect as React.CSSProperties}
              value={categoryFilter}
              onChange={handleCategoryChange}
              aria-label="Filter agent events by category"
            >
              <option value="all">All ({events.length})</option>
              {AGENT_CATEGORIES.map((cat) => {
                const count = events.filter((e) => e.category === cat).length;
                return (
                  <option key={cat} value={cat}>
                    {cat} ({count})
                  </option>
                );
              })}
            </select>
            {showClearButton && (
              <button style={styles.clearLogsBtn as React.CSSProperties} onClick={onClearEvents}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}
      <div ref={containerRef} style={styles.eventsContainer as React.CSSProperties}>
        {filteredEvents.length === 0 ? (
          <div style={styles.eventsEmpty as React.CSSProperties}>No agent events yet</div>
        ) : (
          filteredEvents.map((event) => <EventRow key={event.id} event={event} />)
        )}
      </div>
    </div>
  );
}

export default AgentPanel;
