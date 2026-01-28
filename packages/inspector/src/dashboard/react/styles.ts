/**
 * Inspector Dashboard Styles
 *
 * CSS-in-JS styles for the React dashboard component.
 */

import type { CSSProperties } from "react";

// Font stacks
const FONT_SANS =
  "'Inter', 'SF Pro Display', 'Segoe UI', 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif";
const FONT_MONO =
  "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace";

export const styles: Record<string, CSSProperties> = {
  // Root
  root: {
    fontFamily: FONT_SANS,
    backgroundColor: "#000000",
    color: "#e8e8e8",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    fontSize: "14px",
    lineHeight: 1.5,
    overflow: "hidden",
  },

  // Header
  header: {
    backgroundColor: "#000000",
    padding: "1rem 1.5rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid #2d2f2f",
    flexShrink: 0,
  },

  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },

  logo: {
    width: "28px",
    height: "28px",
    objectFit: "contain",
  },

  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
  },

  // Toolbar
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    marginLeft: "0.5rem",
  },

  toolbarBtn: {
    background: "transparent",
    border: "none",
    borderRadius: "4px",
    padding: "0.375rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#6b7280",
    transition: "all 0.15s ease",
  },

  toolbarBtnActive: {
    color: "#20b2aa",
    backgroundColor: "rgba(32, 178, 170, 0.1)",
  },

  title: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#e8e8e8",
    letterSpacing: "-0.01em",
    margin: 0,
  },

  controls: {
    display: "flex",
    alignItems: "center",
    gap: "1.25rem",
  },

  label: {
    fontSize: "0.8125rem",
    color: "#6b7280",
    fontWeight: 400,
  },

  select: {
    fontFamily: "inherit",
    backgroundColor: "#111111",
    color: "#ffffff",
    border: "1px solid #2d2f2f",
    borderRadius: "8px",
    padding: "0.5rem 2rem 0.5rem 1rem",
    fontSize: "0.8125rem",
    cursor: "pointer",
    minWidth: "220px",
  },

  selectSingleSession: {
    cursor: "default",
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    backgroundImage: "none",
    paddingRight: "1rem",
  },

  status: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.75rem",
    color: "#ffffff",
    backgroundColor: "#111111",
    padding: "0.375rem 0.75rem",
    borderRadius: "6px",
    position: "relative",
    overflow: "hidden",
  },

  // Status wrapper for streaming animation
  statusWrapper: {
    position: "relative",
    borderRadius: "8px",
    padding: "2px",
    background: "transparent",
  },

  statusWrapperStreaming: {
    background: "linear-gradient(90deg, #20b2aa, #00d4ff, #20b2aa)",
    backgroundSize: "200% 100%",
    animation: "snakeBorder 2s linear infinite",
    boxShadow: "0 0 12px rgba(32, 178, 170, 0.4), 0 0 24px rgba(32, 178, 170, 0.2)",
  },

  statusInner: {
    backgroundColor: "#111111",
    borderRadius: "6px",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.75rem",
    color: "#ffffff",
    padding: "0.375rem 0.75rem",
    position: "relative",
    zIndex: 1,
  },

  statusDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    backgroundColor: "#6b7280",
  },

  statusDotConnected: {
    backgroundColor: "#20b2aa",
  },

  statusDotStreaming: {
    backgroundColor: "#20b2aa",
    boxShadow: "0 0 8px rgba(32, 178, 170, 0.5)",
  },

  statusDotDisconnected: {
    backgroundColor: "#ef4444",
  },

  // Error Banner
  errorBanner: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    color: "#fca5a5",
    padding: "0.75rem 1.5rem",
    fontSize: "0.8125rem",
    borderBottom: "1px solid rgba(239, 68, 68, 0.2)",
    flexShrink: 0,
  },

  // Content Wrapper - horizontal layout with side panels and center column
  contentWrapper: {
    flex: 1,
    display: "flex",
    flexDirection: "row",
    minHeight: 0,
    overflow: "hidden",
  },

  // Center Column - contains main content and bottom panel
  centerColumn: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  },

  // Content Row (legacy - kept for compatibility but not used in new layout)
  contentRow: {
    flex: 1,
    display: "flex",
    flexDirection: "row",
    minHeight: 0,
    overflow: "hidden",
  },

  // Main
  main: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1rem",
    backgroundColor: "#000000",
    minHeight: 0,
    overflow: "hidden",
  },

  // Left Panel (MCP Primitives)
  leftPanel: {
    width: "320px",
    flexShrink: 0,
  },

  // Display Container
  displayContainer: {
    backgroundColor: "#000000",
    borderRadius: "12px",
    border: "1px solid #2d2f2f",
    overflow: "hidden",
    maxWidth: "100%",
    maxHeight: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    boxShadow: "0 4px 24px rgba(0, 0, 0, 0.3)",
  },

  displayContainerStreaming: {
    height: "100%",
  },

  streamImage: {
    display: "block",
    width: "auto",
    height: "100%",
    maxWidth: "100%",
    objectFit: "contain",
  },

  // Placeholder
  placeholder: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem",
    textAlign: "center",
    color: "#6b7280",
    minWidth: "300px",
  },

  placeholderIcon: {
    width: "56px",
    height: "56px",
    marginBottom: "1.25rem",
    opacity: 0.4,
    color: "#20b2aa",
  },

  placeholderTitle: {
    fontSize: "0.9375rem",
    fontWeight: 500,
    marginBottom: "0.625rem",
    color: "#9ca3af",
    letterSpacing: "-0.01em",
    margin: "0 0 0.625rem 0",
  },

  placeholderText: {
    fontSize: "0.8125rem",
    maxWidth: "320px",
    color: "#6b7280",
    lineHeight: 1.6,
    margin: 0,
  },

  // Resize Handle
  resizeHandle: {
    height: "6px",
    backgroundColor: "#2d2f2f",
    cursor: "ns-resize",
    flexShrink: 0,
    transition: "background-color 0.15s ease, height 0.25s ease, opacity 0.2s ease",
  },

  resizeHandleActive: {
    backgroundColor: "#20b2aa",
  },

  resizeHandleHidden: {
    height: 0,
    opacity: 0,
  },

  // Logs Panel
  logsPanel: {
    backgroundColor: "#000000",
    borderTop: "1px solid #2d2f2f",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    overflow: "hidden",
    transition: "height 0.25s ease, opacity 0.2s ease",
  },

  logsPanelHidden: {
    height: 0,
    borderTop: "none",
    opacity: 0,
  },

  logsHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.5rem 1rem",
    backgroundColor: "#0a0a0a",
    borderBottom: "1px solid #1a1a1a",
    flexShrink: 0,
  },

  logsTitle: {
    fontSize: "0.75rem",
    fontWeight: 500,
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },

  logsControls: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },

  logCount: {
    fontSize: "0.6875rem",
    color: "#6b7280",
  },

  clearLogsBtn: {
    fontFamily: "inherit",
    backgroundColor: "transparent",
    border: "1px solid #3d4040",
    color: "#9ca3af",
    padding: "0.25rem 0.5rem",
    borderRadius: "4px",
    fontSize: "0.6875rem",
    cursor: "pointer",
  },

  toggleLogsBtn: {
    fontFamily: "inherit",
    backgroundColor: "transparent",
    border: "1px solid #3d4040",
    color: "#9ca3af",
    padding: "0.25rem 0.375rem",
    borderRadius: "4px",
    fontSize: "0.625rem",
    cursor: "pointer",
    transition: "transform 0.15s ease",
  },

  logsContainer: {
    fontFamily: FONT_MONO,
    flex: 1,
    overflowY: "auto",
    padding: "0.5rem",
    fontSize: "0.75rem",
    minHeight: 0,
  },

  logsEmpty: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "#4b5563",
    fontSize: "0.75rem",
  },

  // Log Entry
  logEntry: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.5rem",
    padding: "0.25rem 0.5rem",
    borderRadius: "3px",
    lineHeight: 1.4,
  },

  logTime: {
    color: "#4b5563",
    fontSize: "0.6875rem",
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  },

  logBadge: {
    fontSize: "0.5625rem",
    padding: "0.125rem 0.375rem",
    borderRadius: "3px",
    textTransform: "uppercase",
    fontWeight: 500,
    flexShrink: 0,
  },

  logBadgeHost: {
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    color: "#00d4ff",
  },

  logBadgeWidget: {
    backgroundColor: "rgba(179, 157, 219, 0.15)",
    color: "#b39ddb",
  },

  logBadgeUnknown: {
    backgroundColor: "rgba(107, 114, 128, 0.15)",
    color: "#6b7280",
  },

  logLevel: {
    fontSize: "0.6875rem",
    flexShrink: 0,
    minWidth: "40px",
  },

  logText: {
    flex: 1,
    wordBreak: "break-word",
    whiteSpace: "pre-wrap",
  },

  // Log level colors
  logLevelError: {
    color: "#ff6b6b",
  },

  logLevelWarn: {
    color: "#ffc107",
  },

  logLevelInfo: {
    color: "#64b5f6",
  },

  logLevelDebug: {
    color: "#9e9e9e",
  },

  logLevelLog: {
    color: "#e8e8e8",
  },

  // Globals Panel
  globalsPanel: {
    backgroundColor: "#0d0e0e",
    borderLeft: "1px solid #2d2f2f",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    overflow: "hidden",
    transition: "width 0.25s ease, opacity 0.2s ease",
  },

  globalsPanelCollapsed: {
    width: 0,
    borderLeft: "none",
    opacity: 0,
  },

  globalsPanelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.75rem 1rem",
    backgroundColor: "#0a0a0a",
    borderBottom: "1px solid #1a1a1a",
    flexShrink: 0,
  },

  globalsPanelTitle: {
    fontSize: "0.75rem",
    fontWeight: 500,
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },

  globalsPanelToggle: {
    background: "transparent",
    border: "1px solid #3d4040",
    borderRadius: "4px",
    padding: "0.25rem 0.375rem",
    cursor: "pointer",
    color: "#9ca3af",
    fontSize: "0.625rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.15s ease",
  },

  globalsPanelContent: {
    flex: 1,
    overflowY: "auto",
    padding: "0.75rem",
    fontSize: "0.75rem",
    minHeight: 0,
  },

  globalsSection: {
    marginBottom: "1rem",
  },

  globalsSectionTitle: {
    fontSize: "0.6875rem",
    fontWeight: 600,
    color: "#20b2aa",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "0.5rem",
    paddingBottom: "0.25rem",
    borderBottom: "1px solid #2d2f2f",
  },

  globalsItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "0.25rem 0",
    gap: "0.5rem",
  },

  globalsItemLabel: {
    color: "#6b7280",
    fontSize: "0.6875rem",
    flexShrink: 0,
  },

  globalsItemValue: {
    color: "#e8e8e8",
    fontSize: "0.6875rem",
    textAlign: "right",
    wordBreak: "break-word",
  },

  // ===========================================================================
  // BOTTOM PANEL (Logs + Events)
  // ===========================================================================

  // View Mode Selector
  viewModeSelector: {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
  },

  viewModeBtn: {
    fontFamily: "inherit",
    backgroundColor: "transparent",
    border: "1px solid #3d4040",
    color: "#9ca3af",
    padding: "0.25rem 0.5rem",
    borderRadius: "4px",
    fontSize: "0.6875rem",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },

  viewModeBtnActive: {
    backgroundColor: "rgba(32, 178, 170, 0.15)",
    borderColor: "#20b2aa",
    color: "#20b2aa",
  },

  // Split View
  splitView: {
    display: "flex",
    flexDirection: "row",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },

  splitPane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    overflow: "hidden",
  },

  splitDivider: {
    width: "1px",
    backgroundColor: "#2d2f2f",
    flexShrink: 0,
  },

  // ===========================================================================
  // EVENTS PANEL
  // ===========================================================================

  eventsPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
  },

  eventsPanelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.375rem 0.75rem",
    backgroundColor: "#0a0a0a",
    borderBottom: "1px solid #1a1a1a",
    flexShrink: 0,
    gap: "0.5rem",
  },

  eventsPanelTitle: {
    fontSize: "0.6875rem",
    fontWeight: 500,
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },

  eventsPanelControls: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },

  eventsContainer: {
    fontFamily: FONT_MONO,
    flex: 1,
    overflowY: "auto",
    padding: "0.25rem",
    fontSize: "0.75rem",
    minHeight: 0,
  },

  eventsEmpty: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "#4b5563",
    fontSize: "0.75rem",
  },

  // Filter Select
  filterSelect: {
    fontFamily: "inherit",
    backgroundColor: "#111111",
    color: "#e8e8e8",
    border: "1px solid #3d4040",
    borderRadius: "4px",
    padding: "0.125rem 0.375rem",
    fontSize: "0.625rem",
    cursor: "pointer",
    minWidth: "80px",
  },

  // ===========================================================================
  // EVENT ROW
  // ===========================================================================

  eventRow: {
    borderRadius: "4px",
    marginBottom: "2px",
    transition: "background-color 0.1s ease",
  },

  eventRowHeader: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.25rem 0.5rem",
    cursor: "pointer",
    userSelect: "none",
  },

  eventRowHeaderHover: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },

  eventRowExpanded: {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
  },

  eventExpandIcon: {
    color: "#6b7280",
    fontSize: "0.625rem",
    width: "12px",
    textAlign: "center",
    flexShrink: 0,
    transition: "transform 0.15s ease",
  },

  eventExpandIconOpen: {
    transform: "rotate(90deg)",
  },

  eventTime: {
    color: "#4b5563",
    fontSize: "0.625rem",
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  },

  eventBadge: {
    fontSize: "0.5rem",
    padding: "0.0625rem 0.25rem",
    borderRadius: "2px",
    textTransform: "uppercase",
    fontWeight: 600,
    letterSpacing: "0.02em",
    flexShrink: 0,
  },

  // Event category badge colors
  eventBadgeTool: {
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    color: "#00d4ff",
  },

  eventBadgeDom: {
    backgroundColor: "rgba(179, 157, 219, 0.15)",
    color: "#b39ddb",
  },

  eventBadgeGlobals: {
    backgroundColor: "rgba(76, 175, 80, 0.15)",
    color: "#4caf50",
  },

  eventBadgeLifecycle: {
    backgroundColor: "rgba(255, 152, 0, 0.15)",
    color: "#ff9800",
  },

  eventBadgeSession: {
    backgroundColor: "rgba(33, 150, 243, 0.15)",
    color: "#2196f3",
  },

  eventBadgeError: {
    backgroundColor: "rgba(255, 107, 107, 0.15)",
    color: "#ff6b6b",
  },

  eventBadgeDialog: {
    backgroundColor: "rgba(255, 193, 7, 0.15)",
    color: "#ffc107",
  },

  eventBadgeAgent: {
    backgroundColor: "rgba(255, 152, 0, 0.15)",
    color: "#ff9800",
  },

  eventType: {
    fontSize: "0.625rem",
    color: "#6b7280",
    flexShrink: 0,
  },

  eventSummary: {
    flex: 1,
    fontSize: "0.6875rem",
    color: "#e8e8e8",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  eventPayload: {
    padding: "0.5rem 0.5rem 0.5rem 1.5rem",
    borderTop: "1px solid rgba(255, 255, 255, 0.05)",
  },

  // ===========================================================================
  // JSON VIEWER
  // ===========================================================================

  jsonContainer: {
    fontFamily: FONT_MONO,
    fontSize: "0.625rem",
    lineHeight: 1.5,
    color: "#e8e8e8",
    backgroundColor: "#0a0a0a",
    borderRadius: "4px",
    padding: "0.5rem",
    overflow: "auto",
    maxHeight: "200px",
  },

  jsonLine: {
    display: "flex",
    alignItems: "flex-start",
  },

  jsonIndent: {
    flexShrink: 0,
    width: "1rem",
    display: "inline-block",
  },

  jsonExpandBtn: {
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    color: "#6b7280",
    fontSize: "0.625rem",
    width: "1rem",
    textAlign: "center",
    flexShrink: 0,
  },

  jsonKey: {
    color: "#9cdcfe",
  },

  jsonColon: {
    color: "#6b7280",
    marginRight: "0.25rem",
  },

  jsonString: {
    color: "#ce9178",
  },

  jsonNumber: {
    color: "#b5cea8",
  },

  jsonBoolean: {
    color: "#569cd6",
  },

  jsonNull: {
    color: "#569cd6",
    fontStyle: "italic",
  },

  jsonBracket: {
    color: "#d4d4d4",
  },

  jsonEllipsis: {
    color: "#6b7280",
    fontStyle: "italic",
  },
};
