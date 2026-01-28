/**
 * Toolbar Component
 *
 * Icon buttons for toggling dashboard panels (logs, globals, primitives).
 */

import React from "react";
import { styles } from "../styles";

export interface ToolbarProps {
  /** Whether the logs panel is visible */
  isLogsPanelVisible: boolean;
  /** Callback to toggle logs panel */
  onToggleLogsPanel: () => void;
  /** Whether the globals panel is visible */
  isGlobalsPanelVisible: boolean;
  /** Callback to toggle globals panel */
  onToggleGlobalsPanel: () => void;
  /** Whether the MCP primitives panel is visible (only shown when session is active) */
  isPrimitivesPanelVisible?: boolean;
  /** Callback to toggle primitives panel */
  onTogglePrimitivesPanel?: () => void;
  /** Whether a session is active (determines if primitives toggle shows) */
  hasActiveSession?: boolean;
}

/** Logs panel icon - bottom panel (like globals icon but rotated) */
function LogsIcon(): React.ReactElement {
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
      <line x1="2" y1="10" x2="14" y2="10" />
    </svg>
  );
}

/** Globals panel icon - right sidebar panel */
function GlobalsIcon(): React.ReactElement {
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

export function Toolbar({
  isLogsPanelVisible,
  onToggleLogsPanel,
  isGlobalsPanelVisible,
  onToggleGlobalsPanel,
  isPrimitivesPanelVisible,
  onTogglePrimitivesPanel,
  hasActiveSession,
}: ToolbarProps): React.ReactElement {
  return (
    <div style={styles.toolbar}>
      {/* Primitives panel toggle - only shown when session is active */}
      {hasActiveSession && onTogglePrimitivesPanel && (
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
      )}
      <button
        style={{
          ...styles.toolbarBtn,
          ...(isLogsPanelVisible ? styles.toolbarBtnActive : {}),
        }}
        onClick={onToggleLogsPanel}
        title={isLogsPanelVisible ? "Hide Logs Panel" : "Show Logs Panel"}
        aria-label={isLogsPanelVisible ? "Hide Logs Panel" : "Show Logs Panel"}
      >
        <LogsIcon />
      </button>
      <button
        style={{
          ...styles.toolbarBtn,
          ...(isGlobalsPanelVisible ? styles.toolbarBtnActive : {}),
        }}
        onClick={onToggleGlobalsPanel}
        title={isGlobalsPanelVisible ? "Hide Globals Panel" : "Show Globals Panel"}
        aria-label={isGlobalsPanelVisible ? "Hide Globals Panel" : "Show Globals Panel"}
      >
        <GlobalsIcon />
      </button>
    </div>
  );
}

export default Toolbar;
