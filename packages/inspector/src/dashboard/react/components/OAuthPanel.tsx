/**
 * OAuthPanel Component
 *
 * Popover panel for configuring OAuth on a connection.
 * Shows client_id, client_secret, scopes fields and an Authenticate button.
 * Displays auth status and token expiry when authenticated.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import type { UseOAuthResult } from "../hooks/useOAuth";

// =============================================================================
// STYLES
// =============================================================================

const oauthPanelStyles: Record<string, React.CSSProperties> = {
  popover: {
    position: "absolute",
    backgroundColor: "#1e1e1e",
    border: "1px solid #444",
    borderRadius: "8px",
    boxShadow: "0 10px 28px rgba(0, 0, 0, 0.5)",
    padding: "16px",
    zIndex: 1000,
    minWidth: "340px",
    maxWidth: "420px",
  },
  content: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.75rem",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "0.25rem",
  },
  title: {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "#e8e8e8",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  field: {
    display: "flex",
    flexDirection: "column" as const,
  },
  label: {
    fontSize: "0.625rem",
    color: "#6b7280",
    marginBottom: "0.125rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    fontWeight: 500,
  },
  input: {
    backgroundColor: "#111111",
    border: "1px solid #2d2f2f",
    borderRadius: "6px",
    color: "#e8e8e8",
    padding: "0.375rem 0.5rem",
    fontSize: "0.75rem",
    fontFamily: "inherit",
    outline: "none",
  },
  hint: {
    fontSize: "0.5625rem",
    color: "#4b5563",
    marginTop: "0.125rem",
  },
  button: {
    fontFamily: "inherit",
    backgroundColor: "#20b2aa",
    border: "none",
    borderRadius: "6px",
    color: "#ffffff",
    padding: "0.5rem 1rem",
    fontSize: "0.75rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "background-color 0.15s ease, opacity 0.15s ease",
    textAlign: "center" as const,
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  revokeButton: {
    fontFamily: "inherit",
    backgroundColor: "transparent",
    border: "1px solid #ef4444",
    borderRadius: "6px",
    color: "#ef4444",
    padding: "0.375rem 0.75rem",
    fontSize: "0.6875rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  statusSection: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.5rem",
    padding: "0.5rem",
    backgroundColor: "#111111",
    borderRadius: "6px",
    border: "1px solid #2d2f2f",
  },
  statusRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
  },
  statusLabel: {
    fontSize: "0.625rem",
    color: "#6b7280",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    fontWeight: 500,
  },
  statusBadge: {
    fontSize: "0.625rem",
    padding: "0.125rem 0.375rem",
    borderRadius: "4px",
    fontWeight: 600,
    textTransform: "uppercase" as const,
  },
  statusUnauthenticated: {
    backgroundColor: "rgba(107, 114, 128, 0.15)",
    color: "#6b7280",
  },
  statusAuthenticating: {
    backgroundColor: "rgba(255, 152, 0, 0.15)",
    color: "#ff9800",
  },
  statusAuthenticated: {
    backgroundColor: "rgba(32, 178, 170, 0.15)",
    color: "#20b2aa",
  },
  statusError: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    color: "#ef4444",
  },
  statusValue: {
    fontSize: "0.6875rem",
    color: "#e8e8e8",
  },
  error: {
    fontSize: "0.6875rem",
    color: "#ef4444",
    padding: "0.375rem 0.5rem",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: "4px",
  },
  divider: {
    height: "1px",
    backgroundColor: "#2d2f2f",
    margin: "0.25rem 0",
  },
  actions: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
  },
  scopeChipsContainer: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.375rem",
  },
  scopeChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.25rem 0.5rem",
    borderRadius: "4px",
    fontSize: "0.6875rem",
    fontFamily: "inherit",
    fontWeight: 500,
    cursor: "pointer",
    border: "1px solid #2d2f2f",
    backgroundColor: "#111111",
    color: "#9ca3af",
    transition: "all 0.15s ease",
    userSelect: "none" as const,
  },
  scopeChipSelected: {
    backgroundColor: "rgba(32, 178, 170, 0.15)",
    borderColor: "#20b2aa",
    color: "#20b2aa",
  },
  scopeCustomRow: {
    display: "flex",
    gap: "0.375rem",
    alignItems: "center",
    marginTop: "0.25rem",
  },
  scopeCustomInput: {
    flex: 1,
    backgroundColor: "#111111",
    border: "1px solid #2d2f2f",
    borderRadius: "6px",
    color: "#e8e8e8",
    padding: "0.25rem 0.5rem",
    fontSize: "0.6875rem",
    fontFamily: "inherit",
    outline: "none",
  },
  scopeAddButton: {
    fontFamily: "inherit",
    backgroundColor: "#20b2aa",
    border: "none",
    borderRadius: "4px",
    color: "#ffffff",
    padding: "0.25rem 0.5rem",
    fontSize: "0.6875rem",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
};

// =============================================================================
// HELPERS
// =============================================================================

function formatExpiry(expiresAt: number | undefined): string {
  if (!expiresAt) return "Unknown";
  const now = Date.now();
  const diff = expiresAt - now;
  if (diff <= 0) return "Expired";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m remaining`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m remaining`;
  return `${Math.floor(hours / 24)}d remaining`;
}

function getStatusBadgeStyle(status: string): React.CSSProperties {
  switch (status) {
    case "authenticated":
      return oauthPanelStyles.statusAuthenticated;
    case "authenticating":
      return oauthPanelStyles.statusAuthenticating;
    case "error":
      return oauthPanelStyles.statusError;
    default:
      return oauthPanelStyles.statusUnauthenticated;
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export interface OAuthPanelProps {
  /** Whether the panel is visible */
  isOpen: boolean;
  /** Anchor element ref for positioning */
  anchorRef: React.RefObject<HTMLElement>;
  /** Container element ref for boundary calculations */
  containerRef: React.RefObject<HTMLElement>;
  /** Close the panel */
  onClose: () => void;
  /** OAuth hook result */
  oauth: UseOAuthResult;
}

/**
 * OAuth configuration and status popover panel.
 *
 * - When unauthenticated: shows config fields + Authenticate button.
 * - When authenticating: shows status + link to auth URL.
 * - When authenticated: shows status + token expiry + Revoke button.
 */
export function OAuthPanel({
  isOpen,
  anchorRef,
  containerRef,
  onClose,
  oauth,
}: OAuthPanelProps): React.ReactElement | null {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<React.CSSProperties>({});
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [scopes, setScopes] = useState("");
  const [customScopeInput, setCustomScopeInput] = useState("");

  const { oauthState, isConfigured, authorizationUrl, isLoading, error, configure, revoke } = oauth;

  const supportedScopes = oauthState?.supportedScopes;
  const hasSupportedScopes = Array.isArray(supportedScopes) && supportedScopes.length > 0;

  // Parse current scopes string into a Set for quick lookups
  const selectedScopesSet = new Set(
    scopes
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
  );

  const toggleScope = useCallback(
    (scope: string) => {
      const current = new Set(
        scopes
          .split(/\s+/)
          .map((s) => s.trim())
          .filter(Boolean)
      );
      if (current.has(scope)) {
        current.delete(scope);
      } else {
        current.add(scope);
      }
      setScopes(Array.from(current).join(" "));
    },
    [scopes]
  );

  const addCustomScope = useCallback(() => {
    const trimmed = customScopeInput.trim();
    if (!trimmed) return;
    const current = new Set(
      scopes
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean)
    );
    current.add(trimmed);
    setScopes(Array.from(current).join(" "));
    setCustomScopeInput("");
  }, [customScopeInput, scopes]);

  const status = oauthState?.status ?? "unauthenticated";
  const isAuthenticated = status === "authenticated";
  const isAuthenticating = status === "authenticating";

  // Position the popover below the anchor, right-aligned
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

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, anchorRef]);

  const handleAuthenticate = useCallback(async () => {
    const url = await configure({ clientId, clientSecret, scopes });
    // If there's an auth URL, open it in a new tab
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, [configure, clientId, clientSecret, scopes]);

  const handleRevoke = useCallback(async () => {
    await revoke();
  }, [revoke]);

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      style={{ ...oauthPanelStyles.popover, ...position }}
      data-testid="oauth-panel"
    >
      <div style={oauthPanelStyles.content}>
        {/* Header */}
        <div style={oauthPanelStyles.header}>
          <span style={oauthPanelStyles.title}>OAuth Configuration</span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#6b7280",
              cursor: "pointer",
              fontSize: "14px",
              padding: "2px",
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Status Section (always shown when configured) */}
        {isConfigured && oauthState && (
          <>
            <div style={oauthPanelStyles.statusSection}>
              <div style={oauthPanelStyles.statusRow}>
                <span style={oauthPanelStyles.statusLabel}>Status</span>
                <span
                  style={{
                    ...oauthPanelStyles.statusBadge,
                    ...getStatusBadgeStyle(status),
                  }}
                  data-testid="oauth-status-badge"
                >
                  {status}
                </span>
              </div>

              {isAuthenticated && oauthState.expiresAt && (
                <div style={oauthPanelStyles.statusRow}>
                  <span style={oauthPanelStyles.statusLabel}>Token Expiry</span>
                  <span style={oauthPanelStyles.statusValue}>
                    {formatExpiry(oauthState.expiresAt)}
                  </span>
                </div>
              )}

              {oauthState.grantedScopes && (
                <div style={oauthPanelStyles.statusRow}>
                  <span style={oauthPanelStyles.statusLabel}>Scopes</span>
                  <span style={oauthPanelStyles.statusValue}>{oauthState.grantedScopes}</span>
                </div>
              )}

              {oauthState.errorMessage && (
                <div style={oauthPanelStyles.error}>{oauthState.errorMessage}</div>
              )}
            </div>

            {/* Auth URL link when authenticating */}
            {isAuthenticating && authorizationUrl && (
              <a
                href={authorizationUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: "0.6875rem",
                  color: "#20b2aa",
                  textDecoration: "underline",
                }}
              >
                Open authorization page →
              </a>
            )}

            <div style={oauthPanelStyles.divider} />
          </>
        )}

        {/* Config fields — hidden when authenticated */}
        {!isAuthenticated && (
          <>
            <div style={oauthPanelStyles.field}>
              <label style={oauthPanelStyles.label}>Client ID</label>
              <input
                type="text"
                style={oauthPanelStyles.input}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="(empty = Dynamic Client Registration)"
                data-testid="oauth-client-id"
              />
              <span style={oauthPanelStyles.hint}>
                Leave empty to use Dynamic Client Registration (RFC 7591)
              </span>
            </div>

            <div style={oauthPanelStyles.field}>
              <label style={oauthPanelStyles.label}>Client Secret</label>
              <input
                type="password"
                style={oauthPanelStyles.input}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="(optional)"
                data-testid="oauth-client-secret"
              />
            </div>

            <div style={oauthPanelStyles.field}>
              <label style={oauthPanelStyles.label}>Scopes</label>
              {hasSupportedScopes ? (
                <>
                  <div style={oauthPanelStyles.scopeChipsContainer} data-testid="oauth-scope-chips">
                    {supportedScopes.map((scope) => {
                      const isSelected = selectedScopesSet.has(scope);
                      return (
                        <button
                          key={scope}
                          type="button"
                          style={{
                            ...oauthPanelStyles.scopeChip,
                            ...(isSelected ? oauthPanelStyles.scopeChipSelected : {}),
                          }}
                          onClick={() => toggleScope(scope)}
                          data-testid={`oauth-scope-chip-${scope}`}
                          aria-pressed={isSelected}
                        >
                          <span>{isSelected ? "✓" : "+"}</span>
                          {scope}
                        </button>
                      );
                    })}
                    {/* Render chips for custom scopes not in the discovered list */}
                    {Array.from(selectedScopesSet)
                      .filter((s) => !supportedScopes.includes(s))
                      .map((scope) => (
                        <button
                          key={scope}
                          type="button"
                          style={{
                            ...oauthPanelStyles.scopeChip,
                            ...oauthPanelStyles.scopeChipSelected,
                          }}
                          onClick={() => toggleScope(scope)}
                          data-testid={`oauth-scope-chip-${scope}`}
                          aria-pressed={true}
                        >
                          <span>✓</span>
                          {scope}
                        </button>
                      ))}
                  </div>
                  <div style={oauthPanelStyles.scopeCustomRow}>
                    <input
                      type="text"
                      style={oauthPanelStyles.scopeCustomInput}
                      value={customScopeInput}
                      onChange={(e) => setCustomScopeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCustomScope();
                        }
                      }}
                      placeholder="Add custom scope…"
                      data-testid="oauth-scope-custom-input"
                    />
                    <button
                      type="button"
                      style={oauthPanelStyles.scopeAddButton}
                      onClick={addCustomScope}
                      data-testid="oauth-scope-add-btn"
                    >
                      Add
                    </button>
                  </div>
                  <span style={oauthPanelStyles.hint}>
                    Click scopes to toggle. Add custom scopes below.
                  </span>
                </>
              ) : (
                <input
                  type="text"
                  style={oauthPanelStyles.input}
                  value={scopes}
                  onChange={(e) => setScopes(e.target.value)}
                  placeholder="e.g. read write openid"
                  data-testid="oauth-scopes"
                />
              )}
            </div>

            <button
              type="button"
              style={{
                ...oauthPanelStyles.button,
                ...(isLoading ? oauthPanelStyles.buttonDisabled : {}),
              }}
              onClick={() => void handleAuthenticate()}
              disabled={isLoading}
              data-testid="oauth-authenticate-btn"
            >
              {isLoading ? "Configuring..." : isAuthenticating ? "Re-authenticate" : "Authenticate"}
            </button>
          </>
        )}

        {/* Revoke button when authenticated */}
        {isAuthenticated && (
          <div style={oauthPanelStyles.actions}>
            <button
              type="button"
              style={{
                ...oauthPanelStyles.revokeButton,
                ...(isLoading ? oauthPanelStyles.buttonDisabled : {}),
              }}
              onClick={() => void handleRevoke()}
              disabled={isLoading}
              data-testid="oauth-revoke-btn"
            >
              {isLoading ? "Revoking..." : "Revoke Tokens"}
            </button>
          </div>
        )}

        {/* Error display */}
        {error && <div style={oauthPanelStyles.error}>{error}</div>}
      </div>
    </div>
  );
}

export default OAuthPanel;
