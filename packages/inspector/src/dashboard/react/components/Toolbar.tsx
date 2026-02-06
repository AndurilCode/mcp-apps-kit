/**
 * Toolbar Component
 *
 * Icon buttons for toggling dashboard panels (primitives, right panel).
 * Includes per-connection OAuth status button with popover panel.
 */

import React, { useState, useRef } from "react";
import { styles } from "../styles";
import type { UseOAuthResult } from "../hooks/useOAuth";
import { OAuthPanel } from "./OAuthPanel";

export interface ToolbarProps {
  /** Whether the MCP primitives panel is visible */
  isPrimitivesPanelVisible: boolean;
  /** Callback to toggle primitives panel */
  onTogglePrimitivesPanel: () => void;
  /** Whether the right panel is visible */
  isRightPanelVisible: boolean;
  /** Callback to toggle right panel */
  onToggleRightPanel: () => void;
  /** OAuth hook result for the active connection (null if no OAuth) */
  oauth?: UseOAuthResult;
  /** Callback to add a new connection */
  onAddConnection?: () => void;
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

/** Plus icon for adding connections */
function PlusIcon(): React.ReactElement {
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
      <line x1="8" y1="3" x2="8" y2="13" />
      <line x1="3" y1="8" x2="13" y2="8" />
    </svg>
  );
}

/** Lock icon (authenticated) */
function LockIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

const oauthButtonStyles = {
  authenticated: {
    color: "#ffffff",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  authenticating: {
    color: "#ff9800",
    backgroundColor: "rgba(255, 152, 0, 0.15)",
    borderColor: "rgba(255, 152, 0, 0.3)",
  },
} satisfies Record<string, React.CSSProperties>;

export function Toolbar({
  isPrimitivesPanelVisible,
  onTogglePrimitivesPanel,
  isRightPanelVisible,
  onToggleRightPanel,
  oauth,
  onAddConnection,
}: ToolbarProps): React.ReactElement {
  const [showOAuth, setShowOAuth] = useState(false);
  const oauthButtonRef = useRef<HTMLButtonElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const oauthStatus = oauth?.oauthState?.status;

  return (
    <div style={styles.toolbar} ref={toolbarRef}>
      {/* Add connection button */}
      {onAddConnection && (
        <button
          style={styles.toolbarBtn}
          onClick={onAddConnection}
          title="Add Connection"
          aria-label="Add Connection"
          data-testid="add-connection-btn"
        >
          <PlusIcon />
        </button>
      )}

      {/* OAuth lock button — only shown when connection has OAuth */}
      {oauth && oauthStatus && (
        <>
          <button
            ref={oauthButtonRef}
            style={{
              ...styles.toolbarBtn,
              ...(showOAuth ? styles.toolbarBtnActive : {}),
              ...(oauthStatus === "authenticated" ? oauthButtonStyles.authenticated : {}),
              ...(oauthStatus === "authenticating" ? oauthButtonStyles.authenticating : {}),
            }}
            onClick={() => setShowOAuth((prev) => !prev)}
            title={
              oauthStatus === "authenticated"
                ? "OAuth: Authenticated"
                : oauthStatus === "authenticating"
                  ? "OAuth: Authenticating..."
                  : "OAuth Configuration"
            }
            aria-expanded={showOAuth}
            aria-label="OAuth Configuration"
            data-testid="oauth-trigger-btn"
          >
            <LockIcon />
          </button>
          <OAuthPanel
            isOpen={showOAuth}
            anchorRef={oauthButtonRef}
            containerRef={toolbarRef}
            onClose={() => setShowOAuth(false)}
            oauth={oauth}
          />
        </>
      )}

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
