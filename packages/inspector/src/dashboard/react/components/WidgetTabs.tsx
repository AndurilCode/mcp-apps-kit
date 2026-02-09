/**
 * WidgetTabs Component
 *
 * Renders a tab bar for multiple concurrent widget sessions, each displayed
 * in an iframe. Active tab's iframe is visible; others use display:none for
 * instant switching without reloading.
 */

import React, { useState, useEffect } from "react";
import type { SessionEntry } from "../hooks/useSessionStream";

export interface WidgetTabsProps {
  /** Active sessions from useSessionStream */
  sessions: SessionEntry[];
}

const tabBarStyle: React.CSSProperties = {
  display: "flex",
  gap: "2px",
  padding: "4px 8px",
  backgroundColor: "#1e1f1f",
  borderBottom: "1px solid #333",
  overflowX: "auto",
  flexShrink: 0,
};

const tabStyle: React.CSSProperties = {
  padding: "6px 16px",
  fontSize: "12px",
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  cursor: "pointer",
  border: "1px solid transparent",
  borderBottom: "none",
  borderRadius: "4px 4px 0 0",
  backgroundColor: "#2a2b2b",
  color: "#999",
  whiteSpace: "nowrap",
  transition: "background-color 0.15s, color 0.15s",
};

const tabActiveStyle: React.CSSProperties = {
  ...tabStyle,
  backgroundColor: "#333",
  color: "#e8e8e8",
  borderColor: "#444",
};

const iframeContainerStyle: React.CSSProperties = {
  flex: 1,
  position: "relative",
  overflow: "hidden",
};

const iframeStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  border: "none",
  position: "absolute",
  top: 0,
  left: 0,
};

const placeholderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flex: 1,
  color: "#666",
  fontSize: "14px",
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
};

export function WidgetTabs({ sessions }: WidgetTabsProps): React.ReactElement {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Auto-select first session or keep current selection valid
  useEffect(() => {
    if (sessions.length === 0) {
      setActiveSessionId(null);
      return;
    }
    // If current selection is gone, select first
    if (!activeSessionId || !sessions.some((s) => s.sessionId === activeSessionId)) {
      setActiveSessionId(sessions[0]?.sessionId ?? null);
    }
  }, [sessions, activeSessionId]);

  if (sessions.length === 0) {
    return <div style={placeholderStyle}>No active widget sessions</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Tab bar (only show if multiple sessions) */}
      {sessions.length > 1 && (
        <div style={tabBarStyle}>
          {sessions.map((session) => (
            <button
              key={session.sessionId}
              style={session.sessionId === activeSessionId ? tabActiveStyle : tabStyle}
              onClick={() => setActiveSessionId(session.sessionId)}
              title={session.sessionId}
            >
              {session.sessionId.slice(0, 8)}…
            </button>
          ))}
        </div>
      )}

      {/* Iframe container — all iframes rendered, only active is visible */}
      <div style={iframeContainerStyle}>
        {sessions.map((session) => (
          <iframe
            key={session.sessionId}
            data-session={session.sessionId}
            src={session.hostUrl}
            style={{
              ...iframeStyle,
              display: session.sessionId === activeSessionId ? "block" : "none",
            }}
            title={`Widget session ${session.sessionId.slice(0, 8)}`}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ))}
      </div>
    </div>
  );
}
