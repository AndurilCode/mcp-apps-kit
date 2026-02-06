/**
 * SidebarConnectionForm Component
 *
 * Vertical-layout connection form for the sidebar.
 * Reformatted version of ConnectionBar optimized for vertical space.
 *
 * Features:
 * - Transport selector (HTTP / stdio)
 * - URL input for HTTP transport
 * - Command + Args inputs for stdio transport
 * - Collapsible OAuth settings section
 * - Connect/Cancel actions
 */

import React, { useState, useCallback, useEffect } from "react";
import type { ConnectionParams } from "@mcp-apps-kit/testing";

// =============================================================================
// Types
// =============================================================================

export interface SidebarConnectionFormProps {
  /** Callback when form is submitted */
  onConnect: (params: ConnectionParams) => void;
  /** Callback when form is cancelled */
  onCancel: () => void;
  /** Whether connection is in progress */
  isConnecting?: boolean;
}

// Extended params that include OAuth fields (for HTTP connections)
interface ExtendedHttpParams {
  transport: "http";
  url: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
  oauthScopes?: string;
}

// =============================================================================
// Helpers
// =============================================================================

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

// =============================================================================
// Styles
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    padding: "1rem",
    backgroundColor: "#0d0e0e",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  label: {
    fontSize: "0.625rem",
    fontWeight: 600,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  transportSelector: {
    display: "flex",
    gap: "0.5rem",
  },
  transportOption: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    padding: "0.5rem 0.75rem",
    backgroundColor: "#111111",
    border: "1px solid #2d2f2f",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "all 0.15s ease",
    flex: 1,
    justifyContent: "center",
  },
  transportOptionSelected: {
    borderColor: "#ffffff",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  transportRadio: {
    width: "14px",
    height: "14px",
    accentColor: "#ffffff",
    cursor: "pointer",
  },
  transportLabel: {
    fontSize: "0.75rem",
    fontWeight: 500,
    color: "#e8e8e8",
    cursor: "pointer",
  },
  input: {
    backgroundColor: "#111111",
    border: "1px solid #2d2f2f",
    borderRadius: "6px",
    color: "#e8e8e8",
    padding: "0.5rem 0.75rem",
    fontSize: "0.8125rem",
    fontFamily: "inherit",
    outline: "none",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
    width: "100%",
    boxSizing: "border-box",
  },
  inputFocus: {
    borderColor: "#ffffff",
    boxShadow: "0 0 0 2px rgba(255, 255, 255, 0.1)",
  },
  textarea: {
    backgroundColor: "#111111",
    border: "1px solid #2d2f2f",
    borderRadius: "6px",
    color: "#e8e8e8",
    padding: "0.5rem 0.75rem",
    fontSize: "0.75rem",
    fontFamily: "inherit",
    outline: "none",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
    width: "100%",
    boxSizing: "border-box",
    resize: "vertical",
    minHeight: "2.5rem",
    maxHeight: "5rem",
  },
  collapsibleHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.5rem 0.75rem",
    backgroundColor: "#111111",
    border: "1px solid #2d2f2f",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  collapsibleHeaderOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottom: "none",
  },
  collapsibleTitle: {
    fontSize: "0.6875rem",
    fontWeight: 500,
    color: "#9ca3af",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  collapsibleIcon: {
    fontSize: "0.5rem",
    color: "#6b7280",
    transition: "transform 0.2s ease",
  },
  collapsibleIconOpen: {
    transform: "rotate(180deg)",
  },
  collapsibleContent: {
    backgroundColor: "#111111",
    border: "1px solid #2d2f2f",
    borderTop: "none",
    borderBottomLeftRadius: "6px",
    borderBottomRightRadius: "6px",
    padding: "0.75rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  buttonRow: {
    display: "flex",
    gap: "0.5rem",
    marginTop: "0.5rem",
  },
  button: {
    flex: 1,
    padding: "0.625rem 1rem",
    borderRadius: "6px",
    fontSize: "0.75rem",
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: "pointer",
    transition: "all 0.15s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
  },
  connectButton: {
    backgroundColor: "#ffffff",
    border: "none",
    color: "#000000",
  },
  connectButtonDisabled: {
    backgroundColor: "#3d4040",
    color: "#6b7280",
    cursor: "not-allowed",
  },
  cancelButton: {
    backgroundColor: "transparent",
    border: "1px solid #3d4040",
    color: "#9ca3af",
  },
  spinner: {
    width: "14px",
    height: "14px",
    border: "2px solid rgba(0, 0, 0, 0.2)",
    borderTopColor: "#000000",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  fieldHint: {
    fontSize: "0.625rem",
    color: "#4b5563",
    marginTop: "0.125rem",
  },
};

// =============================================================================
// Component
// =============================================================================

export function SidebarConnectionForm({
  onConnect,
  onCancel,
  isConnecting = false,
}: SidebarConnectionFormProps): React.ReactElement {
  // Transport selection
  const [transport, setTransport] = useState<"http" | "stdio">("http");

  // HTTP fields
  const [url, setUrl] = useState("");

  // stdio fields
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [envVars, setEnvVars] = useState("");
  const [cwd, setCwd] = useState("");

  // OAuth fields (HTTP only)
  const [showOAuthSettings, setShowOAuthSettings] = useState(false);
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const [oauthScopes, setOauthScopes] = useState("");

  // Advanced settings for stdio
  const [showAdvancedStdio, setShowAdvancedStdio] = useState(false);

  // Focus state for inputs
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  // Reset form when transport changes
  useEffect(() => {
    setShowOAuthSettings(false);
    setShowAdvancedStdio(false);
  }, [transport]);

  // Check if form can be submitted
  const canSubmit = transport === "http" ? !!url.trim() : !!command.trim();

  // Build connection params
  const buildParams = useCallback((): ConnectionParams | null => {
    if (transport === "http") {
      const trimmedUrl = url.trim();
      if (!trimmedUrl) return null;

      const params: ExtendedHttpParams = { transport: "http", url: trimmedUrl };
      if (oauthClientId.trim()) params.oauthClientId = oauthClientId.trim();
      if (oauthClientSecret.trim()) params.oauthClientSecret = oauthClientSecret.trim();
      if (oauthScopes.trim()) params.oauthScopes = oauthScopes.trim();
      return params as ConnectionParams;
    }

    const trimmedCommand = command.trim();
    if (!trimmedCommand) return null;

    return {
      transport: "stdio",
      command: trimmedCommand,
      ...(args.trim() ? { args: args.trim().split(/\s+/) } : {}),
      ...(() => {
        const env = parseEnvString(envVars);
        return env ? { env } : {};
      })(),
      ...(cwd.trim() ? { cwd: cwd.trim() } : {}),
    };
  }, [transport, url, command, args, envVars, cwd, oauthClientId, oauthClientSecret, oauthScopes]);

  // Handle form submission
  const handleSubmit = useCallback(() => {
    if (isConnecting || !canSubmit) return;
    const params = buildParams();
    if (params) {
      onConnect(params);
    }
  }, [isConnecting, canSubmit, buildParams, onConnect]);

  // Handle Enter key in inputs
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && canSubmit && !isConnecting) {
        handleSubmit();
      } else if (e.key === "Escape") {
        onCancel();
      }
    },
    [canSubmit, isConnecting, handleSubmit, onCancel]
  );

  // Input style with focus state
  const getInputStyle = (inputName: string): React.CSSProperties => ({
    ...styles.input,
    ...(focusedInput === inputName ? styles.inputFocus : {}),
  });

  const getTextareaStyle = (inputName: string): React.CSSProperties => ({
    ...styles.textarea,
    ...(focusedInput === inputName ? styles.inputFocus : {}),
  });

  return (
    <div style={styles.container}>
      {/* Keyframe animation for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Transport Selector */}
      <div style={styles.section}>
        <span style={styles.label}>Transport</span>
        <div style={styles.transportSelector}>
          <label
            style={{
              ...styles.transportOption,
              ...(transport === "http" ? styles.transportOptionSelected : {}),
            }}
          >
            <input
              type="radio"
              name="transport"
              value="http"
              checked={transport === "http"}
              onChange={() => setTransport("http")}
              style={styles.transportRadio}
            />
            <span style={styles.transportLabel}>HTTP</span>
          </label>
          <label
            style={{
              ...styles.transportOption,
              ...(transport === "stdio" ? styles.transportOptionSelected : {}),
            }}
          >
            <input
              type="radio"
              name="transport"
              value="stdio"
              checked={transport === "stdio"}
              onChange={() => setTransport("stdio")}
              style={styles.transportRadio}
            />
            <span style={styles.transportLabel}>stdio</span>
          </label>
        </div>
      </div>

      {/* HTTP Fields */}
      {transport === "http" && (
        <>
          <div style={styles.section}>
            <label style={styles.label} htmlFor="sidebar-url">
              Server URL
            </label>
            <input
              id="sidebar-url"
              type="text"
              style={getInputStyle("url")}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onFocus={() => setFocusedInput("url")}
              onBlur={() => setFocusedInput(null)}
              onKeyDown={handleKeyDown}
              placeholder="https://example.com/mcp"
              autoFocus
            />
          </div>

          {/* OAuth Settings (collapsible) */}
          <div style={styles.section}>
            <div
              style={{
                ...styles.collapsibleHeader,
                ...(showOAuthSettings ? styles.collapsibleHeaderOpen : {}),
              }}
              onClick={() => setShowOAuthSettings(!showOAuthSettings)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setShowOAuthSettings(!showOAuthSettings);
                }
              }}
            >
              <span style={styles.collapsibleTitle}>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                </svg>
                OAuth Settings
              </span>
              <span
                style={{
                  ...styles.collapsibleIcon,
                  ...(showOAuthSettings ? styles.collapsibleIconOpen : {}),
                }}
              >
                ▼
              </span>
            </div>
            {showOAuthSettings && (
              <div style={styles.collapsibleContent}>
                <div>
                  <label style={styles.label} htmlFor="sidebar-oauth-client-id">
                    Client ID
                  </label>
                  <input
                    id="sidebar-oauth-client-id"
                    type="text"
                    style={getInputStyle("oauthClientId")}
                    value={oauthClientId}
                    onChange={(e) => setOauthClientId(e.target.value)}
                    onFocus={() => setFocusedInput("oauthClientId")}
                    onBlur={() => setFocusedInput(null)}
                    placeholder="(optional — auto-registers if empty)"
                  />
                </div>
                <div>
                  <label style={styles.label} htmlFor="sidebar-oauth-client-secret">
                    Client Secret
                  </label>
                  <input
                    id="sidebar-oauth-client-secret"
                    type="password"
                    style={getInputStyle("oauthClientSecret")}
                    value={oauthClientSecret}
                    onChange={(e) => setOauthClientSecret(e.target.value)}
                    onFocus={() => setFocusedInput("oauthClientSecret")}
                    onBlur={() => setFocusedInput(null)}
                    placeholder="(optional)"
                  />
                </div>
                <div>
                  <label style={styles.label} htmlFor="sidebar-oauth-scopes">
                    Scopes
                  </label>
                  <input
                    id="sidebar-oauth-scopes"
                    type="text"
                    style={getInputStyle("oauthScopes")}
                    value={oauthScopes}
                    onChange={(e) => setOauthScopes(e.target.value)}
                    onFocus={() => setFocusedInput("oauthScopes")}
                    onBlur={() => setFocusedInput(null)}
                    placeholder="e.g. read write openid"
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* stdio Fields */}
      {transport === "stdio" && (
        <>
          <div style={styles.section}>
            <label style={styles.label} htmlFor="sidebar-command">
              Command
            </label>
            <input
              id="sidebar-command"
              type="text"
              style={getInputStyle("command")}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onFocus={() => setFocusedInput("command")}
              onBlur={() => setFocusedInput(null)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. node, python, npx"
              autoFocus
            />
          </div>

          <div style={styles.section}>
            <label style={styles.label} htmlFor="sidebar-args">
              Arguments
            </label>
            <input
              id="sidebar-args"
              type="text"
              style={getInputStyle("args")}
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              onFocus={() => setFocusedInput("args")}
              onBlur={() => setFocusedInput(null)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. server.js --port 3000"
            />
            <span style={styles.fieldHint}>Space-separated list of arguments</span>
          </div>

          {/* Advanced stdio Settings (collapsible) */}
          <div style={styles.section}>
            <div
              style={{
                ...styles.collapsibleHeader,
                ...(showAdvancedStdio ? styles.collapsibleHeaderOpen : {}),
              }}
              onClick={() => setShowAdvancedStdio(!showAdvancedStdio)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setShowAdvancedStdio(!showAdvancedStdio);
                }
              }}
            >
              <span style={styles.collapsibleTitle}>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                </svg>
                Advanced Settings
              </span>
              <span
                style={{
                  ...styles.collapsibleIcon,
                  ...(showAdvancedStdio ? styles.collapsibleIconOpen : {}),
                }}
              >
                ▼
              </span>
            </div>
            {showAdvancedStdio && (
              <div style={styles.collapsibleContent}>
                <div>
                  <label style={styles.label} htmlFor="sidebar-env">
                    Environment Variables
                  </label>
                  <textarea
                    id="sidebar-env"
                    style={getTextareaStyle("env")}
                    value={envVars}
                    onChange={(e) => setEnvVars(e.target.value)}
                    onFocus={() => setFocusedInput("env")}
                    onBlur={() => setFocusedInput(null)}
                    placeholder="KEY=value, KEY2=value2"
                    rows={2}
                  />
                  <span style={styles.fieldHint}>Comma or newline separated KEY=value pairs</span>
                </div>
                <div>
                  <label style={styles.label} htmlFor="sidebar-cwd">
                    Working Directory
                  </label>
                  <input
                    id="sidebar-cwd"
                    type="text"
                    style={getInputStyle("cwd")}
                    value={cwd}
                    onChange={(e) => setCwd(e.target.value)}
                    onFocus={() => setFocusedInput("cwd")}
                    onBlur={() => setFocusedInput(null)}
                    placeholder="/path/to/project"
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Action Buttons */}
      <div style={styles.buttonRow}>
        <button
          type="button"
          style={{
            ...styles.button,
            ...styles.cancelButton,
          }}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          style={{
            ...styles.button,
            ...styles.connectButton,
            ...(!canSubmit || isConnecting ? styles.connectButtonDisabled : {}),
          }}
          onClick={handleSubmit}
          disabled={!canSubmit || isConnecting}
        >
          {isConnecting ? (
            <>
              <div style={styles.spinner} />
              Connecting...
            </>
          ) : (
            <>
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
              Connect
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default SidebarConnectionForm;
