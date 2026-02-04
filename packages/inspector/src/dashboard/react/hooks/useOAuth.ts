/**
 * useOAuth Hook
 *
 * Manages OAuth state for a connection by polling /api/oauth/status.
 * Exposes configure() and revoke() actions for the dashboard.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { OAuthStatus, OAuthState } from "../../../oauth/types";
import type { AuthRequiredEvent } from "../../../oauth/discovery";

/**
 * OAuth status response from the /api/oauth/status endpoint.
 */
export interface OAuthStatusResponse {
  configured: boolean;
  connectionId: string | null;
  status?: OAuthStatus;
  expiresAt?: number;
  grantedScopes?: string;
  errorMessage?: string;
  supportsDynamicRegistration?: boolean;
  supportsRevocation?: boolean;
  supportedScopes?: string[];
  authorizationUrl?: string | null;
}

/**
 * OAuth configure request body for /api/oauth/configure.
 */
export interface OAuthConfigureParams {
  connectionId: string;
  config: {
    clientId?: string;
    clientSecret?: string;
    scopes?: string;
    enableDynamicRegistration?: boolean;
    redirectUri?: string;
  };
}

/**
 * Discovery configuration parameters passed to configureFromDiscovery.
 */
export interface DiscoveryConfigureParams {
  clientId?: string;
  clientSecret?: string;
  scopes?: string;
  enableDynamicRegistration?: boolean;
}

/**
 * Result shape for the useOAuth hook.
 */
export interface UseOAuthResult {
  /** Current OAuth state for the connection */
  oauthState: OAuthState | null;
  /** Whether the OAuth provider is configured on the server */
  isConfigured: boolean;
  /** Pending authorization URL (user must open to complete auth) */
  authorizationUrl: string | null;
  /** Whether a configure or revoke request is in flight */
  isLoading: boolean;
  /** Error from the last operation */
  error: string | null;
  /** Configure OAuth for the connection, returns auth URL if redirect needed */
  configure: (params: {
    clientId?: string;
    clientSecret?: string;
    scopes?: string;
  }) => Promise<string | null>;
  /** Revoke OAuth tokens for the connection */
  revoke: () => Promise<boolean>;
  /** Discovery results from 401 auto-detection, set externally or fetched */
  discoveryResults: AuthRequiredEvent | null;
  /** Set discovery results (e.g., from connection creation response) */
  setDiscoveryResults: (results: AuthRequiredEvent | null) => void;
  /** Whether browser-side discovery is in progress */
  isDiscovering: boolean;
  /** Fetch discovery results from the backend for a given server URL */
  discover: (serverUrl: string) => Promise<AuthRequiredEvent | null>;
  /** Configure OAuth from discovery results + optional overrides */
  configureFromDiscovery: (overrides?: DiscoveryConfigureParams) => Promise<string | null>;
}

/**
 * Hook for managing OAuth state on a specific connection.
 *
 * Polls GET /api/oauth/status?connectionId=X at a configurable interval.
 * Provides configure() and revoke() actions that call the backend API.
 *
 * @param baseUrl - Base URL for the inspector API
 * @param connectionId - Connection ID to manage OAuth for (null disables)
 * @param pollInterval - Polling interval in ms (default: 3000)
 */
export function useOAuth(
  baseUrl: string,
  connectionId: string | null,
  pollInterval = 3000
): UseOAuthResult {
  const [oauthState, setOauthState] = useState<OAuthState | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [authorizationUrl, setAuthorizationUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discoveryResults, setDiscoveryResults] = useState<AuthRequiredEvent | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);

  // Track the active connectionId to avoid stale updates
  const activeConnectionIdRef = useRef(connectionId);
  activeConnectionIdRef.current = connectionId;

  /**
   * Fetch OAuth status from the backend.
   */
  const fetchStatus = useCallback(async () => {
    if (!connectionId) {
      setOauthState(null);
      setIsConfigured(false);
      setAuthorizationUrl(null);
      return;
    }

    try {
      const res = await fetch(
        `${baseUrl}/api/oauth/status?connectionId=${encodeURIComponent(connectionId)}`
      );
      if (!res.ok) {
        return; // Silently fail polls — backend may not have OAuth configured
      }
      const data = (await res.json()) as OAuthStatusResponse;

      // Guard against stale responses
      if (activeConnectionIdRef.current !== connectionId) {
        return;
      }

      setIsConfigured(data.configured);
      setAuthorizationUrl(data.authorizationUrl ?? null);

      if (data.configured && data.status) {
        setOauthState({
          status: data.status,
          expiresAt: data.expiresAt,
          grantedScopes: data.grantedScopes,
          errorMessage: data.errorMessage,
          supportsDynamicRegistration: data.supportsDynamicRegistration,
          supportsRevocation: data.supportsRevocation,
          supportedScopes: data.supportedScopes,
        });
      } else {
        setOauthState(null);
      }
    } catch {
      // Silently ignore poll errors
    }
  }, [baseUrl, connectionId]);

  // Poll for status updates
  useEffect(() => {
    if (!connectionId) {
      setOauthState(null);
      setIsConfigured(false);
      setAuthorizationUrl(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    void fetchStatus();
    const interval = setInterval(() => {
      void fetchStatus();
    }, pollInterval);
    return () => {
      clearInterval(interval);
    };
  }, [fetchStatus, connectionId, pollInterval]);

  /**
   * Configure OAuth for the connection.
   *
   * POSTs to /api/oauth/configure and returns the authorization URL
   * if the server responds with one (user needs to open it).
   */
  const configure = useCallback(
    async (params: {
      clientId?: string;
      clientSecret?: string;
      scopes?: string;
    }): Promise<string | null> => {
      if (!connectionId) {
        setError("No connection selected");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const body: OAuthConfigureParams = {
          connectionId,
          config: {
            clientId: params.clientId ?? undefined,
            clientSecret: params.clientSecret ?? undefined,
            scopes: params.scopes ?? undefined,
            enableDynamicRegistration: !params.clientId,
          },
        };

        const res = await fetch(`${baseUrl}/api/oauth/configure`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }

        const data = (await res.json()) as {
          configured: boolean;
          connectionId: string;
          state: OAuthState;
          authorizationUrl?: string | null;
        };

        if (activeConnectionIdRef.current === connectionId) {
          setIsConfigured(data.configured);
          setOauthState(data.state);
          if (data.authorizationUrl) {
            setAuthorizationUrl(data.authorizationUrl);
          }
        }

        // Return the URL from the response directly (not stale React state)
        return data.authorizationUrl ?? null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Configuration failed";
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [baseUrl, connectionId]
  );

  /**
   * Revoke OAuth tokens for the connection.
   */
  const revoke = useCallback(async (): Promise<boolean> => {
    if (!connectionId) {
      setError("No connection selected");
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `${baseUrl}/api/oauth/revoke?connectionId=${encodeURIComponent(connectionId)}`,
        { method: "POST" }
      );

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { revoked: boolean; reason?: string };

      if (!data.revoked) {
        setError(data.reason ?? "Revocation failed");
        return false;
      }

      // Refresh state after revocation
      await fetchStatus();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Revocation failed";
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl, connectionId, fetchStatus]);

  /**
   * Fetch discovery results from the backend for a server URL.
   *
   * Calls GET /api/oauth/discover?url=<serverUrl> to probe the server's
   * .well-known endpoints for OAuth capabilities.
   */
  const discover = useCallback(
    async (serverUrl: string): Promise<AuthRequiredEvent | null> => {
      setIsDiscovering(true);
      setError(null);

      try {
        const res = await fetch(
          `${baseUrl}/api/oauth/discover?url=${encodeURIComponent(serverUrl)}`
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
          throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as AuthRequiredEvent;
        setDiscoveryResults(data);
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Discovery failed";
        setError(message);
        return null;
      } finally {
        setIsDiscovering(false);
      }
    },
    [baseUrl]
  );

  /**
   * Configure OAuth from discovery results + optional overrides.
   *
   * Uses the stored discoveryResults to build a configure request.
   * Falls back to the overrides if discovery results are not available.
   */
  const configureFromDiscovery = useCallback(
    async (overrides?: DiscoveryConfigureParams): Promise<string | null> => {
      if (!connectionId) {
        setError("No connection selected");
        return null;
      }

      const useDCR = overrides?.enableDynamicRegistration ?? discoveryResults?.supportsDCR ?? false;
      const scopes = overrides?.scopes ?? discoveryResults?.suggestedScopes?.join(" ") ?? undefined;

      const result = await configure({
        clientId: overrides?.clientId,
        clientSecret: overrides?.clientSecret,
        scopes,
      });

      // If configure was called with DCR intent but configure() doesn't pass it,
      // we need to call the endpoint directly with the DCR flag
      if (useDCR && !overrides?.clientId) {
        setIsLoading(true);
        setError(null);

        try {
          const body: OAuthConfigureParams = {
            connectionId,
            config: {
              enableDynamicRegistration: true,
              scopes,
              clientId: overrides?.clientId,
              clientSecret: overrides?.clientSecret,
            },
          };

          const res = await fetch(`${baseUrl}/api/oauth/configure`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(data.error ?? `HTTP ${res.status}`);
          }

          const data = (await res.json()) as {
            configured: boolean;
            connectionId: string;
            state: OAuthState;
            authorizationUrl?: string | null;
          };

          if (activeConnectionIdRef.current === connectionId) {
            setIsConfigured(data.configured);
            setOauthState(data.state);
            if (data.authorizationUrl) {
              setAuthorizationUrl(data.authorizationUrl);
            }
            // Clear discovery results after successful configuration
            setDiscoveryResults(null);
          }

          return data.authorizationUrl ?? null;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Configuration failed";
          setError(message);
          return null;
        } finally {
          setIsLoading(false);
        }
      }

      // For non-DCR, configure() already handled it
      if (result) {
        setDiscoveryResults(null);
      }
      return result;
    },
    [baseUrl, connectionId, configure, discoveryResults]
  );

  // Clear discovery results when connection changes
  useEffect(() => {
    setDiscoveryResults(null);
  }, [connectionId]);

  return {
    oauthState,
    isConfigured,
    authorizationUrl,
    isLoading,
    error,
    configure,
    revoke,
    discoveryResults,
    setDiscoveryResults,
    isDiscovering,
    discover,
    configureFromDiscovery,
  };
}

export default useOAuth;
