/**
 * AgentTakeoverDialog Component
 *
 * Full-screen modal overlay that appears when an agent requests to take over
 * the Inspector from Human mode. The user can Allow or Deny the request.
 *
 * Reads `takeoverRequest` and `respondToTakeover` from InspectorModeContext
 * internally — no props needed. Renders nothing when there is no pending request.
 */

import React, { useCallback } from "react";
import { useInspectorMode } from "../contexts";

const localStyles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10000,
  },
  card: {
    backgroundColor: "#1e2020",
    border: "1px solid #3a3d3d",
    borderRadius: 12,
    padding: "28px 32px",
    minWidth: 380,
    maxWidth: 480,
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
    color: "#e8e8e8",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  title: {
    margin: "0 0 16px 0",
    fontSize: 18,
    fontWeight: 600,
    color: "#f0f0f0",
  },
  reason: {
    margin: "0 0 8px 0",
    fontSize: 14,
    lineHeight: 1.5,
    color: "#c0c0c0",
  },
  timestamp: {
    margin: "0 0 24px 0",
    fontSize: 12,
    color: "#808080",
  },
  buttonRow: {
    display: "flex",
    gap: 12,
    justifyContent: "flex-end",
  },
  btnBase: {
    padding: "8px 20px",
    fontSize: 14,
    fontWeight: 500,
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    transition: "opacity 0.15s",
  },
  btnAllow: {
    backgroundColor: "#20b2aa",
    color: "#fff",
  },
  btnDeny: {
    backgroundColor: "#3a3d3d",
    color: "#e0e0e0",
  },
};

export function AgentTakeoverDialog(): React.ReactElement | null {
  const { takeoverRequest, respondToTakeover } = useInspectorMode();

  const handleAllow = useCallback(() => {
    respondToTakeover(true);
  }, [respondToTakeover]);

  const handleDeny = useCallback(() => {
    respondToTakeover(false);
  }, [respondToTakeover]);

  if (!takeoverRequest) {
    return null;
  }

  const timeStr = new Date(takeoverRequest.timestamp).toLocaleTimeString();

  return (
    <div style={localStyles.backdrop}>
      <div style={localStyles.card}>
        <h2 style={localStyles.title}>🤖 Agent wants control</h2>
        {takeoverRequest.reason && <p style={localStyles.reason}>{takeoverRequest.reason}</p>}
        <p style={localStyles.timestamp}>Requested at {timeStr}</p>
        <div style={localStyles.buttonRow}>
          <button style={{ ...localStyles.btnBase, ...localStyles.btnDeny }} onClick={handleDeny}>
            Deny
          </button>
          <button style={{ ...localStyles.btnBase, ...localStyles.btnAllow }} onClick={handleAllow}>
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}

export default AgentTakeoverDialog;
