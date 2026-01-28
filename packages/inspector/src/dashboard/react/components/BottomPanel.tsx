/**
 * BottomPanel Component
 *
 * Container for logs and events panels with view mode selector.
 * Features:
 * - View mode selector buttons: Logs, Events, Split
 * - Single panel mode shows LogsPanel or EventsPanel
 * - Split mode shows both side-by-side with vertical divider
 * - Collapse/expand toggle
 * - Clear all button
 */

import React, { useState, useCallback, useEffect } from "react";
import type { LogEntry } from "../hooks/useLogStream";
import type { InspectorEvent } from "../../../types";
import { styles } from "../styles";
import { LogsPanel } from "./LogsPanel";
import { EventsPanel } from "./EventsPanel";

export type ViewMode = "logs" | "events" | "split";

export interface BottomPanelProps {
  /** Array of log entries */
  logs: LogEntry[];
  /** Array of inspector events */
  events: InspectorEvent[];
  /** Callback to clear all logs */
  onClearLogs: () => void;
  /** Callback to clear all events */
  onClearEvents: () => void;
  /** Current panel height */
  panelHeight: number;
  /** Whether the panel is collapsed */
  isCollapsed: boolean;
  /** Toggle panel collapse state */
  onToggleCollapse: () => void;
}

export function BottomPanel({
  logs,
  events,
  onClearLogs,
  onClearEvents,
  panelHeight,
  isCollapsed,
  onToggleCollapse,
}: BottomPanelProps): React.ReactElement {
  // Persist view mode in localStorage
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("mcp-dashboard-view-mode");
      if (stored === "logs" || stored === "events" || stored === "split") {
        return stored;
      }
    }
    return "split";
  });

  // Save view mode
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("mcp-dashboard-view-mode", viewMode);
    }
  }, [viewMode]);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const handleClearAll = useCallback(() => {
    onClearLogs();
    onClearEvents();
  }, [onClearLogs, onClearEvents]);

  const getViewModeBtnStyle = (mode: ViewMode): React.CSSProperties => ({
    ...(styles.viewModeBtn as React.CSSProperties),
    ...(viewMode === mode ? (styles.viewModeBtnActive as React.CSSProperties) : {}),
  });

  return (
    <>
      {/* Header - always visible */}
      <div style={styles.logsHeader}>
        <div style={styles.viewModeSelector as React.CSSProperties}>
          <button
            style={getViewModeBtnStyle("logs")}
            onClick={() => handleViewModeChange("logs")}
            title="Show logs only"
          >
            Logs ({logs.length})
          </button>
          <button
            style={getViewModeBtnStyle("events")}
            onClick={() => handleViewModeChange("events")}
            title="Show events only"
          >
            Events ({events.length})
          </button>
          <button
            style={getViewModeBtnStyle("split")}
            onClick={() => handleViewModeChange("split")}
            title="Show logs and events side by side"
          >
            Split
          </button>
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
          {viewMode === "logs" && (
            <LogsPanel logs={logs} onClearLogs={onClearLogs} showHeader={false} />
          )}

          {viewMode === "events" && (
            <EventsPanel events={events} onClearEvents={onClearEvents} showHeader={false} />
          )}

          {viewMode === "split" && (
            <>
              <div style={styles.splitPane as React.CSSProperties}>
                <LogsPanel logs={logs} onClearLogs={onClearLogs} showHeader={true} />
              </div>
              <div style={styles.splitDivider as React.CSSProperties} />
              <div style={styles.splitPane as React.CSSProperties}>
                <EventsPanel events={events} onClearEvents={onClearEvents} showHeader={true} />
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

export default BottomPanel;
