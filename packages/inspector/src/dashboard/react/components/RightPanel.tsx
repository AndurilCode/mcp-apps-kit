/**
 * RightPanel Component
 *
 * Tabbed sidebar for Agent, Events, and Logs.
 */

import React, { useEffect, useMemo, useState } from "react";
import type { LogEntry } from "../hooks/useLogStream";
import type { InspectorEvent, AgnosticInspectorEvent } from "../../../types";
import { styles } from "../styles";
import { LogsPanel } from "./LogsPanel";
import { EventsPanel } from "./EventsPanel";
import { AgentPanel } from "./AgentPanel";

type RightPanelTab = "agent" | "events" | "logs";

const ACTIVE_TAB_STORAGE_KEY = "mcp-dashboard-right-panel-tab";

export interface RightPanelProps {
  logs: LogEntry[];
  events: InspectorEvent[];
  agentEvents: AgnosticInspectorEvent[];
  onClearLogs?: () => void;
  onClearEvents?: () => void;
  onClearAgent?: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  panelWidth: number;
  resizeHandleProps: React.HTMLAttributes<HTMLDivElement>;
  isResizing: boolean;
}

export function RightPanel({
  logs,
  events,
  agentEvents,
  onClearLogs,
  onClearEvents,
  onClearAgent,
  isCollapsed,
  onToggleCollapse,
  panelWidth,
  resizeHandleProps,
  isResizing,
}: RightPanelProps): React.ReactElement {
  const noop = (): void => undefined;
  const [activeTab, setActiveTab] = useState<RightPanelTab>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
        if (stored === "agent" || stored === "events" || stored === "logs") {
          return stored;
        }
      } catch {
        // ignore storage access errors (e.g. private browsing)
      }
    }
    return "agent";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
      } catch {
        // ignore storage access errors
      }
    }
  }, [activeTab]);

  const tabs = useMemo(
    () => [
      { id: "agent" as const, label: "Agent", count: agentEvents.length },
      { id: "events" as const, label: "Events", count: events.length },
      { id: "logs" as const, label: "Logs", count: logs.length },
    ],
    [agentEvents.length, events.length, logs.length]
  );

  const panelStyle: React.CSSProperties = {
    ...styles.rightPanel,
    width: isCollapsed ? 0 : panelWidth,
    ...(isCollapsed ? styles.rightPanelCollapsed : {}),
  };

  if (isCollapsed) {
    return <div style={panelStyle} />;
  }

  const handleClear = (() => {
    if (activeTab === "agent") {
      return onClearAgent ?? noop;
    }
    if (activeTab === "events") {
      return onClearEvents ?? noop;
    }
    return onClearLogs ?? noop;
  })();

  const isClearDisabled =
    (activeTab === "agent" && !onClearAgent) ||
    (activeTab === "events" && !onClearEvents) ||
    (activeTab === "logs" && !onClearLogs);

  return (
    <>
      <div
        {...resizeHandleProps}
        style={{
          ...styles.rightPanelResizeHandle,
          ...(isResizing ? styles.rightPanelResizeHandleActive : {}),
          ...(resizeHandleProps.style ?? {}),
        }}
      />
      <div style={panelStyle}>
        <div style={styles.rightPanelHeader}>
          <button
            style={styles.rightPanelCollapseBtn}
            onClick={onToggleCollapse}
            title="Collapse panel"
            aria-label="Collapse panel"
          >
            ▶
          </button>
          <div style={styles.rightPanelTabs}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                style={{
                  ...styles.rightPanelTab,
                  ...(activeTab === tab.id ? styles.rightPanelTabActive : {}),
                }}
                onClick={() => setActiveTab(tab.id)}
                aria-pressed={activeTab === tab.id}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span
                    style={{
                      ...styles.rightPanelTabCount,
                      ...(activeTab === tab.id ? styles.rightPanelTabCountActive : {}),
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div style={styles.rightPanelActions}>
            <button
              style={styles.rightPanelClearBtn}
              onClick={handleClear}
              disabled={isClearDisabled}
            >
              Clear
            </button>
          </div>
        </div>
        <div style={styles.rightPanelContent}>
          {activeTab === "logs" && (
            <LogsPanel logs={logs} onClearLogs={onClearLogs ?? noop} showHeader={false} />
          )}
          {activeTab === "events" && (
            <EventsPanel
              events={events}
              onClearEvents={onClearEvents ?? noop}
              showHeader={true}
              showTitle={false}
              showClearButton={false}
            />
          )}
          {activeTab === "agent" && (
            <AgentPanel
              events={agentEvents}
              onClearEvents={onClearAgent ?? noop}
              showHeader={true}
              showTitle={false}
              showClearButton={false}
            />
          )}
        </div>
      </div>
    </>
  );
}

export default RightPanel;
