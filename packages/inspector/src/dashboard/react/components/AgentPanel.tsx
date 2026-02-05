/**
 * AgentPanel Component
 *
 * Displays a list of session-agnostic agent events (tool calls on connected MCP server).
 * Features:
 * - Event count display
 * - Clear button
 * - Auto-scroll to bottom
 * - Renders list of EventRow components
 */

import React, { useEffect, useRef } from "react";
import type { AgnosticInspectorEvent } from "../../../types";
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

export function AgentPanel({
  events,
  onClearEvents,
  showHeader = true,
  showTitle = true,
  showClearButton = true,
}: AgentPanelProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div style={styles.eventsPanel as React.CSSProperties}>
      {showHeader && (
        <div style={styles.eventsPanelHeader as React.CSSProperties}>
          {showTitle && <span style={styles.eventsPanelTitle as React.CSSProperties}>Agent</span>}
          <div style={styles.eventsPanelControls as React.CSSProperties}>
            {showClearButton && (
              <button style={styles.clearLogsBtn as React.CSSProperties} onClick={onClearEvents}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}
      <div ref={containerRef} style={styles.eventsContainer as React.CSSProperties}>
        {events.length === 0 ? (
          <div style={styles.eventsEmpty as React.CSSProperties}>No agent events yet</div>
        ) : (
          events.map((event) => <EventRow key={event.id} event={event} isAgentView />)
        )}
      </div>
    </div>
  );
}

export default AgentPanel;
