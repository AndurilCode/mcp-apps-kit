/**
 * OAuthDiscoveryPanel Component
 *
 * Shown when `authRequired` fires after a connection attempt to an
 * OAuth-protected MCP server. Displays discovery results and provides
 * one-click auth (DCR) or manual credential entry (pre-registration).
 */

import React, { useState, useCallback } from "react";
import type { AuthRequiredEvent } from "../../../oauth/discovery";

// =============================================================================
// STYLES
// =============================================================================

const discoveryStyles = {
  container: {
    backgroundColor: "#1e1e1e",
    border: "1px solid #444",
    borderRadius: "8px",
    boxShadow: "0 10px 28px rgba(0, 0, 0, 0.5)",
    padding: "16px",
    minWidth: "340px",
    maxWidth: "480px",
    marginTop: "8px",
  },
  content: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.75rem",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.25rem",
  },
  title: {
    fontSize: "0.8125rem",
    fontWeight: 600,
    color: "#e8e8e8",
  },
  serverUrl: {
    fontSize: "0.6875rem",
    color: "#6b7280",
    wordBreak: "break-all" as const,
  },
  infoBox: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.375rem",
    padding: "0.5rem",
    backgroundColor: "#111111",
    borderRadius: "6px",
    border: "1px solid #2d2f2f",
  },
  infoRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
  },
  infoLabel: {
    fontSize: "0.625rem",
    color: "#6b7280",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    fontWeight: 500,
  },
  infoValue: {
    fontSize: "0.6875rem",
    color: "#e8e8e8",
    wordBreak: "break-all" as const,
  },
  badge: {
    fontSize: "0.625rem",
    padding: "0.125rem 0.375rem",
    borderRadius: "4px",
    fontWeight: 600,
    textTransform: "uppercase" as const,
  },
  badgeDCR: {
    backgroundColor: "rgba(32, 178, 170, 0.15)",
    color: "#20b2aa",
  },
  badgePreReg: {
    backgroundColor: "rgba(255, 152, 0, 0.15)",
    color: "#ff9800",
  },
  message: {
    fontSize: "0.75rem",
    color: "#9ca3af",
    lineHeight: 1.4,
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
  secondaryButton: {
    fontFamily: "inherit",
    backgroundColor: "transparent",
    border: "1px solid #444",
    borderRadius: "6px",
    color: "#9ca3af",
    padding: "0.375rem 0.75rem",
    fontSize: "0.6875rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s ease",
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
  loading: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "1rem",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: "0.75rem",
    color: "#9ca3af",
  },
  scopeChipsContainer: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.375rem",
    marginTop: "0.25rem",
  },
  scopeChip: {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.25rem 0.5rem",
    borderRadius: "4px",
    fontSize: "0.6875rem",
    fontFamily: "inherit",
    fontWeight: 500,
    backgroundColor: "rgba(32, 178, 170, 0.15)",
    border: "1px solid rgba(32, 178, 170, 0.3)",
    color: "#20b2aa",
  },
  advancedToggle: {
    fontSize: "0.6875rem",
    color: "#6b7280",
    cursor: "pointer",
    background: "none",
    border: "none",
    fontFamily: "inherit",
    padding: "0.25rem 0",
    textAlign: "left" as const,
  },
  actions: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
  },
} satisfies Record<string, React.CSSProperties>;

// =============================================================================
// TYPES
// =============================================================================

export interface OAuthDiscoveryPanelProps {
  /** Discovery results from 401 auto-detection */
  discovery: AuthRequiredEvent | null;
  /** Whether discovery is in progress */
  isDiscovering: boolean;
  /** Error from discovery or configuration */
  error: string | null;
  /** Whether configure request is in flight */
  isConfiguring: boolean;
  /** Configure OAuth from discovery results + optional overrides. Returns auth URL. */
  onConfigure: (params: {
    clientId?: string;
    clientSecret?: string;
    scopes?: string;
    enableDynamicRegistration?: boolean;
  }) => Promise<string | null>;
  /** Dismiss the panel (go to manual config) */
  onDismiss: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * OAuth Discovery Panel
 *
 * Renders contextual auth UI based on server discovery results:
 * - DCR mode: one-click authorize with auto-registration
 * - Pre-registration mode: form for client credentials
 * - Loading state: during discovery
 * - Error state: when discovery fails
 */
export function OAuthDiscoveryPanel({
  discovery,
  isDiscovering,
  error,
  isConfiguring,
  onConfigure,
  onDismiss,
}: OAuthDiscoveryPanelProps): React.ReactElement {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [scopesOverride, setScopesOverride] = useState("");

  // Pre-fill scopes from discovery
  const suggestedScopes = discovery?.suggestedScopes?.join(" ") ?? "";
  const effectiveScopes = scopesOverride || suggestedScopes;

  const handleDCRAuthorize = useCallback(async () => {
    const url = await onConfigure({
      enableDynamicRegistration: true,
      scopes: effectiveScopes || undefined,
      // Allow advanced overrides for DCR too
      ...(showAdvanced && clientId ? { clientId } : {}),
    });
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, [onConfigure, effectiveScopes, showAdvanced, clientId]);

  const handlePreRegAuthorize = useCallback(async () => {
    const url = await onConfigure({
      clientId,
      clientSecret: clientSecret || undefined,
      scopes: effectiveScopes || undefined,
      enableDynamicRegistration: false,
    });
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, [onConfigure, clientId, clientSecret, effectiveScopes]);

  // Loading state
  if (isDiscovering) {
    return (
      <div style={discoveryStyles.container} data-testid="oauth-discovery-panel">
        <div style={discoveryStyles.loading}>
          <div
            style={{
              width: "14px",
              height: "14px",
              border: "2px solid #2d2f2f",
              borderTopColor: "#20b2aa",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <span style={discoveryStyles.loadingText}>
            Discovering authentication requirements...
          </span>
        </div>
      </div>
    );
  }

  // Error state (discovery failed)
  if (error && !discovery) {
    return (
      <div style={discoveryStyles.container} data-testid="oauth-discovery-panel">
        <div style={discoveryStyles.content}>
          <div style={discoveryStyles.header}>
            <span style={discoveryStyles.title}>🔒 Authentication Required</span>
          </div>
          <div style={discoveryStyles.error} data-testid="discovery-error">
            {error}
          </div>
          <button
            type="button"
            style={discoveryStyles.secondaryButton}
            onClick={onDismiss}
            data-testid="discovery-manual-btn"
          >
            Configure Manually
          </button>
        </div>
      </div>
    );
  }

  // No discovery results yet
  if (!discovery) {
    return <></>;
  }

  // DCR available — one-click authorize
  if (discovery.supportsDCR) {
    return (
      <div style={discoveryStyles.container} data-testid="oauth-discovery-panel">
        <div style={discoveryStyles.content}>
          <div style={discoveryStyles.header}>
            <span style={discoveryStyles.title}>🔒 Authentication Required</span>
            <span
              style={{ ...discoveryStyles.badge, ...discoveryStyles.badgeDCR }}
              data-testid="discovery-dcr-badge"
            >
              Auto Registration
            </span>
          </div>

          <div style={discoveryStyles.serverUrl}>{discovery.serverUrl}</div>

          <div style={discoveryStyles.message}>
            This server supports automatic registration. Click Authorize to connect securely.
          </div>

          <div style={discoveryStyles.infoBox}>
            {discovery.authServerUrl && (
              <div style={discoveryStyles.infoRow}>
                <span style={discoveryStyles.infoLabel}>Auth Server</span>
                <span style={discoveryStyles.infoValue} data-testid="discovery-auth-server">
                  {discovery.authServerUrl}
                </span>
              </div>
            )}
            {discovery.suggestedScopes.length > 0 && (
              <div>
                <span style={discoveryStyles.infoLabel}>Scopes</span>
                <div
                  style={discoveryStyles.scopeChipsContainer}
                  data-testid="discovery-scope-chips"
                >
                  {discovery.suggestedScopes.map((scope) => (
                    <span key={scope} style={discoveryStyles.scopeChip}>
                      {scope}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Advanced section for overrides */}
          <button
            type="button"
            style={discoveryStyles.advancedToggle}
            onClick={() => setShowAdvanced(!showAdvanced)}
            data-testid="discovery-advanced-toggle"
          >
            {showAdvanced ? "▾ Advanced" : "▸ Advanced"}
          </button>

          {showAdvanced && (
            <>
              <div style={discoveryStyles.field}>
                <label style={discoveryStyles.label}>Override Client ID</label>
                <input
                  type="text"
                  style={discoveryStyles.input}
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="(optional — uses DCR if empty)"
                  data-testid="discovery-client-id"
                />
              </div>
              <div style={discoveryStyles.field}>
                <label style={discoveryStyles.label}>Override Scopes</label>
                <input
                  type="text"
                  style={discoveryStyles.input}
                  value={scopesOverride}
                  onChange={(e) => setScopesOverride(e.target.value)}
                  placeholder={suggestedScopes || "e.g. read write openid"}
                  data-testid="discovery-scopes-override"
                />
              </div>
            </>
          )}

          {error && <div style={discoveryStyles.error}>{error}</div>}

          <div style={discoveryStyles.actions}>
            <button
              type="button"
              style={{
                ...discoveryStyles.button,
                ...(isConfiguring ? discoveryStyles.buttonDisabled : {}),
                flex: 1,
              }}
              onClick={() => void handleDCRAuthorize()}
              disabled={isConfiguring}
              data-testid="discovery-authorize-btn"
            >
              {isConfiguring ? "Configuring..." : "Authorize"}
            </button>
            <button
              type="button"
              style={discoveryStyles.secondaryButton}
              onClick={onDismiss}
              data-testid="discovery-dismiss-btn"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Pre-registration required — credential form
  return (
    <div style={discoveryStyles.container} data-testid="oauth-discovery-panel">
      <div style={discoveryStyles.content}>
        <div style={discoveryStyles.header}>
          <span style={discoveryStyles.title}>🔒 Authentication Required</span>
          <span
            style={{ ...discoveryStyles.badge, ...discoveryStyles.badgePreReg }}
            data-testid="discovery-prereg-badge"
          >
            Pre-Registration
          </span>
        </div>

        <div style={discoveryStyles.serverUrl}>{discovery.serverUrl}</div>

        <div style={discoveryStyles.message}>
          This server requires pre-registered credentials. Enter your client details below.
        </div>

        {discovery.authServerUrl && (
          <div style={discoveryStyles.infoBox}>
            <div style={discoveryStyles.infoRow}>
              <span style={discoveryStyles.infoLabel}>Auth Server</span>
              <span style={discoveryStyles.infoValue} data-testid="discovery-auth-server">
                {discovery.authServerUrl}
              </span>
            </div>
          </div>
        )}

        <div style={discoveryStyles.field}>
          <label style={discoveryStyles.label}>Client ID *</label>
          <input
            type="text"
            style={discoveryStyles.input}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="your-client-id"
            data-testid="discovery-client-id"
          />
        </div>

        <div style={discoveryStyles.field}>
          <label style={discoveryStyles.label}>Client Secret</label>
          <input
            type="password"
            style={discoveryStyles.input}
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="(optional)"
            data-testid="discovery-client-secret"
          />
        </div>

        <div style={discoveryStyles.field}>
          <label style={discoveryStyles.label}>Scopes</label>
          <input
            type="text"
            style={discoveryStyles.input}
            value={scopesOverride || suggestedScopes}
            onChange={(e) => setScopesOverride(e.target.value)}
            placeholder="e.g. read write openid"
            data-testid="discovery-scopes"
          />
          {discovery.suggestedScopes.length > 0 && (
            <span style={discoveryStyles.hint}>Pre-filled from server discovery</span>
          )}
        </div>

        {error && <div style={discoveryStyles.error}>{error}</div>}

        <div style={discoveryStyles.actions}>
          <button
            type="button"
            style={{
              ...discoveryStyles.button,
              ...(isConfiguring || !clientId.trim() ? discoveryStyles.buttonDisabled : {}),
              flex: 1,
            }}
            onClick={() => void handlePreRegAuthorize()}
            disabled={isConfiguring || !clientId.trim()}
            data-testid="discovery-authorize-btn"
          >
            {isConfiguring ? "Configuring..." : "Authorize"}
          </button>
          <button
            type="button"
            style={discoveryStyles.secondaryButton}
            onClick={onDismiss}
            data-testid="discovery-dismiss-btn"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default OAuthDiscoveryPanel;
