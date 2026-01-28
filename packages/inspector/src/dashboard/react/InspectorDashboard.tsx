/**
 * Inspector Dashboard - React Component
 *
 * Real-time browser dashboard for viewing widget sessions.
 * Connects to the inspector backend via SSE for screencast, log, and event streaming.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSessions } from "./hooks/useSessions";
import { useScreencast } from "./hooks/useScreencast";
import { useLogStream } from "./hooks/useLogStream";
import { useEventStream } from "./hooks/useEventStream";
import { useAgentEventStream } from "./hooks/useAgentEventStream";
import { useResizablePanel } from "./hooks/useResizablePanel";
import { useGlobals } from "./hooks/useGlobals";
import { useConnectionStatus } from "./hooks/useConnectionStatus";
import { Toolbar } from "./components/Toolbar";
import { GlobalsPanel } from "./components/GlobalsPanel";
import { BottomPanel, type PanelVisibility } from "./components/BottomPanel";
import { styles } from "./styles";
import logoUrl from "../assets/logo.png";

export interface InspectorDashboardProps {
  /** Base URL for the inspector API (default: current origin) */
  baseUrl?: string;
  /** Initial panel height in pixels (default: 200) */
  initialPanelHeight?: number;
  /** Minimum panel height in pixels (default: 100) */
  minPanelHeight?: number;
}

const DEFAULT_PANEL_VISIBILITY: PanelVisibility = {
  logs: true,
  events: true,
  agent: true,
};

const PANEL_VISIBILITY_STORAGE_KEY = "mcp-dashboard-panel-visibility";

export function InspectorDashboard({
  baseUrl = "",
  initialPanelHeight = 200,
  minPanelHeight = 100,
}: InspectorDashboardProps): React.ReactElement {
  // Session state
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const { sessions, isLoading: sessionsLoading } = useSessions(baseUrl);

  // Screencast state
  const { imageData, status, error } = useScreencast(baseUrl, selectedSessionId);

  // Log stream state
  const { logs, clearLogs } = useLogStream(baseUrl, selectedSessionId);

  // Event stream state
  const { events, clearEvents } = useEventStream(baseUrl, selectedSessionId);

  // Agent event stream state (session-agnostic)
  const { events: agentEvents, clearEvents: clearAgentEvents } = useAgentEventStream(baseUrl);

  // Globals state
  const { globals } = useGlobals(baseUrl);

  // Connection status state
  const { status: connectionStatus } = useConnectionStatus(baseUrl);

  // Globals panel state (persisted)
  const [isGlobalsPanelVisible, setIsGlobalsPanelVisible] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("mcp-dashboard-globals-panel-visible");
      return stored !== "false"; // Default to visible
    }
    return true;
  });

  // Bottom panel state (persisted)
  const [isBottomPanelVisible, setIsBottomPanelVisible] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("mcp-dashboard-logs-panel-visible");
      return stored !== "false"; // Default to visible
    }
    return true;
  });

  // Panel collapse state
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("mcp-dashboard-logs-panel-collapsed") === "true";
    }
    return false;
  });

  // Panel visibility state (which panels are shown)
  const [panelVisibility, setPanelVisibility] = useState<PanelVisibility>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(PANEL_VISIBILITY_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as Partial<PanelVisibility>;
          return {
            logs: parsed.logs ?? DEFAULT_PANEL_VISIBILITY.logs,
            events: parsed.events ?? DEFAULT_PANEL_VISIBILITY.events,
            agent: parsed.agent ?? DEFAULT_PANEL_VISIBILITY.agent,
          };
        } catch {
          // Invalid JSON, use defaults
        }
      }
    }
    return DEFAULT_PANEL_VISIBILITY;
  });

  const { panelHeight, resizeHandleProps, isResizing } = useResizablePanel({
    initialHeight: initialPanelHeight,
    minHeight: minPanelHeight,
    storageKey: "mcp-dashboard-logs-panel-height",
    disabled: isPanelCollapsed,
  });

  // Auto-select first session when available
  useEffect(() => {
    const firstSession = sessions[0];
    if (firstSession && !selectedSessionId) {
      setSelectedSessionId(firstSession.id);
    } else if (sessions.length === 0 && selectedSessionId) {
      setSelectedSessionId(null);
    }
  }, [sessions, selectedSessionId]);

  // Save collapsed state
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("mcp-dashboard-logs-panel-collapsed", String(isPanelCollapsed));
    }
  }, [isPanelCollapsed]);

  // Save globals panel visibility
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("mcp-dashboard-globals-panel-visible", String(isGlobalsPanelVisible));
    }
  }, [isGlobalsPanelVisible]);

  // Save bottom panel visibility
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("mcp-dashboard-logs-panel-visible", String(isBottomPanelVisible));
    }
  }, [isBottomPanelVisible]);

  // Save panel visibility state
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(PANEL_VISIBILITY_STORAGE_KEY, JSON.stringify(panelVisibility));
    }
  }, [panelVisibility]);

  const handleSessionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      setSelectedSessionId(value || null);
      clearLogs();
      clearEvents();
    },
    [clearLogs, clearEvents]
  );

  const togglePanel = useCallback(() => {
    setIsPanelCollapsed((prev) => !prev);
  }, []);

  const toggleGlobalsPanel = useCallback(() => {
    setIsGlobalsPanelVisible((prev) => !prev);
  }, []);

  const toggleBottomPanel = useCallback(() => {
    setIsBottomPanelVisible((prev) => !prev);
  }, []);

  const handleTogglePanel = useCallback((panel: keyof PanelVisibility) => {
    setPanelVisibility((prev) => ({
      ...prev,
      [panel]: !prev[panel],
    }));
  }, []);

  const isStreaming = status === "streaming";

  // Inject keyframe animation for streaming border
  const keyframeStyles = useMemo(
    () => `
    @keyframes snakeBorder {
      0% {
        background-position: 0% 50%;
      }
      100% {
        background-position: 200% 50%;
      }
    }
  `,
    []
  );

  useEffect(() => {
    const styleId = "mcp-inspector-keyframes";
    if (!document.getElementById(styleId)) {
      const styleEl = document.createElement("style");
      styleEl.id = styleId;
      styleEl.textContent = keyframeStyles;
      document.head.appendChild(styleEl);
    }
    return () => {
      const existingStyle = document.getElementById(styleId);
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, [keyframeStyles]);

  return (
    <div style={styles.root}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <img src={logoUrl} alt="MCP Agent Inspector" style={styles.logo} />
          <h1 style={styles.title}>MCP Agent Inspector</h1>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.controls}>
            {sessions.length > 0 && (
              <select
                id="session-select"
                style={{
                  ...styles.select,
                  ...(sessions.length === 1 ? styles.selectSingleSession : {}),
                }}
                value={selectedSessionId || ""}
                onChange={handleSessionChange}
                disabled={sessionsLoading || sessions.length <= 1}
              >
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.toolName} ({session.id.slice(0, 8)}...)
                  </option>
                ))}
              </select>
            )}
            <div
              style={{
                ...styles.statusWrapper,
                ...(isStreaming ? styles.statusWrapperStreaming : {}),
              }}
            >
              <div style={styles.statusInner}>
                <span
                  style={{
                    ...styles.statusDot,
                    ...(status === "streaming"
                      ? styles.statusDotStreaming
                      : connectionStatus.connected
                        ? styles.statusDotConnected
                        : styles.statusDotDisconnected),
                  }}
                />
                <span>
                  {status === "streaming"
                    ? "Streaming"
                    : connectionStatus.connected
                      ? "Connected"
                      : "Disconnected"}
                </span>
              </div>
            </div>
          </div>
          <Toolbar
            isLogsPanelVisible={isBottomPanelVisible}
            onToggleLogsPanel={toggleBottomPanel}
            isGlobalsPanelVisible={isGlobalsPanelVisible}
            onToggleGlobalsPanel={toggleGlobalsPanel}
          />
        </div>
      </header>

      {/* Error Banner */}
      {error && <div style={styles.errorBanner}>{error}</div>}

      {/* Content Wrapper */}
      <div style={styles.contentWrapper}>
        {/* Content Row (Main + Globals Panel) */}
        <div style={styles.contentRow}>
          {/* Main Display */}
          <main style={styles.main}>
            <div
              style={{
                ...styles.displayContainer,
                ...(isStreaming ? styles.displayContainerStreaming : {}),
              }}
            >
              {imageData ? (
                <img src={imageData} alt="Live browser view" style={styles.streamImage} />
              ) : (
                <div style={styles.placeholder}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    style={styles.placeholderIcon}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  <h2 style={styles.placeholderTitle}>No Active Widget Session</h2>
                  <p style={styles.placeholderText}>
                    Connect to an MCP server and call a tool that creates a UI session to see live
                    browser content.
                  </p>
                </div>
              )}
            </div>
          </main>

          {/* Globals Panel */}
          <GlobalsPanel globals={globals} isVisible={isGlobalsPanelVisible} />
        </div>

        {/* Resize Handle */}
        <div
          {...resizeHandleProps}
          style={{
            ...styles.resizeHandle,
            ...(isResizing ? styles.resizeHandleActive : {}),
            ...(!isBottomPanelVisible ? styles.resizeHandleHidden : {}),
          }}
        />

        {/* Bottom Panel (Logs + Events + Agent) */}
        <div
          style={{
            ...styles.logsPanel,
            height: isBottomPanelVisible ? (isPanelCollapsed ? 36 : panelHeight) : 0,
            ...(!isBottomPanelVisible ? styles.logsPanelHidden : {}),
          }}
        >
          <BottomPanel
            logs={logs}
            events={events}
            agentEvents={agentEvents}
            onClearLogs={clearLogs}
            onClearEvents={clearEvents}
            onClearAgentEvents={clearAgentEvents}
            panelHeight={panelHeight}
            isCollapsed={isPanelCollapsed}
            onToggleCollapse={togglePanel}
            panelVisibility={panelVisibility}
            onTogglePanel={handleTogglePanel}
          />
        </div>
      </div>
    </div>
  );
}

export default InspectorDashboard;
