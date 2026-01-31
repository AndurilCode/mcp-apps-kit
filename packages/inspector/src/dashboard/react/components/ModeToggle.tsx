/**
 * ModeToggle Component
 *
 * Pill-shaped toggle for switching between "Human" and "Agent" dashboard modes.
 * Uses inline styles following the existing component pattern.
 */

import React from "react";
import { useInspectorMode, type DashboardMode } from "../contexts";

// =============================================================================
// Local Styles
// =============================================================================

const TEAL = "#20b2aa";
const TEAL_BG = "rgba(32, 178, 170, 0.15)";

const localStyles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    backgroundColor: "#111111",
    borderRadius: "20px",
    border: "1px solid #2d2f2f",
    padding: "2px",
    gap: "0px",
  },
  option: {
    padding: "4px 12px",
    borderRadius: "18px",
    fontSize: "0.75rem",
    fontWeight: 500,
    cursor: "pointer",
    border: "none",
    background: "transparent",
    color: "#6b7280",
    transition: "all 0.2s ease",
    lineHeight: 1.4,
    fontFamily: "inherit",
    userSelect: "none",
  },
  optionActive: {
    backgroundColor: TEAL_BG,
    color: TEAL,
  },
};

// =============================================================================
// Component
// =============================================================================

export function ModeToggle(): React.ReactElement {
  const { mode, setMode } = useInspectorMode();

  const handleClick = (target: DashboardMode): void => {
    if (target !== mode) {
      setMode(target);
    }
  };

  return (
    <div style={localStyles.container} role="radiogroup" aria-label="Dashboard mode">
      <button
        type="button"
        style={{
          ...localStyles.option,
          ...(mode === "human" ? localStyles.optionActive : {}),
        }}
        role="radio"
        aria-checked={mode === "human"}
        onClick={() => handleClick("human")}
        title="Switch to Human mode"
      >
        Human
      </button>
      <button
        type="button"
        style={{
          ...localStyles.option,
          ...(mode === "agent" ? localStyles.optionActive : {}),
        }}
        role="radio"
        aria-checked={mode === "agent"}
        onClick={() => handleClick("agent")}
        title="Switch to Agent mode"
      >
        Agent
      </button>
    </div>
  );
}

export default ModeToggle;
