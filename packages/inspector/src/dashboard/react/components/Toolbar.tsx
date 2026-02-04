/**
 * Toolbar Component
 *
 * Icon buttons for toggling dashboard panels (primitives, right panel).
 * Includes per-connection OAuth status indicator.
 */

import React from "react";
import { styles } from "../styles";
import type { OAuthStatus } from "../../../oauth/types";

export interface ToolbarProps {
  /** Whether the MCP primitives panel is visible */
  isPrimitivesPanelVisible: boolean;
  /** Callback to toggle primitives panel */
  onTogglePrimitivesPanel: () => void;
  /** Whether the right panel is visible */
  isRightPanelVisible: boolean;
  /** Callback to toggle right panel */
  onToggleRightPanel: () => void;
  /** Current OAuth status for the active connection */
  oauthStatus?: OAuthStatus;
}

/** Primitives panel icon - left sidebar panel (tools/resources/prompts) */
function PrimitivesIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="12" height="12" rx="2" />
      <line x1="6" y1="2" x2="6" y2="14" />
    </svg>
  );
}

// OAuth status badge styles
const oauthBadgeStyles: Record<string, React.CSSProperties> = {
  badge: {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.25rem 0.5rem",
    borderRadius: "6px",
    fontSize: "0.625rem",
    fontWeight: 600,
    letterSpacing: "0.02em",
    border: "1px solid",
    cursor: "default",
  },
  unauthenticated: {
    backgroundColor: "rgba(107, 114, 128, 0.1)",
    borderColor: "#3d4040",
    color: "#6b7280",
  },
  authenticating: {
    backgroundColor: "rgba(255, 152, 0, 0.1)",
    borderColor: "rgba(255, 152, 0, 0.3)",
    color: "#ff9800",
  },
  authenticated: {
    backgroundColor: "rgba(32, 178, 170, 0.1)",
    borderColor: "rgba(32, 178, 170, 0.3)",
    color: "#20b2aa",
  },
  error: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.3)",
    color: "#ef4444",
  },
};

/** OAuth status indicator icon + label */
function OAuthBadge({ status }: { status: OAuthStatus }): React.ReactElement {
  const icon = status === "authenticated" ? "🔒" : status === "authenticating" ? "🔄" : "🔓";
  const label =
    status === "authenticated"
      ? "Auth"
      : status === "authenticating"
        ? "Auth..."
        : status === "error"
          ? "Auth Err"
          : "No Auth";
  const badgeStyle =
    status === "authenticated"
      ? oauthBadgeStyles.authenticated
      : status === "authenticating"
        ? oauthBadgeStyles.authenticating
        : status === "error"
          ? oauthBadgeStyles.error
          : oauthBadgeStyles.unauthenticated;

  return (
    <div
      style={{ ...oauthBadgeStyles.badge, ...badgeStyle }}
      title={`OAuth: ${status}`}
      data-testid="oauth-status-indicator"
    >
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

/** Right panel icon - tabbed agent/events/logs panel */
function RightPanelIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="12" height="12" rx="2" />
      <line x1="10" y1="2" x2="10" y2="14" />
    </svg>
  );
}

export function Toolbar({
  isPrimitivesPanelVisible,
  onTogglePrimitivesPanel,
  isRightPanelVisible,
  onToggleRightPanel,
  oauthStatus,
}: ToolbarProps): React.ReactElement {
  return (
    <div style={styles.toolbar}>
      {/* Primitives panel toggle */}
      <button
        style={{
          ...styles.toolbarBtn,
          ...(isPrimitivesPanelVisible ? styles.toolbarBtnActive : {}),
        }}
        onClick={onTogglePrimitivesPanel}
        title={isPrimitivesPanelVisible ? "Hide MCP Primitives" : "Show MCP Primitives"}
        aria-label={isPrimitivesPanelVisible ? "Hide MCP Primitives" : "Show MCP Primitives"}
      >
        <PrimitivesIcon />
      </button>
      <button
        style={{
          ...styles.toolbarBtn,
          ...(isRightPanelVisible ? styles.toolbarBtnActive : {}),
        }}
        onClick={onToggleRightPanel}
        title={isRightPanelVisible ? "Hide Right Panel" : "Show Right Panel"}
        aria-label={isRightPanelVisible ? "Hide Right Panel" : "Show Right Panel"}
      >
        <RightPanelIcon />
      </button>
    </div>
  );
}

export default Toolbar;
