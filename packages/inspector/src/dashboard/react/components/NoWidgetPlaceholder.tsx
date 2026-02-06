/**
 * NoWidgetPlaceholder Component
 *
 * Stepped tutorial placeholder with 3-state UI:
 * 1. No server connected - prompts to connect server
 * 2. Server connected, no agent - prompts to connect agent
 * 3. Agent connected - shows ready state with client name
 */

import React from "react";
import type { CSSProperties } from "react";
import { styles } from "../styles";
import starUrl from "../../assets/sirius-star.png";

/** Connection state for the placeholder UI */
export type ConnectionState = "no-server" | "server-connected" | "agent-connected";

export interface NoWidgetPlaceholderProps {
  /** Current connection state */
  connectionState: ConnectionState;
  /** Name of connected agent client (only set when agent-connected) */
  clientName?: string;
  /** Callback when user clicks Connect Server button */
  onConnect: () => void;
}

/** Local styles for the stepped tutorial layout */
const localStyles: Record<string, CSSProperties> = {
  tagline: {
    color: "#6b7280",
    fontSize: "0.8125rem",
    textAlign: "center",
    margin: 0,
    letterSpacing: "0.01em",
  },
  heading: {
    color: "#e8e8e8",
    fontSize: "1.125rem",
    fontWeight: 500,
    textAlign: "center",
    margin: 0,
    letterSpacing: "-0.01em",
  },
  subtext: {
    color: "#6b7280",
    fontSize: "0.875rem",
    textAlign: "center",
    margin: 0,
    lineHeight: 1.5,
  },
  clientName: {
    color: "#e8e8e8",
    fontWeight: 600,
  },
  connectButton: {
    backgroundColor: "#ffffff",
    color: "#000000",
    border: "none",
    borderRadius: "8px",
    padding: "0.625rem 1.25rem",
    fontSize: "0.875rem",
    fontWeight: 500,
    fontFamily: "inherit",
    cursor: "pointer",
    transition: "opacity 0.15s ease, transform 0.15s ease",
  },
  stateContent: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "0.75rem",
    marginTop: "0.5rem",
  },
};

export function NoWidgetPlaceholder({
  connectionState,
  clientName,
  onConnect,
}: NoWidgetPlaceholderProps): React.ReactElement {
  return (
    <div style={styles.noWidgetWrapper}>
      {/* Star logo */}
      <img src={starUrl} alt="Sirius the star" width={90} height={90} style={styles.noWidgetStar} />

      {/* Tagline - always shown */}
      <p style={localStyles.tagline}>Debug MCP servers alongside your Agent</p>

      {/* State-specific content */}
      <div style={localStyles.stateContent}>
        {connectionState === "no-server" && (
          <>
            <h2 style={localStyles.heading}>Connect the server you want to inspect</h2>
            <button
              type="button"
              style={localStyles.connectButton}
              onClick={onConnect}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "0.9";
                e.currentTarget.style.transform = "scale(1.02)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "1";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              Connect Server
            </button>
          </>
        )}

        {connectionState === "server-connected" && (
          <>
            <h2 style={localStyles.heading}>Connect your Agent to this MCP Server</h2>
            <p style={localStyles.subtext}>
              The inspector will capture all tool calls and responses
            </p>
          </>
        )}

        {connectionState === "agent-connected" && (
          <>
            <h2 style={localStyles.heading}>Ready to Test</h2>
            <p style={localStyles.subtext}>
              with <span style={localStyles.clientName}>{clientName ?? "Agent"}</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default NoWidgetPlaceholder;
