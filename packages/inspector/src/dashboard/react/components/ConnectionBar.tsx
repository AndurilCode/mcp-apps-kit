/**
 * ConnectionBar Component
 *
 * Browser-style URL connection bar for connecting to MCP servers.
 * Features:
 * - URL input with autocomplete from server history
 * - Protocol badge display (ChatGPT Apps, MCP Apps, or none)
 * - Connect/Disconnect controls
 * - Transport selector (HTTP / stdio)
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { ConnectionParams } from "@mcp-apps-kit/testing";
import type { ServerHistoryEntry } from "../hooks";
import type { UseOAuthResult } from "../hooks/useOAuth";
import type { AuthRequiredEvent } from "../../../oauth/discovery";
import { OAuthPanel } from "./OAuthPanel";
import { OAuthDiscoveryPanel } from "./OAuthDiscoveryPanel";

/**
 * Parse an environment string (KEY=value pairs separated by commas or newlines)
 * into a Record, or undefined if empty.
 */
function parseEnvString(envStr: string): Record<string, string> | undefined {
  const trimmed = envStr.trim();
  if (!trimmed) return undefined;

  const result: Record<string, string> = {};
  const pairs = trimmed.split(/[,\n]+/);
  for (const pair of pairs) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex > 0) {
      const key = pair.slice(0, eqIndex).trim();
      const value = pair.slice(eqIndex + 1).trim();
      if (key) result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export interface ConnectionBarProps {
  isOpen: boolean;
  isCreating: boolean;
  error: string | null;
  onCreateConnection: (params: ConnectionParams) => Promise<boolean>;
  onClose: () => void;
  getMatchingEntries: (filter: string) => ServerHistoryEntry[];
  /** OAuth hook result for the active connection (optional) */
  oauth?: UseOAuthResult;
  /** Auth discovery results from a failed connection attempt */
  authDiscovery?: AuthRequiredEvent | null;
  /** Clear the auth discovery state (dismiss panel) */
  onDismissDiscovery?: () => void;
}

// Connection bar styles (extends base styles)
const connectionBarStyles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    flex: 1,
    maxWidth: "600px",
    marginLeft: "1rem",
    marginRight: "1rem",
    position: "relative",
  },
  inputWrapper: {
    display: "flex",
    alignItems: "center",
    flex: 1,
    backgroundColor: "#111111",
    border: "1px solid #2d2f2f",
    borderRadius: "8px",
    overflow: "hidden",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
  },
  inputWrapperFocused: {
    borderColor: "#20b2aa",
    boxShadow: "0 0 0 2px rgba(32, 178, 170, 0.2)",
  },
  inputWrapperError: {
    borderColor: "#ef4444",
    boxShadow: "0 0 0 2px rgba(239, 68, 68, 0.2)",
  },
  protocolBadge: {
    display: "flex",
    alignItems: "center",
    padding: "0.25rem 0.5rem",
    fontSize: "0.625rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.02em",
    borderRadius: "4px",
    marginLeft: "0.5rem",
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  badgeChatgptApps: {
    backgroundColor: "rgba(32, 178, 170, 0.15)",
    color: "#20b2aa",
  },
  badgeMcpApps: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    color: "#3b82f6",
  },
  urlInput: {
    flex: 1,
    backgroundColor: "transparent",
    border: "none",
    color: "#e8e8e8",
    padding: "0.5rem 0.75rem",
    fontSize: "0.8125rem",
    fontFamily: "inherit",
    outline: "none",
    minWidth: "200px",
  },
  actionButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.5rem 0.75rem",
    backgroundColor: "transparent",
    border: "none",
    cursor: "pointer",
    color: "#6b7280",
    transition: "color 0.15s ease, background-color 0.15s ease",
    borderLeft: "1px solid #2d2f2f",
    flexShrink: 0,
  },
  connectButton: {
    color: "#20b2aa",
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  closeButton: {
    color: "#9aa0a6",
    borderLeft: "1px solid #2d2f2f",
  },
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: "4px",
    backgroundColor: "#111111",
    border: "1px solid #2d2f2f",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
    zIndex: 100,
    maxHeight: "200px",
    overflowY: "auto",
  },
  dropdownItem: {
    display: "flex",
    alignItems: "center",
    padding: "0.5rem 0.75rem",
    cursor: "pointer",
    transition: "background-color 0.1s ease",
    gap: "0.5rem",
  },
  dropdownItemHover: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  dropdownItemUrl: {
    flex: 1,
    fontSize: "0.75rem",
    color: "#e8e8e8",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  dropdownItemName: {
    fontSize: "0.6875rem",
    color: "#6b7280",
  },
  dropdownItemBadge: {
    fontSize: "0.5625rem",
    padding: "0.125rem 0.25rem",
    borderRadius: "3px",
    fontWeight: 600,
    textTransform: "uppercase",
    flexShrink: 0,
  },
  loadingSpinner: {
    width: "14px",
    height: "14px",
    border: "2px solid #2d2f2f",
    borderTopColor: "#20b2aa",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  errorTooltip: {
    position: "absolute",
    top: "100%",
    left: "50%",
    transform: "translateX(-50%)",
    marginTop: "8px",
    padding: "0.5rem 0.75rem",
    backgroundColor: "rgba(239, 68, 68, 0.9)",
    color: "#ffffff",
    fontSize: "0.75rem",
    borderRadius: "6px",
    whiteSpace: "nowrap",
    zIndex: 101,
  },
  transportSelect: {
    backgroundColor: "#111111",
    color: "#e8e8e8",
    border: "none",
    borderRight: "1px solid #2d2f2f",
    padding: "0.5rem 0.5rem",
    fontSize: "0.75rem",
    fontFamily: "inherit",
    fontWeight: 500,
    cursor: "pointer",
    outline: "none",
    flexShrink: 0,
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 0.25rem center",
    paddingRight: "1rem",
  } as React.CSSProperties,
  settingsButtonActive: {
    color: "#20b2aa",
    backgroundColor: "rgba(32, 178, 170, 0.1)",
  },
  oauthButtonAuthenticated: {
    color: "#20b2aa",
  },
  oauthButtonAuthenticating: {
    color: "#ff9800",
  },
  popover: {
    position: "absolute",
    backgroundColor: "#1e1e1e",
    border: "1px solid #444",
    borderRadius: "8px",
    boxShadow: "0 10px 28px rgba(0, 0, 0, 0.5)",
    padding: "16px",
    zIndex: 1000,
    minWidth: "400px",
  },
  popoverContent: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.75rem",
  },
  advancedInput: {
    flex: 1,
    backgroundColor: "#111111",
    border: "1px solid #2d2f2f",
    borderRadius: "6px",
    color: "#e8e8e8",
    padding: "0.375rem 0.5rem",
    fontSize: "0.75rem",
    fontFamily: "inherit",
    outline: "none",
  },
  advancedTextarea: {
    flex: 1,
    backgroundColor: "#111111",
    border: "1px solid #2d2f2f",
    borderRadius: "6px",
    color: "#e8e8e8",
    padding: "0.375rem 0.5rem",
    fontSize: "0.75rem",
    fontFamily: "inherit",
    outline: "none",
    resize: "vertical" as const,
    minHeight: "2rem",
    maxHeight: "4rem",
  },
  advancedLabel: {
    fontSize: "0.625rem",
    color: "#6b7280",
    marginBottom: "0.125rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    fontWeight: 500,
  },
  advancedField: {
    display: "flex",
    flexDirection: "column" as const,
    flex: 1,
  },
};

interface PopoverProps {
  isOpen: boolean;
  anchorRef: React.RefObject<HTMLElement>;
  containerRef: React.RefObject<HTMLElement>;
  onClose: () => void;
  children: React.ReactNode;
  panelStyle?: React.CSSProperties;
}

function Popover({
  isOpen,
  anchorRef,
  containerRef,
  onClose,
  children,
  panelStyle,
}: PopoverProps): React.ReactElement | null {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<React.CSSProperties>({});

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const container = containerRef.current;
    if (!anchor || !container) return;
    const anchorRect = anchor.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const top = anchorRect.bottom - containerRect.top + 8;
    const right = Math.max(containerRect.right - anchorRect.right, 0);
    setPosition({ top: `${top}px`, right: `${right}px` });
  }, [anchorRef, containerRef]);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const handleResize = () => updatePosition();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen) return null;

  return (
    <div ref={popoverRef} style={{ ...connectionBarStyles.popover, ...panelStyle, ...position }}>
      {children}
    </div>
  );
}

/**
 * ConnectionBar Component
 */
export function ConnectionBar({
  isOpen,
  isCreating,
  error,
  onCreateConnection,
  onClose,
  getMatchingEntries,
  oauth,
  authDiscovery,
  onDismissDiscovery,
}: ConnectionBarProps): React.ReactElement {
  const [inputValue, setInputValue] = useState("");
  const [transport, setTransport] = useState<"http" | "stdio">("http");
  const [command, setCommand] = useState("");
  const [stdioArgs, setStdioArgs] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showOAuth, setShowOAuth] = useState(false);
  const [envVars, setEnvVars] = useState("");
  const [cwd, setCwd] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const oauthButtonRef = useRef<HTMLButtonElement>(null);

  // OAuth status for button styling
  const oauthStatus = oauth?.oauthState?.status;

  // Determine if the current form is submittable
  const canSubmit = transport === "http" ? !!inputValue.trim() : !!command.trim();

  // Get filtered history entries based on input
  const filterText = transport === "http" ? inputValue : command;
  const filteredHistory = useMemo(() => {
    if (!filterText && !isFocused) return [];
    return getMatchingEntries(filterText);
  }, [filterText, isFocused, getMatchingEntries]);

  // Show dropdown when focused and there are entries
  useEffect(() => {
    setShowDropdown(isFocused && filteredHistory.length > 0);
  }, [isFocused, filteredHistory.length]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (transport !== "stdio") {
      setShowAdvanced(false);
    }
  }, [transport]);

  const buildParams = useCallback((): ConnectionParams | null => {
    if (transport === "http") {
      const url = inputValue.trim();
      if (!url) return null;
      return { transport: "http", url };
    }
    const cmd = command.trim();
    if (!cmd) return null;
    return {
      transport: "stdio",
      command: cmd,
      ...(stdioArgs.trim() ? { args: stdioArgs.trim().split(/\s+/) } : {}),
      ...(() => {
        const env = parseEnvString(envVars);
        return env ? { env } : {};
      })(),
      ...(cwd.trim() ? { cwd: cwd.trim() } : {}),
    };
  }, [transport, inputValue, command, stdioArgs, envVars, cwd]);

  const handleCreate = useCallback(async () => {
    if (isCreating) return;
    const params = buildParams();
    if (!params) return;
    const created = await onCreateConnection(params);
    if (created) {
      setInputValue("");
      setCommand("");
      setStdioArgs("");
      setEnvVars("");
      setCwd("");
      setShowAdvanced(false);
      setShowDropdown(false);
      setIsFocused(false);
      onClose();
    }
  }, [isCreating, buildParams, onCreateConnection, onClose]);

  const applyHistoryEntry = useCallback((entry: ServerHistoryEntry): ConnectionParams => {
    if (entry.transport === "stdio" && entry.command) {
      setTransport("stdio");
      setCommand(entry.command);
      setStdioArgs(entry.args?.join(" ") ?? "");
      return {
        transport: "stdio",
        command: entry.command,
        ...(entry.args?.length ? { args: entry.args } : {}),
      };
    }
    setTransport("http");
    setInputValue(entry.url);
    return { transport: "http", url: entry.url };
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && showDropdown && hoveredIndex >= 0) {
        if (isCreating) return;
        e.preventDefault();
        const entry = filteredHistory[hoveredIndex];
        if (entry) {
          const params = applyHistoryEntry(entry);
          setShowDropdown(false);
          void onCreateConnection(params);
        }
      } else if (e.key === "Enter") {
        void handleCreate();
      } else if (e.key === "Escape") {
        setShowDropdown(false);
        inputRef.current?.blur();
      } else if (e.key === "ArrowDown" && showDropdown) {
        e.preventDefault();
        setHoveredIndex((prev) => Math.min(prev + 1, filteredHistory.length - 1));
      } else if (e.key === "ArrowUp" && showDropdown) {
        e.preventDefault();
        setHoveredIndex((prev) => Math.max(prev - 1, 0));
      }
    },
    [
      handleCreate,
      showDropdown,
      hoveredIndex,
      filteredHistory,
      onCreateConnection,
      applyHistoryEntry,
      isCreating,
    ]
  );

  const handleSelectHistory = useCallback(
    (entry: ServerHistoryEntry) => {
      if (isCreating) return;
      const params = applyHistoryEntry(entry);
      setShowDropdown(false);
      void onCreateConnection(params);
    },
    [onCreateConnection, applyHistoryEntry, isCreating]
  );

  if (!isOpen) {
    return <></>;
  }

  return (
    <div ref={containerRef} style={connectionBarStyles.container}>
      {/* Inject keyframe animation for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <div
          style={{
            ...connectionBarStyles.inputWrapper,
            ...(isFocused ? connectionBarStyles.inputWrapperFocused : {}),
            ...(error ? connectionBarStyles.inputWrapperError : {}),
          }}
        >
          {/* Transport Selector */}
          <select
            style={connectionBarStyles.transportSelect as React.CSSProperties}
            value={transport}
            onChange={(e) => setTransport(e.target.value as "http" | "stdio")}
          >
            <option value="http">HTTP</option>
            <option value="stdio">stdio</option>
          </select>

          {/* Inputs: HTTP URL or stdio command + args */}
          {transport === "http" ? (
            <input
              ref={inputRef}
              type="text"
              style={connectionBarStyles.urlInput}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setTimeout(() => setIsFocused(false), 200)}
              onKeyDown={handleKeyDown}
              placeholder="(Connect your Agent)"
            />
          ) : (
            <>
              <input
                ref={inputRef}
                type="text"
                style={{ ...connectionBarStyles.urlInput, flex: 2 }}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                onKeyDown={handleKeyDown}
                placeholder="command (e.g. node, python)"
              />
              <input
                type="text"
                style={{
                  ...connectionBarStyles.urlInput,
                  flex: 3,
                  borderLeft: "1px solid #2d2f2f",
                }}
                value={stdioArgs}
                onChange={(e) => setStdioArgs(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                onKeyDown={handleKeyDown}
                placeholder="args (e.g. server.js --port 3000)"
              />
            </>
          )}

          {/* Action Button */}
          <button
            type="button"
            style={{
              ...connectionBarStyles.actionButton,
              ...connectionBarStyles.connectButton,
              ...(!canSubmit || isCreating ? connectionBarStyles.buttonDisabled : {}),
            }}
            onClick={() => void handleCreate()}
            disabled={!canSubmit || isCreating}
            title="Create connection"
          >
            {isCreating ? (
              <div style={connectionBarStyles.loadingSpinner} />
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            )}
          </button>

          {transport === "stdio" && (
            <button
              ref={settingsButtonRef}
              type="button"
              style={{
                ...connectionBarStyles.actionButton,
                ...(showAdvanced ? connectionBarStyles.settingsButtonActive : {}),
              }}
              onClick={() => setShowAdvanced((prev) => !prev)}
              title="Advanced Settings"
              aria-expanded={showAdvanced}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
              </svg>
            </button>
          )}

          {/* OAuth button — only for HTTP connections */}
          {transport === "http" && oauth && (
            <button
              ref={oauthButtonRef}
              type="button"
              style={{
                ...connectionBarStyles.actionButton,
                ...(showOAuth ? connectionBarStyles.settingsButtonActive : {}),
                ...(oauthStatus === "authenticated"
                  ? connectionBarStyles.oauthButtonAuthenticated
                  : {}),
                ...(oauthStatus === "authenticating"
                  ? connectionBarStyles.oauthButtonAuthenticating
                  : {}),
              }}
              onClick={() => setShowOAuth((prev) => !prev)}
              title={
                oauthStatus === "authenticated"
                  ? "OAuth: Authenticated"
                  : oauthStatus === "authenticating"
                    ? "OAuth: Authenticating..."
                    : "Configure OAuth"
              }
              aria-expanded={showOAuth}
              data-testid="oauth-trigger-btn"
            >
              {oauthStatus === "authenticated" ? (
                <svg
                  width="14"
                  height="14"
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
              ) : oauthStatus === "authenticating" ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                </svg>
              )}
            </button>
          )}

          <button
            type="button"
            style={{
              ...connectionBarStyles.actionButton,
              ...connectionBarStyles.closeButton,
            }}
            onClick={onClose}
            title="Close"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {transport === "stdio" && (
        <Popover
          isOpen={showAdvanced}
          anchorRef={settingsButtonRef}
          containerRef={containerRef}
          onClose={() => setShowAdvanced(false)}
        >
          <div style={connectionBarStyles.popoverContent}>
            <div style={connectionBarStyles.advancedField}>
              <label style={connectionBarStyles.advancedLabel}>Environment Variables</label>
              <textarea
                style={connectionBarStyles.advancedTextarea}
                value={envVars}
                onChange={(e) => setEnvVars(e.target.value)}
                placeholder="KEY=value, KEY2=value2"
                rows={2}
              />
            </div>
            <div style={connectionBarStyles.advancedField}>
              <label style={connectionBarStyles.advancedLabel}>Working Directory</label>
              <input
                type="text"
                style={connectionBarStyles.advancedInput}
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                placeholder="/path/to/project"
              />
            </div>
          </div>
        </Popover>
      )}

      {/* OAuth Panel Popover */}
      {oauth && (
        <OAuthPanel
          isOpen={showOAuth}
          anchorRef={oauthButtonRef}
          containerRef={containerRef}
          onClose={() => setShowOAuth(false)}
          oauth={oauth}
        />
      )}

      {/* OAuth Discovery Panel (shown on 401 auto-detection) */}
      {authDiscovery && oauth && (
        <OAuthDiscoveryPanel
          discovery={authDiscovery}
          isDiscovering={oauth.isDiscovering}
          error={oauth.error}
          isConfiguring={oauth.isLoading}
          onConfigure={async (params) => {
            return await oauth.configureFromDiscovery(params);
          }}
          onDismiss={() => {
            onDismissDiscovery?.();
          }}
        />
      )}

      {/* History Dropdown */}
      {showDropdown && (
        <div style={connectionBarStyles.dropdown}>
          {filteredHistory.map((entry, index) => {
            const isStdio = entry.transport === "stdio";
            const displayLabel = isStdio
              ? `stdio: ${entry.command ?? ""}${entry.args?.length ? " " + entry.args.join(" ") : ""}`
              : entry.url;
            const entryKey = isStdio
              ? `stdio:${entry.command}:${entry.args?.join(" ") ?? ""}`
              : entry.url;
            return (
              <div
                key={entryKey}
                style={{
                  ...connectionBarStyles.dropdownItem,
                  ...(hoveredIndex === index ? connectionBarStyles.dropdownItemHover : {}),
                }}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(-1)}
                onClick={() => handleSelectHistory(entry)}
              >
                {/* Transport / Protocol Badge */}
                {isStdio ? (
                  <span
                    style={{
                      ...connectionBarStyles.dropdownItemBadge,
                      backgroundColor: "rgba(255, 152, 0, 0.15)",
                      color: "#ff9800",
                    }}
                  >
                    stdio
                  </span>
                ) : (
                  entry.protocolType !== "mcp" && (
                    <span
                      style={{
                        ...connectionBarStyles.dropdownItemBadge,
                        ...(entry.protocolType === "chatgpt-apps"
                          ? connectionBarStyles.badgeChatgptApps
                          : connectionBarStyles.badgeMcpApps),
                      }}
                    >
                      {entry.protocolType === "chatgpt-apps" ? "ChatGPT" : "MCP Apps"}
                    </span>
                  )
                )}
                <span style={connectionBarStyles.dropdownItemUrl}>{displayLabel}</span>
                {entry.name && (
                  <span style={connectionBarStyles.dropdownItemName}>{entry.name}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Error Tooltip */}
      {error && !isFocused && (
        <div style={connectionBarStyles.errorTooltip as React.CSSProperties}>{error}</div>
      )}
    </div>
  );
}

export default ConnectionBar;
