/**
 * WidgetDisplay Component
 *
 * Central display component that switches between agent and human modes:
 * - Agent mode: Screencast <img> with animated glow border overlay
 * - Human mode: Interactive <iframe> pointing to the widget URL
 *
 * The iframe is always rendered (never unmounted) to keep the Playwright session
 * alive across mode switches. In agent mode it's hidden behind a screencast
 * overlay with pointer-events disabled.
 */

import React from "react";
import { useInspectorMode } from "../contexts";
import { useScreencast } from "../hooks/useScreencast";
import { useWidgetUrl } from "../hooks/useWidgetUrl";

// =============================================================================
// Types
// =============================================================================

export interface WidgetDisplayProps {
  /** Base URL for the inspector API */
  baseUrl: string;
  /** Active widget session ID */
  sessionId: string;
  /** Active connection ID (may be null for default connection) */
  connectionId: string | null;
  /** Aspect ratio and container styles from parent */
  screencastAspectStyle: React.CSSProperties;
}

// =============================================================================
// Local Styles
// =============================================================================

const localStyles: Record<string, React.CSSProperties> = {
  container: {
    position: "relative",
    overflow: "hidden",
    width: "100%",
    height: "100%",
  },

  iframe: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    border: "none",
  },

  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    zIndex: 2,
    transition: "opacity 200ms ease-in-out",
  },

  screencastImg: {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "contain",
  },

  glowBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    borderRadius: "12px",
    animation: "glowPulse 2s ease-in-out infinite",
    zIndex: 3,
  },
};

// =============================================================================
// Component
// =============================================================================

export function WidgetDisplay({
  baseUrl,
  sessionId,
  connectionId,
  screencastAspectStyle,
}: WidgetDisplayProps): React.ReactElement {
  const { mode } = useInspectorMode();
  const { imageData, status } = useScreencast(baseUrl, sessionId, connectionId);
  const { url: widgetUrl } = useWidgetUrl(baseUrl, sessionId, connectionId);

  const isStreaming = status === "streaming";

  return (
    <div style={{ ...localStyles.container, ...screencastAspectStyle }}>
      {/* Iframe — always rendered to keep Playwright session alive.
          In agent mode: pointer-events disabled, hidden behind screencast overlay.
          In human mode: interactive, z-index puts it below the (hidden) overlay. */}
      {widgetUrl && (
        <iframe
          src={widgetUrl}
          title="Widget session"
          style={{
            ...localStyles.iframe,
            pointerEvents: mode === "human" ? "auto" : "none",
            zIndex: 1,
          }}
        />
      )}

      {/* Screencast overlay — always rendered when data available.
          Uses opacity transition for smooth fade between modes.
          Agent mode + streaming: opacity 1, pointer-events auto (blocks iframe).
          Human mode or not streaming: opacity 0, pointer-events none (iframe accessible). */}
      {widgetUrl && imageData && (
        <div
          style={{
            ...localStyles.overlay,
            opacity: mode === "agent" && isStreaming ? 1 : 0,
            pointerEvents: mode === "agent" && isStreaming ? "auto" : "none",
          }}
        >
          <img src={imageData} alt="Live browser view" style={localStyles.screencastImg} />
          {mode === "agent" && <div style={localStyles.glowBorder} />}
        </div>
      )}

      {/* Fallback: show screencast image when no widget URL (backward compat) */}
      {!widgetUrl && imageData && (
        <img src={imageData} alt="Live browser view" style={localStyles.screencastImg} />
      )}
    </div>
  );
}
