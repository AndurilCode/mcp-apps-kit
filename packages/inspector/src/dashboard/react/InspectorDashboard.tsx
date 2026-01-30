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
import { useResizablePanelWidth } from "./hooks/useResizablePanelWidth";
import { useGlobals } from "./hooks/useGlobals";
import { useConnections } from "./hooks/useConnections";
import { useMcpPrimitives } from "./hooks/useMcpPrimitives";
import { Toolbar } from "./components/Toolbar";
import { ConnectionBar } from "./components/ConnectionBar";
import { TabBar } from "./components/TabBar";
import { GlobalsPanel } from "./components/GlobalsPanel";
import { McpPrimitivesPanel } from "./components/McpPrimitivesPanel";
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
  const [selectedSessionByConnection, setSelectedSessionByConnection] = useState<
    Record<string, string | null>
  >({});
  const [isConnectionFormOpen, setIsConnectionFormOpen] = useState(false);
  const { sessions, isLoading: sessionsLoading } = useSessions(baseUrl);

  // Connection state (includes actions and history)
  const {
    connections,
    activeConnectionId,
    setActiveConnectionId,
    isCreating,
    error: connectionError,
    createConnection,
    closeConnection,
    getMatchingEntries,
  } = useConnections(baseUrl);

  const activeConnection = useMemo(
    () => connections.find((connection) => connection.id === activeConnectionId) ?? null,
    [connections, activeConnectionId]
  );

  const selectedSessionId = activeConnectionId
    ? (selectedSessionByConnection[activeConnectionId] ?? null)
    : null;

  // Screencast state
  const { imageData, status, error } = useScreencast(baseUrl, selectedSessionId);

  // Log stream state
  const { logs, clearLogs } = useLogStream(baseUrl, selectedSessionId);

  // Event stream state
  const { events, clearEvents } = useEventStream(baseUrl, selectedSessionId);

  // Agent event stream state (connection-scoped)
  const { events: agentEvents, clearEvents: clearAgentEvents } = useAgentEventStream(
    baseUrl,
    activeConnectionId
  );

  // Globals state (connection-scoped)
  const { globals } = useGlobals(baseUrl, activeConnectionId);

  // MCP Primitives state (connection-scoped, refreshes on connection)
  const {
    tools,
    resources,
    prompts,
    isLoading: primitivesLoading,
  } = useMcpPrimitives(baseUrl, activeConnection?.status === "connected", activeConnectionId);

  // Left panel state (for MCP primitives when session is active)
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);

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

  // Left panel (MCP primitives) width resize
  const {
    panelWidth: leftPanelWidth,
    resizeHandleProps: leftResizeHandleProps,
    isResizing: isLeftResizing,
  } = useResizablePanelWidth({
    initialWidth: 320,
    minWidth: 200,
    maxWidth: 600,
    storageKey: "mcp-dashboard-primitives-panel-width",
    disabled: isLeftPanelCollapsed,
  });

  // Auto-select first session when available
  useEffect(() => {
    const firstSession = sessions[0];
    if (!activeConnectionId) {
      return;
    }
    const currentSelected = selectedSessionByConnection[activeConnectionId] ?? null;
    if (firstSession && !currentSelected) {
      setSelectedSessionByConnection((prev) => ({
        ...prev,
        [activeConnectionId]: firstSession.id,
      }));
      clearLogs();
      clearEvents();
      return;
    }
    if (sessions.length === 0 && currentSelected) {
      setSelectedSessionByConnection((prev) => ({
        ...prev,
        [activeConnectionId]: null,
      }));
      clearLogs();
      clearEvents();
      return;
    }
    if (currentSelected && !sessions.some((session) => session.id === currentSelected)) {
      setSelectedSessionByConnection((prev) => ({
        ...prev,
        [activeConnectionId]: firstSession?.id ?? null,
      }));
      clearLogs();
      clearEvents();
    }
  }, [sessions, activeConnectionId, selectedSessionByConnection, clearLogs, clearEvents]);

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
      if (!activeConnectionId) {
        return;
      }
      setSelectedSessionByConnection((prev) => ({
        ...prev,
        [activeConnectionId]: value || null,
      }));
      clearLogs();
      clearEvents();
    },
    [activeConnectionId, clearLogs, clearEvents]
  );

  useEffect(() => {
    clearLogs();
    clearEvents();
  }, [activeConnectionId, clearLogs, clearEvents]);

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

  const handleCreateConnection = useCallback(
    async (url: string): Promise<boolean> => {
      const created = await createConnection(url);
      if (created) {
        setIsConnectionFormOpen(false);
        return true;
      }
      return false;
    },
    [createConnection]
  );

  const handleCloseConnection = useCallback(
    async (id: string): Promise<void> => {
      const closed = await closeConnection(id);
      if (!closed) {
        return;
      }
      setSelectedSessionByConnection((prev) => {
        if (!(id in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [closeConnection]
  );

  const tabs = useMemo(
    () =>
      connections.map((connection) => ({
        id: connection.id,
        url: connection.url,
        serverInfo: connection.serverInfo,
        status: connection.status,
      })),
    [connections]
  );

  const isStreaming = status === "streaming";
  const connectionStatusLabel = activeConnection
    ? activeConnection.status === "connected"
      ? "Connected"
      : activeConnection.status === "connecting"
        ? "Connecting"
        : activeConnection.status === "error"
          ? "Error"
          : "Disconnected"
    : "Disconnected";

  // Determine if UI session is active (has screencast)
  const hasActiveSession = !!selectedSessionId && !!imageData;

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

        {/* Connection Bar */}
        <ConnectionBar
          isOpen={isConnectionFormOpen}
          isCreating={isCreating}
          error={connectionError}
          onCreateConnection={handleCreateConnection}
          onClose={() => setIsConnectionFormOpen(false)}
          getMatchingEntries={getMatchingEntries}
        />

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
                      : activeConnection?.status === "connected"
                        ? styles.statusDotConnected
                        : styles.statusDotDisconnected),
                  }}
                />
                <span>{status === "streaming" ? "Streaming" : connectionStatusLabel}</span>
              </div>
            </div>
          </div>
          <Toolbar
            isLogsPanelVisible={isBottomPanelVisible}
            onToggleLogsPanel={toggleBottomPanel}
            isGlobalsPanelVisible={isGlobalsPanelVisible}
            onToggleGlobalsPanel={toggleGlobalsPanel}
            isPrimitivesPanelVisible={!isLeftPanelCollapsed}
            onTogglePrimitivesPanel={() => setIsLeftPanelCollapsed(!isLeftPanelCollapsed)}
            hasActiveSession={hasActiveSession}
          />
        </div>
      </header>

      <TabBar
        tabs={tabs}
        activeTabId={activeConnectionId}
        onSelect={(id) => setActiveConnectionId(id)}
        onClose={(id) => void handleCloseConnection(id)}
        onAdd={() => setIsConnectionFormOpen(true)}
      />

      {/* Error Banner */}
      {error && <div style={styles.errorBanner}>{error}</div>}

      {/* Content Wrapper - horizontal layout */}
      <div style={styles.contentWrapper}>
        {/* Left Panel - MCP Primitives when session active */}
        {hasActiveSession && (
          <McpPrimitivesPanel
            tools={tools}
            resources={resources}
            prompts={prompts}
            isLoading={primitivesLoading}
            isVisible={true}
            isCollapsed={isLeftPanelCollapsed}
            onToggleCollapse={() => setIsLeftPanelCollapsed(!isLeftPanelCollapsed)}
            position="left"
            panelWidth={leftPanelWidth}
            resizeHandleProps={leftResizeHandleProps}
            isResizing={isLeftResizing}
          />
        )}

        {/* Center Column - main content + bottom panel */}
        <div style={styles.centerColumn}>
          {/* Main Display */}
          <main style={styles.main}>
            {hasActiveSession ? (
              /* Screencast when session is active */
              <div
                style={{
                  ...styles.displayContainer,
                  ...(isStreaming ? styles.displayContainerStreaming : {}),
                }}
              >
                <img src={imageData} alt="Live browser view" style={styles.streamImage} />
              </div>
            ) : (
              /* MCP Primitives in center when no session */
              <McpPrimitivesPanel
                tools={tools}
                resources={resources}
                prompts={prompts}
                isLoading={primitivesLoading}
                isVisible={true}
                position="center"
              />
            )}
          </main>

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

        {/* Globals Panel - full height on the right */}
        <GlobalsPanel globals={globals} isVisible={isGlobalsPanelVisible} />
      </div>
    </div>
  );
}

export default InspectorDashboard;
