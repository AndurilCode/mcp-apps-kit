/**
 * Inspector Dashboard - React Component
 *
 * Real-time browser dashboard for viewing widget sessions.
 * Connects to the inspector backend via SSE for screencast and log streaming.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSessions } from "./hooks/useSessions";
import { useScreencast } from "./hooks/useScreencast";
import { useLogStream, type LogEntry } from "./hooks/useLogStream";
import { useResizablePanel } from "./hooks/useResizablePanel";
import { useGlobals } from "./hooks/useGlobals";
import { Toolbar } from "./components/Toolbar";
import { GlobalsPanel } from "./components/GlobalsPanel";
import { styles } from "./styles";

export interface InspectorDashboardProps {
  /** Base URL for the inspector API (default: current origin) */
  baseUrl?: string;
  /** Initial panel height in pixels (default: 200) */
  initialPanelHeight?: number;
  /** Minimum panel height in pixels (default: 100) */
  minPanelHeight?: number;
}

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

  // Globals state
  const { globals } = useGlobals(baseUrl);

  // Globals panel state (persisted)
  const [isGlobalsPanelVisible, setIsGlobalsPanelVisible] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("mcp-dashboard-globals-panel-visible");
      return stored !== "false"; // Default to visible
    }
    return true;
  });

  // Logs panel state (persisted)
  const [isLogsPanelVisible, setIsLogsPanelVisible] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("mcp-dashboard-logs-panel-visible");
      return stored !== "false"; // Default to visible
    }
    return true;
  });

  // Panel state
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("mcp-dashboard-logs-panel-collapsed") === "true";
    }
    return false;
  });

  const { panelHeight, resizeHandleProps, isResizing } = useResizablePanel({
    initialHeight: initialPanelHeight,
    minHeight: minPanelHeight,
    storageKey: "mcp-dashboard-logs-panel-height",
    disabled: isPanelCollapsed,
  });

  // Refs
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Auto-select first session when available
  useEffect(() => {
    const firstSession = sessions[0];
    if (firstSession && !selectedSessionId) {
      setSelectedSessionId(firstSession.id);
    } else if (sessions.length === 0 && selectedSessionId) {
      setSelectedSessionId(null);
    }
  }, [sessions, selectedSessionId]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

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

  // Save logs panel visibility
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("mcp-dashboard-logs-panel-visible", String(isLogsPanelVisible));
    }
  }, [isLogsPanelVisible]);

  const handleSessionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      setSelectedSessionId(value || null);
      clearLogs();
    },
    [clearLogs]
  );

  const togglePanel = useCallback(() => {
    setIsPanelCollapsed((prev) => !prev);
  }, []);

  const toggleGlobalsPanel = useCallback(() => {
    setIsGlobalsPanelVisible((prev) => !prev);
  }, []);

  const toggleLogsPanel = useCallback(() => {
    setIsLogsPanelVisible((prev) => !prev);
  }, []);

  const isStreaming = status === "streaming";

  return (
    <div style={styles.root}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>MCP Inspector Dashboard</h1>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.controls}>
            <label style={styles.label} htmlFor="session-select">
              Session
            </label>
            <select
              id="session-select"
              style={styles.select}
              value={selectedSessionId || ""}
              onChange={handleSessionChange}
              disabled={sessionsLoading}
            >
              <option value="">Select a session...</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.toolName} ({session.id.slice(0, 8)}...)
                </option>
              ))}
            </select>
            <div style={styles.status}>
              <span
                style={{
                  ...styles.statusDot,
                  ...(status === "streaming"
                    ? styles.statusDotStreaming
                    : status === "connecting"
                      ? styles.statusDotConnected
                      : styles.statusDotDisconnected),
                }}
              />
              <span>
                {status === "streaming"
                  ? "Streaming"
                  : status === "connecting"
                    ? "Connecting..."
                    : "Disconnected"}
              </span>
            </div>
          </div>
          <Toolbar
            isLogsPanelVisible={isLogsPanelVisible}
            onToggleLogsPanel={toggleLogsPanel}
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
            ...(!isLogsPanelVisible ? styles.resizeHandleHidden : {}),
          }}
        />

        {/* Logs Panel */}
        <div
          style={{
            ...styles.logsPanel,
            height: isLogsPanelVisible ? (isPanelCollapsed ? 36 : panelHeight) : 0,
            ...(!isLogsPanelVisible ? styles.logsPanelHidden : {}),
          }}
        >
          <div style={styles.logsHeader}>
            <span style={styles.logsTitle}>Session Logs</span>
            <div style={styles.logsControls}>
              <span style={styles.logCount}>
                {logs.length} log{logs.length !== 1 ? "s" : ""}
              </span>
              <button style={styles.clearLogsBtn} onClick={clearLogs}>
                Clear
              </button>
              <button
                style={{
                  ...styles.toggleLogsBtn,
                  transform: isPanelCollapsed ? "rotate(180deg)" : "none",
                }}
                onClick={togglePanel}
              >
                &#9660;
              </button>
            </div>
          </div>
          {!isPanelCollapsed && (
            <div ref={logsContainerRef} style={styles.logsContainer}>
              {logs.length === 0 ? (
                <div style={styles.logsEmpty}>No logs yet</div>
              ) : (
                logs.map((log, index) => <LogEntryRow key={index} log={log} />)
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LogEntryRow({ log }: { log: LogEntry }): React.ReactElement {
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const h = date.getHours().toString().padStart(2, "0");
    const m = date.getMinutes().toString().padStart(2, "0");
    const s = date.getSeconds().toString().padStart(2, "0");
    const ms = date.getMilliseconds().toString().padStart(3, "0");
    return `${h}:${m}:${s}.${ms}`;
  };

  const levelStyle =
    log.level === "error"
      ? styles.logLevelError
      : log.level === "warn"
        ? styles.logLevelWarn
        : log.level === "info"
          ? styles.logLevelInfo
          : log.level === "debug"
            ? styles.logLevelDebug
            : styles.logLevelLog;

  const badgeStyle =
    log.source === "host"
      ? styles.logBadgeHost
      : log.source === "widget"
        ? styles.logBadgeWidget
        : styles.logBadgeUnknown;

  return (
    <div style={styles.logEntry}>
      <span style={styles.logTime}>{formatTime(log.timestamp)}</span>
      <span style={{ ...styles.logBadge, ...badgeStyle }}>{log.source}</span>
      <span style={{ ...styles.logLevel, ...levelStyle }}>[{log.level}]</span>
      <span style={{ ...styles.logText, ...levelStyle }}>{log.text}</span>
    </div>
  );
}

export default InspectorDashboard;
