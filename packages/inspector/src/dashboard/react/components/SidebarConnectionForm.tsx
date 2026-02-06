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
}: SidebarConnectionFormProps): React.ReactElement | null {
  // Form state
  const [transport, setTransport] = useState<"http" | "stdio">("http");
  const [url, setUrl] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Refs for focus management
  const urlInputRef = useRef<HTMLInputElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setTransport("http");
      setUrl("");
      setCommand("");
      setArgs("");
      // Focus the appropriate input after a brief delay
      setTimeout(() => {
        urlInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Focus command input when switching to stdio
  useEffect(() => {
    if (isOpen && transport === "stdio") {
      commandInputRef.current?.focus();
    } else if (isOpen && transport === "http") {
      urlInputRef.current?.focus();
    }
  }, [transport, isOpen]);

  // Determine if form can be submitted
  const canSubmit = transport === "http" ? !!url.trim() : !!command.trim();

  // Build connection params from form state
  const buildParams = useCallback((): ConnectionParams | null => {
    if (transport === "http") {
      const trimmedUrl = url.trim();
      if (!trimmedUrl) return null;
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
      // Split by whitespace, respecting quoted strings
      (params as Extract<ConnectionParams, { transport: "stdio" }>).args = trimmedArgs.split(/\s+/);
    }

    return params;
  }, [transport, url, command, args]);

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
              ...(error ? formStyles.inputError : {}),
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
      {error && (
        <div style={formStyles.errorMessage} data-testid="connection-error">
          {error}
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
