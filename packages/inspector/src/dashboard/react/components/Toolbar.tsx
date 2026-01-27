/**
 * Toolbar Component
 *
 * Icon buttons for toggling dashboard panels (logs, globals).
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

/** Globals panel icon - sidebar panel */
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

export function Toolbar({
  isLogsPanelVisible,
  onToggleLogsPanel,
  isGlobalsPanelVisible,
  onToggleGlobalsPanel,
}: ToolbarProps): React.ReactElement {
  return (
    <div style={styles.toolbar}>
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
