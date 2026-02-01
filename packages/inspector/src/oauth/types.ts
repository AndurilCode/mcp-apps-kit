/**
 * OAuth Types for MCP Inspector
 *
 * Shared types for OAuth client provider, token storage, and connection state.
 */

import type {
  OAuthTokens,
  OAuthClientInformationFull,
  OAuthMetadata,
  OAuthProtectedResourceMetadata,
} from "@modelcontextprotocol/sdk/shared/auth.js";

// Re-export SDK types used across the OAuth module
export type {
  OAuthTokens,
  OAuthClientMetadata,
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientInformationMixed,
  OAuthMetadata,
  OAuthProtectedResourceMetadata,
  AuthorizationServerMetadata,
} from "@modelcontextprotocol/sdk/shared/auth.js";

export type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";

// =============================================================================
// TOKEN STORE TYPES
// =============================================================================

/**
 * Persisted token data for a single server URL.
 *
 * Stored as JSON in ~/.config/mcp-inspector/tokens/<url-hash>.json
 */
export interface PersistedTokenData {
  /** The server URL this token data belongs to */
  serverUrl: string;

  /** OAuth tokens (access_token, refresh_token, etc.) */
  tokens: OAuthTokens;

  /** PKCE code verifier for in-progress flows */
  codeVerifier?: string;

  /** Registered client information (from dynamic registration or manual config) */
  clientInformation?: OAuthClientInformationFull;

  /** Timestamp when tokens were last saved */
  savedAt: number;

  /** Absolute token expiry timestamp (ms since epoch), computed from expires_in */
  expiresAt?: number;

  /** The scopes that were requested for this token */
  requestedScopes?: string;
}

/**
 * Configuration for the OAuth client provider.
 *
 * Provided by the dashboard (Mode A) or CLI preset (Mode B).
 */
export interface OAuthClientConfig {
  /** OAuth client ID (required unless using dynamic registration) */
  clientId?: string;

  /** OAuth client secret (confidential clients) */
  clientSecret?: string;

  /** Redirect URI for the OAuth callback */
  redirectUri: string;

  /** Requested scopes (space-separated) */
  scopes?: string;

  /** Enable dynamic client registration (RFC 7591) */
  enableDynamicRegistration?: boolean;

  /** Client name for dynamic registration */
  clientName?: string;
}

// =============================================================================
// AUTH STATE TYPES (for dashboard display)
// =============================================================================

/**
 * OAuth authentication state for a connection.
 *
 * Displayed in the dashboard per-connection status indicator.
 */
export type OAuthStatus = "unauthenticated" | "authenticating" | "authenticated" | "error";

/**
 * Full OAuth state for a connection, exposed to dashboard.
 */
export interface OAuthState {
  /** Current auth status */
  status: OAuthStatus;

  /** Token expiry timestamp (ms since epoch), if authenticated */
  expiresAt?: number;

  /** Scopes granted by the auth server */
  grantedScopes?: string;

  /** Error message if status is "error" */
  errorMessage?: string;

  /** Whether the auth server supports dynamic registration */
  supportsDynamicRegistration?: boolean;

  /** Whether the auth server has a revocation endpoint */
  supportsRevocation?: boolean;

  /** Scopes supported by the auth server (for scope negotiation UI) */
  supportedScopes?: string[];

  /** Auth server metadata (for scope descriptions, endpoints, etc.) */
  authServerMetadata?: OAuthMetadata;

  /** Protected resource metadata */
  resourceMetadata?: OAuthProtectedResourceMetadata;
}

/**
 * OAuth configuration passed via CLI flags (Mode B: preset auth).
 */
export interface OAuthPresetConfig {
  /** OAuth client ID */
  clientId: string;

  /** OAuth client secret */
  clientSecret?: string;

  /** Enable dynamic client registration */
  autoRegister?: boolean;

  /** Requested scopes (space-separated) */
  scopes?: string;
}
