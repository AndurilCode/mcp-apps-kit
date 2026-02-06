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
import { useResizablePanelWidth } from "./hooks/useResizablePanelWidth";
import { useGlobals, type GlobalsState } from "./hooks/useGlobals";
import { useConnections, type DashboardConnection } from "./hooks/useConnections";
import { useOAuth } from "./hooks/useOAuth";
import { useMcpPrimitives, type McpPrimitives } from "./hooks/useMcpPrimitives";
import type { ConnectionParams } from "@mcp-apps-kit/testing";
import { Toolbar } from "./components/Toolbar";
import { ConnectionBar } from "./components/ConnectionBar";
import { TabBar } from "./components/TabBar";
import { GlobalsPanel } from "./components/GlobalsPanel";
import {
  McpPrimitivesPanel,
  type ServerData,
  type StoppedConnection,
} from "./components/McpPrimitivesPanel";
import { RightPanel } from "./components/RightPanel";
import { NoWidgetPlaceholder, type ConnectionState } from "./components/NoWidgetPlaceholder";
import { OAuthDiscoveryPanel } from "./components/OAuthDiscoveryPanel";
import { styles } from "./styles";
import logoUrl from "../assets/logo.png";

// =============================================================================
// Stopped Connections Storage
// =============================================================================

const STOPPED_CONNECTIONS_KEY = "mcp-dashboard-stopped-connections";

/** Load stopped connections from localStorage */
function loadStoppedConnections(): StoppedConnection[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STOPPED_CONNECTIONS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as StoppedConnection[];
    // Validate shape
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is StoppedConnection =>
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.url === "string" &&
        typeof item.params === "object"
    );
  } catch {
    return [];
  }
}

/** Save stopped connections to localStorage */
function saveStoppedConnections(connections: StoppedConnection[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STOPPED_CONNECTIONS_KEY, JSON.stringify(connections));
  } catch {
    // Ignore storage errors
  }
}

export interface InspectorDashboardProps {
  /** Base URL for the inspector API (default: current origin) */
  baseUrl?: string;
}

interface CachedConnectionState {
  sessions: SessionInfo[];
  events: InspectorEvent[];
  logs: LogEntry[];
  agentEvents: AgnosticInspectorEvent[];
  screencastImage: string | null;
  globals: GlobalsState | null;
  primitives: McpPrimitives | null;
}

/** Per-connection primitives cache for building ServerData */
interface ConnectionPrimitivesCache {
  connectionId: string;
  primitives: McpPrimitives;
}

export function InspectorDashboard({ baseUrl = "" }: InspectorDashboardProps): React.ReactElement {
  // Connection state (includes actions and history)
  const {
    connections,
    activeConnectionId,
    setActiveConnectionId,
    isCreating,
    error: connectionError,
    createConnection,
    reconnectConnection,
    closeConnection,
    getMatchingEntries,
    authDiscovery,
    clearAuthDiscovery,
  } = useConnections(baseUrl);

  // Per-connection state cache for instant tab switching
  const connectionCacheRef = useRef<Map<string, CachedConnectionState>>(new Map());
  const prevConnectionIdRef = useRef<string | null>(null);

  // Stopped connections state (persisted to localStorage)
  const [stoppedConnections, setStoppedConnections] = useState<StoppedConnection[]>(() =>
    loadStoppedConnections()
  );

  // Per-connection primitives cache (for building ServerData for all connections)
  const primitivesPerConnectionRef = useRef<Map<string, McpPrimitives>>(new Map());

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

  // Testing status — activates when new agent events arrive, 60s idle timer
  const [isTesting, setIsTesting] = useState(false);
  const prevAgentEventsLengthRef = useRef(0);
  const testingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset testing state when connection changes
  useEffect(() => {
    setIsTesting(false);
    prevAgentEventsLengthRef.current = 0;
    if (testingTimerRef.current) {
      clearTimeout(testingTimerRef.current);
      testingTimerRef.current = null;
    }
  }, [activeConnectionId]);

  // Watch agentEvents length for testing status activation
  useEffect(() => {
    const prevLen = prevAgentEventsLengthRef.current;
    const curLen = agentEvents.length;
    prevAgentEventsLengthRef.current = curLen;

    if (curLen > prevLen && curLen > 0) {
      // New agent events received — activate testing status
      setIsTesting(true);

      // Reset the 60-second idle timer
      if (testingTimerRef.current) {
        clearTimeout(testingTimerRef.current);
      }
      testingTimerRef.current = setTimeout(() => {
        setIsTesting(false);
        testingTimerRef.current = null;
      }, 60_000);
    }
  }, [agentEvents.length]);

  // Cleanup testing timer on unmount
  useEffect(() => {
    return () => {
      if (testingTimerRef.current) {
        clearTimeout(testingTimerRef.current);
      }
    };
  }, []);

  // OAuth state (connection-scoped, polls status)
  const oauth = useOAuth(baseUrl, activeConnectionId);

  // Sync discovery results from connection creation into OAuth hook
  useEffect(() => {
    if (authDiscovery) {
      oauth.setDiscoveryResults(authDiscovery);
    }
  }, [authDiscovery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-reconnect when OAuth status becomes "authenticated" during active discovery.
  // Only fires when authDiscovery is set (modal is showing), NOT on tab switches.
  const prevOAuthStatus = useRef<string | null>(null);
  useEffect(() => {
    const currentStatus = oauth.oauthState?.status ?? null;
    const wasNotAuthenticated = prevOAuthStatus.current !== "authenticated";
    prevOAuthStatus.current = currentStatus;

    // Guard: only reconnect during active discovery flow (modal open)
    if (
      currentStatus === "authenticated" &&
      wasNotAuthenticated &&
      activeConnectionId &&
      authDiscovery
    ) {
      void reconnectConnection(activeConnectionId).then((connected) => {
        if (connected) {
          clearAuthDiscovery();
          setIsConnectionFormOpen(false);
        }
      });
    }
  }, [
    oauth.oauthState?.status,
    activeConnectionId,
    authDiscovery,
    reconnectConnection,
    clearAuthDiscovery,
  ]);

  // Use live data with cache fallback for instant tab switching
  const displaySessions = sessions.length > 0 ? sessions : (cachedState?.sessions ?? []);
  const displayEvents = events.length > 0 ? events : (cachedState?.events ?? []);
  const displayLogs = logs.length > 0 ? logs : (cachedState?.logs ?? []);
  const displayAgentEvents =
    agentEvents.length > 0 ? agentEvents : (cachedState?.agentEvents ?? []);
  const displayImageData = imageData ?? cachedState?.screencastImage ?? null;
  const displayGlobals = globals ?? cachedState?.globals ?? null;
  const displayTools = tools.length > 0 ? tools : (cachedState?.primitives?.tools ?? []);
  const displayResources =
    resources.length > 0 ? resources : (cachedState?.primitives?.resources ?? []);
  const displayPrompts = prompts.length > 0 ? prompts : (cachedState?.primitives?.prompts ?? []);

  // Update primitives cache for the active connection
  useEffect(() => {
    if (activeConnectionId && (tools.length > 0 || resources.length > 0 || prompts.length > 0)) {
      primitivesPerConnectionRef.current.set(activeConnectionId, { tools, resources, prompts });
    }
  }, [activeConnectionId, tools, resources, prompts]);

  // Persist stopped connections to localStorage
  useEffect(() => {
    saveStoppedConnections(stoppedConnections);
  }, [stoppedConnections]);

  // Build ServerData array from active connections + primitives cache
  const serverDataList: ServerData[] = useMemo(() => {
    return connections
      .filter((conn) => conn.status === "connected")
      .map((conn) => {
        const cached = primitivesPerConnectionRef.current.get(conn.id);
        // For active connection, use live data; for others, use cache
        const prims =
          conn.id === activeConnectionId
            ? { tools: displayTools, resources: displayResources, prompts: displayPrompts }
            : (cached ?? { tools: [], resources: [], prompts: [] });
        return {
          id: conn.id,
          name: conn.serverInfo?.name ?? conn.url,
          url: conn.url,
          isConnected: true,
          tools: prims.tools,
          resources: prims.resources,
          prompts: prims.prompts,
        };
      });
  }, [connections, activeConnectionId, displayTools, displayResources, displayPrompts]);

  // Compute connection state for NoWidgetPlaceholder
  const connectionState: ConnectionState = useMemo(() => {
    // No server connected
    if (!activeConnection || connections.length === 0) {
      return "no-server";
    }
    // Server connected - check for agent-initialize event
    if (activeConnection.status === "connected") {
      const hasAgentInit = displayAgentEvents.some((e) => e.type === "agent-initialize");
      return hasAgentInit ? "agent-connected" : "server-connected";
    }
    // Connecting or error state - treat as no server
    return "no-server";
  }, [activeConnection, connections.length, displayAgentEvents]);

  // Extract client name from agent-initialize event
  const agentClientName = useMemo(() => {
    const initEvent = displayAgentEvents.find((e) => e.type === "agent-initialize");
    return (initEvent?.payload as { clientName?: string } | undefined)?.clientName;
  }, [displayAgentEvents]);

  // Handler to open connection form
  const handleConnect = useCallback(() => {
    setIsConnectionFormOpen(true);
  }, []);

  // Left panel state (MCP primitives)
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);

  // Right panel state (persisted)
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("mcp-dashboard-right-panel-collapsed") === "true";
      } catch {
        return false;
      }
    }
    return false;
  });

  // Globals bar state (persisted)
  const [isGlobalsBarCollapsed, setIsGlobalsBarCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("mcp-dashboard-globals-bar-collapsed") === "true";
      } catch {
        return false;
      }
    }
    return false;
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

  // Right panel width resize
  const {
    panelWidth: rightPanelWidth,
    resizeHandleProps: rightResizeHandleProps,
    isResizing: isRightResizing,
  } = useResizablePanelWidth({
    initialWidth: 320,
    minWidth: 240,
    maxWidth: 520,
    storageKey: "mcp-dashboard-right-panel-width",
    disabled: isRightPanelCollapsed,
    resizeDirection: "right",
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

  // Save right panel collapsed state
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("mcp-dashboard-right-panel-collapsed", String(isRightPanelCollapsed));
      } catch {
        // ignore storage access errors
      }
    }
  }, [isRightPanelCollapsed]);

  // Save globals bar collapsed state
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("mcp-dashboard-globals-bar-collapsed", String(isGlobalsBarCollapsed));
      } catch {
        // ignore storage access errors
      }
    }
  }, [isGlobalsBarCollapsed]);

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

  const toggleRightPanel = useCallback(() => {
    setIsRightPanelCollapsed((prev) => !prev);
  }, []);

  const toggleGlobalsBar = useCallback(() => {
    setIsGlobalsBarCollapsed((prev) => !prev);
  }, []);

  const handleCreateConnection = useCallback(
    async (params: import("@mcp-apps-kit/testing").ConnectionParams): Promise<boolean> => {
      const conn = await createConnection(params);
      if (conn) {
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

  // Handler to stop a server (disconnect but keep in stopped list)
  const handleStopServer = useCallback(
    async (serverId: string) => {
      const conn = connections.find((c) => c.id === serverId);
      if (!conn) return;

      // Build connection params from what we know
      // For HTTP connections, we can reconstruct params from the URL
      const params: ConnectionParams = { transport: "http", url: conn.url };

      // Add to stopped connections
      const stoppedConn: StoppedConnection = {
        id: serverId,
        name: conn.serverInfo?.name ?? conn.url,
        url: conn.url,
        params,
      };

      setStoppedConnections((prev) => {
        // Don't duplicate
        if (prev.some((s) => s.id === serverId)) return prev;
        return [...prev, stoppedConn];
      });

      // Close the connection
      await handleCloseConnection(serverId);
    },
    [connections, handleCloseConnection]
  );

  // Handler to start a stopped server (reconnect using stored params)
  const handleStartServer = useCallback(
    async (stoppedConn: StoppedConnection) => {
      // Remove from stopped list first
      setStoppedConnections((prev) => prev.filter((s) => s.id !== stoppedConn.id));

      // Reconnect using stored params
      await handleCreateConnection(stoppedConn.params);
    },
    [handleCreateConnection]
  );

  const tabs = useMemo(
    () =>
      connections.map((connection) => ({
        id: connection.id,
        url: connection.url,
        serverInfo: connection.serverInfo,
        status: connection.status,
        isOAuth: connection.isOAuth,
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
  const isTestingActive = isTesting && activeConnection?.status === "connected";
  const connectionStatusLabel = activeConnection
    ? activeConnection.status === "connected"
      ? "Connected"
      : activeConnection.status === "connecting"
        ? "Connecting"
        : activeConnection.status === "error"
          ? "Error"
          : "Disconnected"
    : "Disconnected";

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
          <h1 style={styles.title}>sirius-mcp inspector</h1>
        </div>

        {/* Connection Bar */}
        <ConnectionBar
          isOpen={isConnectionFormOpen}
          isCreating={isCreating}
          error={connectionError}
          onCreateConnection={handleCreateConnection}
          onClose={() => setIsConnectionFormOpen(false)}
          getMatchingEntries={getMatchingEntries}
          oauth={activeConnectionId ? oauth : undefined}
          authDiscovery={authDiscovery}
          onDismissDiscovery={clearAuthDiscovery}
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
                ...(isStreaming && !isTestingActive ? styles.statusWrapperStreaming : {}),
              }}
            >
              <div style={styles.statusInner}>
                <span
                  style={{
                    ...styles.statusDot,
                    ...(isTestingActive
                      ? styles.statusDotTesting
                      : status === "streaming"
                        ? styles.statusDotStreaming
                        : activeConnection?.status === "connected"
                          ? styles.statusDotConnected
                          : styles.statusDotDisconnected),
                  }}
                />
                <span>
                  {isTestingActive
                    ? "Testing"
                    : status === "streaming"
                      ? "Streaming"
                      : connectionStatusLabel}
                </span>
              </div>
            </div>
          </div>
          <Toolbar
            isPrimitivesPanelVisible={!isLeftPanelCollapsed}
            onTogglePrimitivesPanel={() => setIsLeftPanelCollapsed(!isLeftPanelCollapsed)}
            isRightPanelVisible={!isRightPanelCollapsed}
            onToggleRightPanel={toggleRightPanel}
            oauth={activeConnectionId ? oauth : undefined}
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
        {/* Left Panel - MCP Primitives as Server Blocks */}
        <McpPrimitivesPanel
          servers={serverDataList}
          stoppedConnections={stoppedConnections}
          isLoading={primitivesLoading}
          isVisible={true}
          isCollapsed={isLeftPanelCollapsed}
          onToggleCollapse={() => setIsLeftPanelCollapsed(!isLeftPanelCollapsed)}
          panelWidth={leftPanelWidth}
          resizeHandleProps={leftResizeHandleProps}
          isResizing={isLeftResizing}
          onStopServer={handleStopServer}
          onStartServer={handleStartServer}
          onAddServer={handleConnect}
        />

        {/* Center Column - screencast + globals bar */}
        <div style={styles.centerColumn}>
          <main style={styles.main}>
            {isStreaming ? (
              /* Screencast when streaming */
              <div
                style={{
                  ...styles.displayContainer,
                  ...styles.displayContainerStreaming,
                  ...screencastAspectStyle,
                }}
              >
                <img
                  src={displayImageData ?? ""}
                  alt="Live browser view"
                  style={styles.streamImage}
                />
                {isGlobalsBarCollapsed && (
                  <button
                    style={styles.globalsCollapsedToggle}
                    onClick={toggleGlobalsBar}
                    aria-label="Show Globals"
                    title="Show Globals"
                  >
                    Show Globals
                  </button>
                )}
              </div>
            ) : (
              /* Tamagotchi placeholder when no widget */
              <NoWidgetPlaceholder
                connectionState={connectionState}
                clientName={agentClientName}
                onConnect={handleConnect}
              />
            )}
          </main>

          {/* Globals bar - below screencast, only when streaming */}
          {isStreaming && (
            <GlobalsPanel
              globals={displayGlobals}
              isVisible={true}
              isCollapsed={isGlobalsBarCollapsed}
              onToggleCollapse={toggleGlobalsBar}
            />
          )}
        </div>

        {/* Right Panel - Agent/Events/Logs tabs */}
        <RightPanel
          logs={displayLogs}
          events={displayEvents}
          agentEvents={displayAgentEvents}
          onClearLogs={clearLogs}
          onClearEvents={clearEvents}
          onClearAgent={clearAgentEvents}
          isCollapsed={isRightPanelCollapsed}
          onToggleCollapse={toggleRightPanel}
          panelWidth={rightPanelWidth}
          resizeHandleProps={rightResizeHandleProps}
          isResizing={isRightResizing}
          isStreaming={isStreaming}
        />
      </div>

      {/* OAuth Discovery Modal Overlay */}
      {authDiscovery && oauth && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={(e) => {
            // Close on backdrop click
            if (e.target === e.currentTarget) {
              clearAuthDiscovery();
              setIsConnectionFormOpen(false);
            }
          }}
        >
          <OAuthDiscoveryPanel
            discovery={authDiscovery}
            isDiscovering={oauth.isDiscovering}
            error={oauth.error}
            isConfiguring={oauth.isLoading}
            onConfigure={async (params) => {
              const url = await oauth.configureFromDiscovery(params);
              // If no auth URL (tokens already exist), reconnect immediately
              // instead of waiting for the 3s status poll cycle
              if (!url && activeConnectionId) {
                void reconnectConnection(activeConnectionId).then((connected) => {
                  if (connected) {
                    clearAuthDiscovery();
                    setIsConnectionFormOpen(false);
                  }
                });
              }
              return url;
            }}
            onDismiss={() => {
              clearAuthDiscovery();
              setIsConnectionFormOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

export default InspectorDashboard;
