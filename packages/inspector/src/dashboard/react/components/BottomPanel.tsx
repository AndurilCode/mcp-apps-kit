/**
 * BottomPanel Component
 *
 * Container for logs, events, and agent panels with toggle controls.
 * Features:
 * - Toggle buttons for each panel: Logs, Events, Agent
 * - Dynamic layout based on visible panels (1, 2, or 3 side-by-side)
 * - Collapse/expand toggle
 * - Clear all button
 * - Panel visibility persisted to localStorage
 */

import React, { useCallback, useMemo } from "react";
import type { LogEntry } from "../hooks/useLogStream";
import type { InspectorEvent, AgnosticInspectorEvent } from "../../../types";
import { useInspectorMode } from "../contexts";
import { styles } from "../styles";
import { LogsPanel } from "./LogsPanel";
import { EventsPanel } from "./EventsPanel";
import { AgentPanel } from "./AgentPanel";

/**
 * Panel visibility state
 */
export interface PanelVisibility {
  logs: boolean;
  events: boolean;
  agent: boolean;
}

export interface BottomPanelProps {
  /** Array of log entries */
  logs: LogEntry[];
  /** Array of inspector events */
  events: InspectorEvent[];
  /** Array of agent events */
  agentEvents: AgnosticInspectorEvent[];
  /** Callback to clear all logs */
  onClearLogs: () => void;
  /** Callback to clear all events */
  onClearEvents: () => void;
  /** Callback to clear all agent events */
  onClearAgentEvents: () => void;
  /** Current panel height */
  panelHeight: number;
  /** Whether the panel is collapsed */
  isCollapsed: boolean;
  /** Toggle panel collapse state */
  onToggleCollapse: () => void;
  /** Current panel visibility state */
  panelVisibility: PanelVisibility;
  /** Callback to toggle a panel's visibility */
  onTogglePanel: (panel: keyof PanelVisibility) => void;
  /** Whether a widget session is active (controls logs panel availability) */
  hasActiveSession: boolean;
}

export function BottomPanel({
  logs,
  events,
  agentEvents,
  onClearLogs,
  onClearEvents,
  onClearAgentEvents,
  panelHeight,
  isCollapsed,
  onToggleCollapse,
  panelVisibility,
  onTogglePanel,
  hasActiveSession,
}: BottomPanelProps): React.ReactElement {
  const { mode } = useInspectorMode();

  const handleClearAll = useCallback(() => {
    onClearLogs();
    onClearEvents();
    onClearAgentEvents();
  }, [onClearLogs, onClearEvents, onClearAgentEvents]);

  const getToggleBtnStyle = (isActive: boolean): React.CSSProperties => ({
    ...(styles.viewModeBtn as React.CSSProperties),
    ...(isActive ? (styles.viewModeBtnActive as React.CSSProperties) : {}),
  });

  // Compute effective visibility: respects stored prefs but gates on mode/session
  const effectiveVisibility = useMemo(
    () => ({
      logs: panelVisibility.logs && hasActiveSession,
      events: panelVisibility.events,
      agent: panelVisibility.agent && mode === "agent",
    }),
    [panelVisibility, hasActiveSession, mode]
  );

  // Count visible panels using effective visibility
  const visiblePanelCount = useMemo(() => {
    let count = 0;
    if (effectiveVisibility.logs) count++;
    if (effectiveVisibility.events) count++;
    if (effectiveVisibility.agent) count++;
    return count;
  }, [effectiveVisibility]);

  // Render visible panels (uses effectiveVisibility)
  const renderPanels = useCallback(() => {
    const panels: React.ReactNode[] = [];

    if (effectiveVisibility.logs) {
      panels.push(
        <div key="logs" style={styles.splitPane as React.CSSProperties}>
          <LogsPanel logs={logs} onClearLogs={onClearLogs} showHeader={visiblePanelCount > 1} />
        </div>
      );
    }

    if (effectiveVisibility.events) {
      if (panels.length > 0) {
        panels.push(<div key="divider1" style={styles.splitDivider as React.CSSProperties} />);
      }
      panels.push(
        <div key="events" style={styles.splitPane as React.CSSProperties}>
          <EventsPanel
            events={events}
            onClearEvents={onClearEvents}
            showHeader={visiblePanelCount > 1}
          />
        </div>
      );
    }

    if (effectiveVisibility.agent) {
      if (panels.length > 0) {
        panels.push(<div key="divider2" style={styles.splitDivider as React.CSSProperties} />);
      }
      panels.push(
        <div key="agent" style={styles.splitPane as React.CSSProperties}>
          <AgentPanel
            events={agentEvents}
            onClearEvents={onClearAgentEvents}
            showHeader={visiblePanelCount > 1}
          />
        </div>
      );
    }

    return panels;
  }, [
    effectiveVisibility,
    logs,
    events,
    agentEvents,
    onClearLogs,
    onClearEvents,
    onClearAgentEvents,
    visiblePanelCount,
  ]);

  return (
    <>
      {/* Header - always visible */}
      <div style={styles.logsHeader}>
        <div style={styles.viewModeSelector as React.CSSProperties}>
          {hasActiveSession && (
            <button
              style={getToggleBtnStyle(panelVisibility.logs)}
              onClick={() => onTogglePanel("logs")}
              title={panelVisibility.logs ? "Hide logs panel" : "Show logs panel"}
            >
              Logs ({logs.length})
            </button>
          )}
          <button
            style={getToggleBtnStyle(panelVisibility.events)}
            onClick={() => onTogglePanel("events")}
            title={panelVisibility.events ? "Hide events panel" : "Show events panel"}
          >
            Events ({events.length})
          </button>
          {mode === "agent" && (
            <button
              style={getToggleBtnStyle(panelVisibility.agent)}
              onClick={() => onTogglePanel("agent")}
              title={panelVisibility.agent ? "Hide agent panel" : "Show agent panel"}
            >
              Agent ({agentEvents.length})
            </button>
          )}
        </div>
        <div style={styles.logsControls}>
          <button style={styles.clearLogsBtn} onClick={handleClearAll}>
            Clear All
          </button>
          <button
            style={{
              ...styles.toggleLogsBtn,
              transform: isCollapsed ? "rotate(180deg)" : "none",
            }}
            onClick={onToggleCollapse}
            title={isCollapsed ? "Expand panel" : "Collapse panel"}
          >
            &#9660;
          </button>
        </div>
      </div>

      {/* Content - hidden when collapsed */}
      {!isCollapsed && (
        <div
          style={{
            ...(styles.splitView as React.CSSProperties),
            height: panelHeight - 36, // Subtract header height
          }}
        >
          {visiblePanelCount === 0 ? (
            <div style={styles.eventsEmpty as React.CSSProperties}>
              No panels selected. Click a panel button above to show it.
            </div>
          ) : (
            renderPanels()
          )}
        </div>
      )}
    </>
  );
}

export default BottomPanel;
