/**
 * EventRow Component
 *
 * Displays a single inspector event with expandable payload details.
 * Features:
 * - Click to expand/collapse
 * - Timestamp display (HH:MM:SS.mmm)
 * - Category badge with color coding (hidden in agent view)
 * - Event type label
 * - Summary text
 * - Arrow icons (↑/↓) for agent tool-call/result events
 * - Tinted input/output sections for agent events
 * - Reasoning bubble with typing animation for agent tool calls
 * - Expanded view shows JSON payload via JsonViewer
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import type { InspectorEvent, AgnosticInspectorEvent, EventCategory } from "../../../types";
import { getEventSummary } from "../../../types";
import { styles } from "../styles";
import { JsonViewer } from "./JsonViewer";

export interface EventRowProps {
  /** The event to display */
  event: InspectorEvent | AgnosticInspectorEvent;
  /** Whether this row is rendered inside the agent panel (hides redundant badge) */
  isAgentView?: boolean;
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

/**
 * Extract reasoning string from an agent-tool-call payload
 */
function getPayloadReasoning(payload: unknown): string | undefined {
  if (payload && typeof payload === "object" && "reasoning" in payload) {
    const value = (payload as Record<string, unknown>).reasoning;
    return typeof value === "string" && value.length > 0 ? value : undefined;
  }
  return undefined;
}

// Characters per second for the typing effect
const CHARS_PER_SECOND = 120;

// Module-level cache to track which event IDs have had their reasoning animated
// This persists across component remounts (e.g., tab switches)
const animatedReasoningCache = new Set<string>();

/**
 * Reasoning bubble with a streaming/typing animation.
 * When `skipAnimation` is true the full text is shown immediately (no replay on re-expand).
 */
function ReasoningBubble({
  text,
  skipAnimation = false,
  onAnimationDone,
}: {
  text: string;
  skipAnimation?: boolean;
  onAnimationDone?: () => void;
}): React.ReactElement {
  const [displayedLength, setDisplayedLength] = useState(skipAnimation ? text.length : 0);
  const [isDone, setIsDone] = useState(skipAnimation);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (skipAnimation) {
      setDisplayedLength(text.length);
      setIsDone(true);
      return;
    }

    startTimeRef.current = null;
    setDisplayedLength(0);
    setIsDone(false);

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }
      const elapsed = timestamp - startTimeRef.current;
      const charsToShow = Math.min(Math.floor((elapsed / 1000) * CHARS_PER_SECOND), text.length);
      setDisplayedLength(charsToShow);

      if (charsToShow < text.length) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setIsDone(true);
        onAnimationDone?.();
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [text, skipAnimation, onAnimationDone]);

  return (
    <div style={styles.reasoningContainer as React.CSSProperties}>
      <div style={styles.reasoningBubble as React.CSSProperties}>
        <div style={styles.reasoningLabel as React.CSSProperties}>reasoning</div>
        <div style={styles.reasoningText as React.CSSProperties}>
          {text.slice(0, displayedLength)}
          {!isDone && <span style={styles.reasoningCursor as React.CSSProperties} />}
        </div>
      </div>
    </div>
  );
}

export function EventRow({ event, isAgentView = false }: EventRowProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  // Check if this event's reasoning was already animated (persists across remounts)
  const wasAlreadyAnimated = animatedReasoningCache.has(event.id);

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

  // Determine if this is an agent input or output event
  const isAgentInput = event.type === "agent-tool-call";
  const isAgentOutput = event.type === "agent-tool-result";
  const isAgentEvent = isAgentInput || isAgentOutput;

  // Extract reasoning (only for agent-tool-call)
  const reasoning = isAgentInput ? getPayloadReasoning(event.payload) : undefined;

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

  // Pick tinted payload style for agent events, default for others
  const payloadStyle: React.CSSProperties = isAgentInput
    ? (styles.agentPayloadInput as React.CSSProperties)
    : isAgentOutput
      ? (styles.agentPayloadOutput as React.CSSProperties)
      : (styles.eventPayload as React.CSSProperties);

  // Show badge unless in agent view (redundant there)
  const showBadge = !(isAgentView && event.category === "agent");

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
        {showBadge && (
          <span style={{ ...(styles.eventBadge as React.CSSProperties), ...badgeStyle }}>
            {event.category}
          </span>
        )}
        {isAgentEvent && (
          <span
            style={{
              ...(styles.agentArrowIcon as React.CSSProperties),
              ...(isAgentInput
                ? (styles.agentArrowInput as React.CSSProperties)
                : (styles.agentArrowOutput as React.CSSProperties)),
            }}
          >
            {isAgentInput ? "↑" : "↓"}
          </span>
        )}
        <span style={styles.eventType as React.CSSProperties}>{event.type}</span>
        <span style={styles.eventSummary as React.CSSProperties} title={summary}>
          {summary}
        </span>
      </div>
      {/* Show reasoning bubble for agent tool calls even when collapsed */}
      {reasoning && (
        <ReasoningBubble
          text={reasoning}
          skipAnimation={wasAlreadyAnimated}
          onAnimationDone={() => {
            // Mark this event as animated in the global cache
            animatedReasoningCache.add(event.id);
          }}
        />
      )}
      {isExpanded && (
        <div style={payloadStyle}>
          <JsonViewer data={event.payload} />
        </div>
      )}
    </div>
  );
}

export default EventRow;
