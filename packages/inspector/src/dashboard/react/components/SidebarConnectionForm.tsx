/**
 * SidebarConnectionForm Component
 *
 * Inline connection form that appears at the top of the sidebar when
 * the "+" button is clicked. Allows connecting to MCP servers via HTTP or stdio.
 *
 * Features:
 * - Transport selector (HTTP / stdio dropdown)
 * - URL input for HTTP transport
 * - Command + Args inputs for stdio transport
 * - Connect and Cancel buttons
 * - Auto-hides after successful connection
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import type { ConnectionParams } from "@mcp-apps-kit/testing";

/** Entry in server history */
export interface ServerHistoryEntry {
  /** Display name (URL or command) */
  name: string;
  /** Connection params to restore */
  params: ConnectionParams;
}

export interface SidebarConnectionFormProps {
  /** Whether the form is visible */
  isOpen: boolean;
  /** Whether a connection is currently being created */
  isCreating?: boolean;
  /** Error message to display (if any) */
  error?: string | null;
  /** Callback when Connect button is clicked */
  onConnect: (params: ConnectionParams) => Promise<boolean>;
  /** Callback when Cancel button is clicked */
  onCancel: () => void;
  /** Previously connected servers for history dropdown */
  serverHistory?: ServerHistoryEntry[];
}

// Styles for the inline connection form
const formStyles: Record<string, React.CSSProperties> = {
  container: {
    padding: "0.75rem",
    backgroundColor: "#0a0a0a",
    borderBottom: "1px solid #1a1a1a",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  row: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  },
  label: {
    fontSize: "0.625rem",
    fontWeight: 500,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  select: {
    backgroundColor: "#111111",
    border: "1px solid #2d2f2f",
    borderRadius: "4px",
    color: "#e8e8e8",
    padding: "0.375rem 0.5rem",
    fontSize: "0.75rem",
    fontFamily: "inherit",
    outline: "none",
    cursor: "pointer",
    width: "100%",
  },
  input: {
    backgroundColor: "#111111",
    border: "1px solid #2d2f2f",
    borderRadius: "4px",
    color: "#e8e8e8",
    padding: "0.375rem 0.5rem",
    fontSize: "0.75rem",
    fontFamily: "inherit",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  inputFocused: {
    borderColor: "#ffffff",
    boxShadow: "0 0 0 1px rgba(255, 255, 255, 0.2)",
  },
  inputError: {
    borderColor: "#ef4444",
    boxShadow: "0 0 0 1px rgba(239, 68, 68, 0.2)",
  },
  buttonRow: {
    display: "flex",
    gap: "0.5rem",
    marginTop: "0.25rem",
  },
  connectButton: {
    flex: 1,
    backgroundColor: "#ffffff",
    border: "none",
    borderRadius: "4px",
    color: "#000000",
    padding: "0.5rem 0.75rem",
    fontSize: "0.75rem",
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  connectButtonDisabled: {
    backgroundColor: "#3d4040",
    color: "#6b7280",
    cursor: "not-allowed",
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "transparent",
    border: "1px solid #3d4040",
    borderRadius: "4px",
    color: "#9ca3af",
    padding: "0.5rem 0.75rem",
    fontSize: "0.75rem",
    fontWeight: 500,
    fontFamily: "inherit",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  errorMessage: {
    fontSize: "0.6875rem",
    color: "#ef4444",
    padding: "0.25rem 0",
    lineHeight: 1.4,
  },
  loadingSpinner: {
    width: "12px",
    height: "12px",
    border: "2px solid #3d4040",
    borderTopColor: "#000000",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    display: "inline-block",
    marginRight: "0.375rem",
  },
};

/**
 * SidebarConnectionForm - Inline form for connecting to MCP servers
 */
export function SidebarConnectionForm({
  isOpen,
  isCreating = false,
  error,
  onConnect,
  onCancel,
  serverHistory = [],
}: SidebarConnectionFormProps): React.ReactElement | null {
  // Form state
  const [transport, setTransport] = useState<"http" | "stdio">("http");
  const [url, setUrl] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  // Refs for focus management
  const urlInputRef = useRef<HTMLInputElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const historyDropdownRef = useRef<HTMLDivElement>(null);

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setTransport("http");
      setUrl("");
      setCommand("");
      setArgs("");
      setShowHistory(false);
      setUrlError(null);
      // Focus the appropriate input after a brief delay
      setTimeout(() => {
        urlInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Validate URL format when it changes
  useEffect(() => {
    if (transport !== "http" || !url.trim()) {
      setUrlError(null);
      return;
    }
    try {
      new URL(url.trim());
      setUrlError(null);
    } catch {
      setUrlError("Invalid URL format");
    }
  }, [url, transport]);

  // Handle selecting a history entry
  const handleSelectHistory = useCallback((entry: ServerHistoryEntry) => {
    const params = entry.params;
    if (params.transport === "http") {
      setTransport("http");
      setUrl(params.url);
      setCommand("");
      setArgs("");
    } else if (params.transport === "stdio") {
      setTransport("stdio");
      setUrl("");
      setCommand(params.command);
      setArgs(params.args?.join(" ") ?? "");
    }
    setShowHistory(false);
  }, []);

  // Close history dropdown when clicking outside
  useEffect(() => {
    if (!showHistory) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (historyDropdownRef.current && !historyDropdownRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showHistory]);

  // Focus command input when switching to stdio
  useEffect(() => {
    if (isOpen && transport === "stdio") {
      commandInputRef.current?.focus();
    } else if (isOpen && transport === "http") {
      urlInputRef.current?.focus();
    }
  }, [transport, isOpen]);

  // Determine if form can be submitted
  const canSubmit = transport === "http" ? !!url.trim() && !urlError : !!command.trim();

  /**
   * Parse a shell-style arguments string, respecting quoted strings.
   * Handles both single and double quotes.
   * Example: '--file "my file.txt" --flag' → ['--file', 'my file.txt', '--flag']
   */
  const parseShellArgs = useCallback((argsString: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuote: '"' | "'" | null = null;

    for (let i = 0; i < argsString.length; i++) {
      const char = argsString[i]!; // Safe: bounded by argsString.length

      if (inQuote) {
        // Inside a quoted string
        if (char === inQuote) {
          // End of quoted section
          inQuote = null;
        } else {
          current += char;
        }
      } else {
        // Outside quotes
        if (char === '"' || char === "'") {
          // Start of quoted section
          inQuote = char;
        } else if (/\s/.test(char)) {
          // Whitespace - end current token
          if (current) {
            result.push(current);
            current = "";
          }
        } else {
          current += char;
        }
      }
    }

    // Push final token if any
    if (current) {
      result.push(current);
    }

    return result;
  }, []);

  // Build connection params from form state
  const buildParams = useCallback((): ConnectionParams | null => {
    if (transport === "http") {
      const trimmedUrl = url.trim();
      if (!trimmedUrl) return null;
      // Validate URL format
      try {
        new URL(trimmedUrl);
      } catch {
        return null; // Invalid URL
      }
      return { transport: "http", url: trimmedUrl };
    }

    const trimmedCommand = command.trim();
    if (!trimmedCommand) return null;

    const params: ConnectionParams = {
      transport: "stdio",
      command: trimmedCommand,
    };

    const trimmedArgs = args.trim();
    if (trimmedArgs) {
      // Parse shell-style arguments, respecting quoted strings
      (params as Extract<ConnectionParams, { transport: "stdio" }>).args =
        parseShellArgs(trimmedArgs);
    }

    return params;
  }, [transport, url, command, args, parseShellArgs]);

  // Handle connect button click
  const handleConnect = useCallback(async () => {
    if (isCreating || !canSubmit) return;

    const params = buildParams();
    if (!params) return;

    const success = await onConnect(params);
    if (success) {
      // Form will be hidden by parent after successful connection
      // Reset state for next time
      setUrl("");
      setCommand("");
      setArgs("");
    }
  }, [isCreating, canSubmit, buildParams, onConnect]);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && canSubmit && !isCreating) {
        e.preventDefault();
        void handleConnect();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    },
    [canSubmit, isCreating, handleConnect, onCancel]
  );

  // Don't render if not open
  if (!isOpen) {
    return null;
  }

  return (
    <div style={formStyles.container} data-testid="sidebar-connection-form">
      {/* Inject keyframe animation for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Server history dropdown */}
      {serverHistory.length > 0 && (
        <div style={{ ...formStyles.row, position: "relative" }} ref={historyDropdownRef}>
          <label style={formStyles.label}>Recent Servers</label>
          <div
            style={{
              ...formStyles.select,
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
            onClick={() => setShowHistory(!showHistory)}
            data-testid="server-history-trigger"
          >
            <span style={{ color: "#6b7280" }}>Select from history...</span>
            <span style={{ fontSize: "0.625rem" }}>{showHistory ? "▴" : "▾"}</span>
          </div>
          {showHistory && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                backgroundColor: "#111111",
                border: "1px solid #2d2f2f",
                borderRadius: "4px",
                marginTop: "0.25rem",
                maxHeight: "150px",
                overflowY: "auto",
                zIndex: 100,
              }}
            >
              {serverHistory.map((entry, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "0.5rem",
                    fontSize: "0.75rem",
                    color: "#e8e8e8",
                    cursor: "pointer",
                    borderBottom: idx < serverHistory.length - 1 ? "1px solid #1a1a1a" : "none",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#1a1a1a";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                  onClick={() => handleSelectHistory(entry)}
                  data-testid={`server-history-item-${idx}`}
                >
                  <div style={{ fontWeight: 500 }}>{entry.name}</div>
                  <div style={{ fontSize: "0.625rem", color: "#6b7280", marginTop: "0.125rem" }}>
                    {entry.params.transport}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Transport selector */}
      <div style={formStyles.row}>
        <label style={formStyles.label}>Transport</label>
        <select
          style={formStyles.select}
          value={transport}
          onChange={(e) => setTransport(e.target.value as "http" | "stdio")}
          data-testid="transport-select"
        >
          <option value="http">HTTP</option>
          <option value="stdio">stdio</option>
        </select>
      </div>

      {/* Conditional inputs based on transport */}
      {transport === "http" ? (
        /* HTTP: URL input */
        <div style={formStyles.row}>
          <label style={formStyles.label}>URL</label>
          <input
            ref={urlInputRef}
            type="text"
            style={{
              ...formStyles.input,
              ...(focusedField === "url" ? formStyles.inputFocused : {}),
              ...(error || urlError ? formStyles.inputError : {}),
            }}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onFocus={() => setFocusedField("url")}
            onBlur={() => setFocusedField(null)}
            onKeyDown={handleKeyDown}
            placeholder="http://localhost:3000/mcp"
            data-testid="url-input"
          />
        </div>
      ) : (
        /* stdio: Command + Args inputs */
        <>
          <div style={formStyles.row}>
            <label style={formStyles.label}>Command</label>
            <input
              ref={commandInputRef}
              type="text"
              style={{
                ...formStyles.input,
                ...(focusedField === "command" ? formStyles.inputFocused : {}),
                ...(error ? formStyles.inputError : {}),
              }}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onFocus={() => setFocusedField("command")}
              onBlur={() => setFocusedField(null)}
              onKeyDown={handleKeyDown}
              placeholder="node"
              data-testid="command-input"
            />
          </div>
          <div style={formStyles.row}>
            <label style={formStyles.label}>Arguments</label>
            <input
              type="text"
              style={{
                ...formStyles.input,
                ...(focusedField === "args" ? formStyles.inputFocused : {}),
              }}
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              onFocus={() => setFocusedField("args")}
              onBlur={() => setFocusedField(null)}
              onKeyDown={handleKeyDown}
              placeholder="path/to/server.js --port 3000"
              data-testid="args-input"
            />
          </div>
        </>
      )}

      {/* Error message */}
      {(error || urlError) && (
        <div style={formStyles.errorMessage} data-testid="connection-error">
          {error || urlError}
        </div>
      )}

      {/* Action buttons */}
      <div style={formStyles.buttonRow}>
        <button
          style={{
            ...formStyles.connectButton,
            ...(!canSubmit || isCreating ? formStyles.connectButtonDisabled : {}),
          }}
          onClick={() => void handleConnect()}
          disabled={!canSubmit || isCreating}
          data-testid="connect-button"
        >
          {isCreating ? (
            <>
              <span style={formStyles.loadingSpinner} />
              Connecting...
            </>
          ) : (
            "Connect"
          )}
        </button>
        <button
          style={formStyles.cancelButton}
          onClick={onCancel}
          disabled={isCreating}
          data-testid="cancel-button"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default SidebarConnectionForm;
