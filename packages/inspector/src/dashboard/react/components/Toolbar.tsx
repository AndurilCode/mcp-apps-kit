/**
 * Toolbar Component
 *
 * Icon buttons for toggling dashboard panels (primitives, right panel).
 */

import React from "react";
import { styles } from "../styles";

export interface ToolbarProps {
  /** Whether the MCP primitives panel is visible */
  isPrimitivesPanelVisible: boolean;
  /** Callback to toggle primitives panel */
  onTogglePrimitivesPanel: () => void;
  /** Whether the right panel is visible */
  isRightPanelVisible: boolean;
  /** Callback to toggle right panel */
  onToggleRightPanel: () => void;
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

export function Toolbar({
  isPrimitivesPanelVisible,
  onTogglePrimitivesPanel,
  isRightPanelVisible,
  onToggleRightPanel,
}: ToolbarProps): React.ReactElement {
  return (
    <div style={styles.toolbar}>
      {/* Primitives panel toggle - only shown when session is active */}
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
