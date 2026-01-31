/**
 * Inspector Dashboard - React Component
 *
 * Real-time browser dashboard for viewing widget sessions.
 * Connects to the inspector backend via SSE for screencast, log, and event streaming.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSessions, type SessionInfo } from "./hooks/useSessions";
import { useScreencast } from "./hooks/useScreencast";
import { useLogStream, type LogEntry } from "./hooks/useLogStream";
import { useEventStream } from "./hooks/useEventStream";
import { useAgentEventStream } from "./hooks/useAgentEventStream";
import type { InspectorEvent, AgnosticInspectorEvent } from "../../types";
import { useResizablePanel } from "./hooks/useResizablePanel";
import { useResizablePanelWidth } from "./hooks/useResizablePanelWidth";
import { useGlobals, type GlobalsState } from "./hooks/useGlobals";
import { useConnections } from "./hooks/useConnections";
import { useMcpPrimitives, type McpPrimitives } from "./hooks/useMcpPrimitives";
import { Toolbar } from "./components/Toolbar";
import { ConnectionBar } from "./components/ConnectionBar";
import { TabBar } from "./components/TabBar";
import { GlobalsPanel } from "./components/GlobalsPanel";
import { McpPrimitivesPanel } from "./components/McpPrimitivesPanel";
import { HumanPanel } from "./components/HumanPanel";
import { BottomPanel, type PanelVisibility } from "./components/BottomPanel";
import { ModeToggle } from "./components/ModeToggle";
import { WidgetDisplay } from "./components/WidgetDisplay";
import { AgentTakeoverDialog } from "./components/AgentTakeoverDialog";
import { InspectorModeProvider, useInspectorMode } from "./contexts";
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

interface CachedConnectionState {
  sessions: SessionInfo[];
  events: InspectorEvent[];
  logs: LogEntry[];
  agentEvents: AgnosticInspectorEvent[];
  screencastImage: string | null;
  globals: GlobalsState | null;
  primitives: McpPrimitives | null;
}

// =============================================================================
// Mode-aware sub-components (must be rendered inside InspectorModeProvider)
// =============================================================================

/**
 * Left panel that switches between McpPrimitivesPanel (agent) and HumanPanel (human).
 */
function ModeAwareLeftPanel({
  hasActiveSession,
  tools,
  resources,
  prompts,
  primitivesLoading,
  isLeftPanelCollapsed,
  onToggleCollapse,
  leftPanelWidth,
  leftResizeHandleProps,
  isLeftResizing,
  baseUrl,
  connectionId,
}: {
  hasActiveSession: boolean;
  tools: import("./hooks/useMcpPrimitives").McpTool[];
  resources: import("./hooks/useMcpPrimitives").McpResource[];
  prompts: import("./hooks/useMcpPrimitives").McpPrompt[];
  primitivesLoading: boolean;
  isLeftPanelCollapsed: boolean;
  onToggleCollapse: () => void;
  leftPanelWidth: number;
  leftResizeHandleProps: React.HTMLAttributes<HTMLDivElement>;
  isLeftResizing: boolean;
  baseUrl: string;
  connectionId: string | null;
}): React.ReactElement | null {
  const { mode } = useInspectorMode();

  if (!hasActiveSession) return null;

  if (mode === "human") {
    return (
      <HumanPanel
        tools={tools}
        resources={resources}
        prompts={prompts}
        isLoading={primitivesLoading}
        baseUrl={baseUrl}
        connectionId={connectionId}
      />
    );
  }

  return (
    <McpPrimitivesPanel
      tools={tools}
      resources={resources}
      prompts={prompts}
      isLoading={primitivesLoading}
      isVisible={true}
      isCollapsed={isLeftPanelCollapsed}
      onToggleCollapse={onToggleCollapse}
      position="left"
      panelWidth={leftPanelWidth}
      resizeHandleProps={leftResizeHandleProps}
      isResizing={isLeftResizing}
    />
  );
}

/**
 * Main content area that switches between WidgetDisplay, HumanPanel, or McpPrimitivesPanel.
 */
function ModeAwareMainContent({
  hasActiveSession,
  selectedSessionId,
  baseUrl,
  connectionId,
  isStreaming,
  screencastAspectStyle,
  tools,
  resources,
  prompts,
  primitivesLoading,
}: {
  hasActiveSession: boolean;
  selectedSessionId: string | null;
  baseUrl: string;
  connectionId: string | null;
  isStreaming: boolean;
  screencastAspectStyle: React.CSSProperties;
  tools: import("./hooks/useMcpPrimitives").McpTool[];
  resources: import("./hooks/useMcpPrimitives").McpResource[];
  prompts: import("./hooks/useMcpPrimitives").McpPrompt[];
  primitivesLoading: boolean;
}): React.ReactElement {
  const { mode } = useInspectorMode();

  if (hasActiveSession) {
    return (
      <WidgetDisplay
        baseUrl={baseUrl}
        sessionId={selectedSessionId!}
        connectionId={connectionId}
        screencastAspectStyle={{
          ...styles.displayContainer,
          ...(isStreaming ? styles.displayContainerStreaming : {}),
          ...(isStreaming ? screencastAspectStyle : {}),
        }}
      />
    );
  }

  if (mode === "human") {
    return (
      <HumanPanel
        tools={tools}
        resources={resources}
        prompts={prompts}
        isLoading={primitivesLoading}
        baseUrl={baseUrl}
        connectionId={connectionId}
      />
    );
  }

  return (
    <McpPrimitivesPanel
      tools={tools}
      resources={resources}
      prompts={prompts}
      isLoading={primitivesLoading}
      isVisible={true}
      position="center"
    />
  );
}

// =============================================================================
// Main Dashboard Component
// =============================================================================

export function InspectorDashboard({
  baseUrl = "",
  initialPanelHeight = 200,
  minPanelHeight = 100,
}: InspectorDashboardProps): React.ReactElement {
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

  // Per-connection state cache for instant tab switching
  const connectionCacheRef = useRef<Map<string, CachedConnectionState>>(new Map());
  const prevConnectionIdRef = useRef<string | null>(null);

  // Session state
  const [selectedSessionByConnection, setSelectedSessionByConnection] = useState<
    Record<string, string | null>
  >({});
  const [isConnectionFormOpen, setIsConnectionFormOpen] = useState(false);
  const { sessions, isLoading: sessionsLoading } = useSessions(baseUrl, activeConnectionId);

  const activeConnection = useMemo(
    () => connections.find((connection) => connection.id === activeConnectionId) ?? null,
    [connections, activeConnectionId]
  );

  // Retrieve cached state for the active connection (used as fallback while hooks refetch)
  const cachedState = activeConnectionId
    ? (connectionCacheRef.current.get(activeConnectionId) ?? null)
    : null;

  const selectedSessionId = activeConnectionId
    ? (selectedSessionByConnection[activeConnectionId] ?? null)
    : null;

  // Screencast state
  const { imageData, status, error } = useScreencast(
    baseUrl,
    selectedSessionId,
    activeConnectionId
  );

  // Log stream state
  const { logs, clearLogs } = useLogStream(baseUrl, selectedSessionId, activeConnectionId);

  // Event stream state
  const { events, clearEvents } = useEventStream(baseUrl, selectedSessionId, activeConnectionId);

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

  // Use live data with cache fallback for instant tab switching
  const displaySessions = sessions.length > 0 ? sessions : (cachedState?.sessions ?? []);
  const displayEvents = events.length > 0 ? events : (cachedState?.events ?? []);
  const displayLogs = logs.length > 0 ? logs : (cachedState?.logs ?? []);
  const displayAgentEvents =
    agentEvents.length > 0 ? agentEvents : (cachedState?.agentEvents ?? []);
  const displayGlobals = globals ?? cachedState?.globals ?? null;
  const displayTools = tools.length > 0 ? tools : (cachedState?.primitives?.tools ?? []);
  const displayResources =
    resources.length > 0 ? resources : (cachedState?.primitives?.resources ?? []);
  const displayPrompts = prompts.length > 0 ? prompts : (cachedState?.primitives?.prompts ?? []);

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
    const firstSession = displaySessions[0];
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
    if (displaySessions.length === 0 && currentSelected) {
      setSelectedSessionByConnection((prev) => ({
        ...prev,
        [activeConnectionId]: null,
      }));
      clearLogs();
      clearEvents();
      return;
    }
    if (currentSelected && !displaySessions.some((session) => session.id === currentSelected)) {
      setSelectedSessionByConnection((prev) => ({
        ...prev,
        [activeConnectionId]: firstSession?.id ?? null,
      }));
      clearLogs();
      clearEvents();
    }
  }, [displaySessions, activeConnectionId, selectedSessionByConnection, clearLogs, clearEvents]);

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

  // Save state when switching away from a connection, restore when switching to one
  useEffect(() => {
    const prevId = prevConnectionIdRef.current;

    // Save previous connection's state to cache
    if (prevId) {
      connectionCacheRef.current.set(prevId, {
        sessions,
        events,
        logs,
        agentEvents,
        screencastImage: imageData,
        globals,
        primitives:
          tools.length > 0 || resources.length > 0 || prompts.length > 0
            ? { tools, resources, prompts }
            : null,
      });
    }

    // Clear when switching (hooks will refetch or restore from cache)
    clearLogs();
    clearEvents();
    clearAgentEvents();

    prevConnectionIdRef.current = activeConnectionId;
  }, [activeConnectionId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    async (params: import("@mcp-apps-kit/testing").ConnectionParams): Promise<boolean> => {
      const created = await createConnection(params);
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
      // Clear cached state for this connection
      connectionCacheRef.current.delete(id);
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

  // Compute screencast container aspect ratio from globals viewport
  const screencastAspectStyle = useMemo((): React.CSSProperties => {
    const viewport = displayGlobals?.viewport;
    if (!viewport || !viewport.width || !viewport.height) {
      return {};
    }
    return {
      aspectRatio: `${viewport.width} / ${viewport.height}`,
    };
  }, [displayGlobals?.viewport]);

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

  // Determine if UI session is active (selected session exists — in human mode
  // there may be no screencast data, so we don't require displayImageData)
  const hasActiveSession = !!selectedSessionId;

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
    <InspectorModeProvider baseUrl={baseUrl}>
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
              {displaySessions.length > 0 && (
                <select
                  id="session-select"
                  style={{
                    ...styles.select,
                    ...(displaySessions.length === 1 ? styles.selectSingleSession : {}),
                  }}
                  value={selectedSessionId || ""}
                  onChange={handleSessionChange}
                  disabled={sessionsLoading || displaySessions.length <= 1}
                >
                  {displaySessions.map((session) => (
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
            <ModeToggle />
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
          {/* Left Panel - MCP Primitives (agent) or HumanPanel (human) when session active */}
          <ModeAwareLeftPanel
            hasActiveSession={hasActiveSession}
            tools={displayTools}
            resources={displayResources}
            prompts={displayPrompts}
            primitivesLoading={primitivesLoading}
            isLeftPanelCollapsed={isLeftPanelCollapsed}
            onToggleCollapse={() => setIsLeftPanelCollapsed(!isLeftPanelCollapsed)}
            leftPanelWidth={leftPanelWidth}
            leftResizeHandleProps={leftResizeHandleProps}
            isLeftResizing={isLeftResizing}
            baseUrl={baseUrl}
            connectionId={activeConnectionId}
          />

          {/* Center Column - main content + bottom panel */}
          <div style={styles.centerColumn}>
            {/* Main Display */}
            <main style={styles.main}>
              <ModeAwareMainContent
                hasActiveSession={hasActiveSession}
                selectedSessionId={selectedSessionId}
                baseUrl={baseUrl}
                connectionId={activeConnectionId}
                isStreaming={isStreaming}
                screencastAspectStyle={screencastAspectStyle}
                tools={displayTools}
                resources={displayResources}
                prompts={displayPrompts}
                primitivesLoading={primitivesLoading}
              />
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
                logs={displayLogs}
                events={displayEvents}
                agentEvents={displayAgentEvents}
                onClearLogs={clearLogs}
                onClearEvents={clearEvents}
                onClearAgentEvents={clearAgentEvents}
                panelHeight={panelHeight}
                isCollapsed={isPanelCollapsed}
                onToggleCollapse={togglePanel}
                panelVisibility={panelVisibility}
                onTogglePanel={handleTogglePanel}
                hasActiveSession={hasActiveSession}
              />
            </div>
          </div>

          {/* Globals Panel - full height on the right */}
          <GlobalsPanel globals={displayGlobals} isVisible={isGlobalsPanelVisible} />
        </div>
      </div>
      <AgentTakeoverDialog />
    </InspectorModeProvider>
  );
}

export default InspectorDashboard;
