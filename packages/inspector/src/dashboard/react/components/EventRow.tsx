/**
 * EventRow Component
 *
 * Displays a single inspector event with expandable payload details.
 * Features:
 * - Click to expand/collapse
 * - Timestamp display (HH:MM:SS.mmm)
 * - Category badge with color coding
 * - Event type label
 * - Summary text
 * - Expanded view shows JSON payload via JsonViewer
 */

import React, { useState, useCallback } from "react";
import type { InspectorEvent, AgnosticInspectorEvent, EventCategory } from "../../../types";
import { getEventSummary } from "../../../types";
import { styles } from "../styles";
import { JsonViewer } from "./JsonViewer";

export interface EventRowProps {
  /** The event to display */
  event: InspectorEvent | AgnosticInspectorEvent;
}

/**
 * Format timestamp as HH:MM:SS.mmm
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  const s = date.getSeconds().toString().padStart(2, "0");
  const ms = date.getMilliseconds().toString().padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

/**
 * Get badge style for a category
 */
function getCategoryBadgeStyle(category: EventCategory): React.CSSProperties {
  switch (category) {
    case "tool":
      return styles.eventBadgeTool as React.CSSProperties;
    case "dom":
      return styles.eventBadgeDom as React.CSSProperties;
    case "globals":
      return styles.eventBadgeGlobals as React.CSSProperties;
    case "lifecycle":
      return styles.eventBadgeLifecycle as React.CSSProperties;
    case "session":
      return styles.eventBadgeSession as React.CSSProperties;
    case "error":
      return styles.eventBadgeError as React.CSSProperties;
    case "dialog":
      return styles.eventBadgeDialog as React.CSSProperties;
    case "agent":
      return styles.eventBadgeAgent as React.CSSProperties;
  }
}

export function EventRow({ event }: EventRowProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleExpand();
      }
    },
    [toggleExpand]
  );

  const summary = getEventSummary(event);
  const badgeStyle = getCategoryBadgeStyle(event.category);

  const rowStyle: React.CSSProperties = {
    ...(styles.eventRow as React.CSSProperties),
    ...(isExpanded ? (styles.eventRowExpanded as React.CSSProperties) : {}),
  };

  const headerStyle: React.CSSProperties = {
    ...(styles.eventRowHeader as React.CSSProperties),
    ...(isHovered ? (styles.eventRowHeaderHover as React.CSSProperties) : {}),
  };

  const expandIconStyle: React.CSSProperties = {
    ...(styles.eventExpandIcon as React.CSSProperties),
    ...(isExpanded ? (styles.eventExpandIconOpen as React.CSSProperties) : {}),
  };

  return (
    <div style={rowStyle}>
      <div
        style={headerStyle}
        onClick={toggleExpand}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-expanded={isExpanded}
      >
        <span style={expandIconStyle}>▶</span>
        <span style={styles.eventTime as React.CSSProperties}>{formatTime(event.timestamp)}</span>
        <span style={{ ...(styles.eventBadge as React.CSSProperties), ...badgeStyle }}>
          {event.category}
        </span>
        <span style={styles.eventType as React.CSSProperties}>{event.type}</span>
        <span style={styles.eventSummary as React.CSSProperties} title={summary}>
          {summary}
        </span>
      </div>
      {isExpanded && (
        <div style={styles.eventPayload as React.CSSProperties}>
          <JsonViewer data={event.payload} />
        </div>
      )}
    </div>
  );
}

export default EventRow;
