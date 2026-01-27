/**
 * Inspector Dashboard Styles
 *
 * CSS-in-JS styles for the React dashboard component.
 */

import type { CSSProperties } from "react";

export const styles: Record<string, CSSProperties> = {
  // Root
  root: {
    fontFamily:
      "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
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
    gap: "1.25rem",
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
    fontWeight: 500,
    color: "#20b2aa",
    letterSpacing: "-0.02em",
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
    backgroundColor: "#2d2f2f",
    color: "#e8e8e8",
    border: "1px solid #3d4040",
    borderRadius: "8px",
    padding: "0.5rem 1rem",
    fontSize: "0.8125rem",
    cursor: "pointer",
    minWidth: "220px",
  },

  status: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.75rem",
    color: "#6b7280",
    backgroundColor: "#2d2f2f",
    padding: "0.375rem 0.75rem",
    borderRadius: "6px",
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

  // Content Wrapper
  contentWrapper: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
  },

  // Content Row (Main + Globals Panel)
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
};
