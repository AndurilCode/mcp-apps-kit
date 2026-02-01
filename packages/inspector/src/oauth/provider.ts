/**
 * OAuth Client Provider for MCP Inspector
 *
 * Implements the MCP SDK's OAuthClientProvider interface for use with
 * StreamableHTTPClientTransport. Handles token persistence, PKCE state,
 * dynamic client registration, and authorization redirect.
 *
 * Usage:
 *   const provider = new InspectorOAuthProvider({ serverUrl, config, callbackPort });
 *   const transport = new StreamableHTTPClientTransport(url, { authProvider: provider });
 */

import type {
  OAuthClientProvider,
  OAuthClientMetadata,
  OAuthClientInformationMixed,
  OAuthTokens,
  OAuthClientConfig,
  OAuthState,
  OAuthStatus,
  OAuthMetadata,
} from "./types";
import { discoverAuthorizationServerMetadata } from "@modelcontextprotocol/sdk/client/auth.js";
import { TokenStore } from "./token-store";

/**
 * Options for creating an InspectorOAuthProvider.
 */
export interface InspectorOAuthProviderOptions {
  /** The target MCP server URL (used as key for token storage) */
  serverUrl: string;

  /** OAuth client configuration (from dashboard or CLI) */
  config: OAuthClientConfig;

  /** Port the inspector server runs on (for callback URL) */
  callbackPort: number;

  /** Custom token store (for testing) */
  tokenStore?: TokenStore;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * MCP Inspector's implementation of OAuthClientProvider.
 *
 * This provider:
 * - Persists tokens to disk (XDG path) via TokenStore
 * - Handles PKCE code verifier storage
 * - Supports dynamic client registration (opt-in)
 * - Redirects to authorization URL via a pending-auth callback mechanism
 * - Tracks auth state for dashboard display
 */
export class InspectorOAuthProvider implements OAuthClientProvider {
  private readonly serverUrl: string;
  private readonly config: OAuthClientConfig;
  private readonly tokenStore: TokenStore;
  private readonly _debug: boolean;

  /** The port for constructing the redirect/callback URL */
  private readonly callbackPort: number;

  /** In-memory PKCE code verifier (per auth flow) */
  private _codeVerifier: string | null = null;

  /** Current auth status (for dashboard display) */
  private _status: OAuthStatus = "unauthenticated";

  /** Error message if auth failed */
  private _errorMessage?: string;

  /** Token expiry timestamp (ms since epoch) */
  private _expiresAt?: number;

  /** Whether the auth server exposes a revocation endpoint */
  private _supportsRevocation?: boolean;

  /** Cached supported scopes from auth server metadata discovery */
  private _supportedScopes: string[] = [];

  /** Callback invoked when auth status changes */
  onStatusChange?: (state: OAuthState) => void;

  /** Pending authorization URL (set by redirectToAuthorization, consumed by callback handler) */
  private _pendingAuthUrl: URL | null = null;

  /** Resolve function for pending authorization (blocks until callback completes) */
  private _pendingAuthResolve: (() => void) | null = null;

  constructor(options: InspectorOAuthProviderOptions) {
    this.serverUrl = options.serverUrl;
    this.config = options.config;
    this.callbackPort = options.callbackPort;
    this.tokenStore = options.tokenStore ?? new TokenStore();
    this._debug = options.debug ?? false;
  }

  // =========================================================================
  // OAuthClientProvider interface
  // =========================================================================

  /**
   * Redirect URL for the OAuth callback.
   * Points to the inspector's /oauth/callback endpoint.
   */
  get redirectUrl(): URL {
    return new URL(`http://127.0.0.1:${this.callbackPort}/oauth/callback`);
  }

  /**
   * Client metadata for dynamic registration or authorization requests.
   */
  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUrl.toString()],
      client_name: this.config.clientName ?? "MCP Inspector",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: this.config.clientSecret ? "client_secret_basic" : "none",
      ...(this.config.scopes ? { scope: this.config.scopes } : {}),
    };
  }

  /**
   * Load client information from persisted store or config.
   */
  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    // Check persisted client info first (from dynamic registration)
    const persisted = await this.tokenStore.load(this.serverUrl);
    if (persisted?.clientInformation) {
      return persisted.clientInformation;
    }

    // Fall back to config-provided client ID
    if (this.config.clientId) {
      return {
        client_id: this.config.clientId,
        ...(this.config.clientSecret ? { client_secret: this.config.clientSecret } : {}),
      };
    }

    // No client information available (needs dynamic registration)
    return undefined;
  }

  /**
   * Save client information after dynamic registration.
   *
   * Only called when enableDynamicRegistration is true and the auth server
   * supports RFC 7591.
   */
  async saveClientInformation(clientInformation: OAuthClientInformationMixed): Promise<void> {
    if (!this.config.enableDynamicRegistration) {
      this.log("saveClientInformation called but dynamic registration is disabled, ignoring");
      return;
    }

    await this.tokenStore.save(this.serverUrl, {
      clientInformation:
        clientInformation as import("@modelcontextprotocol/sdk/shared/auth.js").OAuthClientInformationFull,
    });
    this.log("Client information saved from dynamic registration");
  }

  /**
   * Load existing tokens from persistent store.
   *
   * Also hydrates the in-memory expiresAt from persisted data.
   */
  async tokens(): Promise<OAuthTokens | undefined> {
    const persisted = await this.tokenStore.load(this.serverUrl);
    if (persisted?.tokens?.access_token) {
      // Restore expiresAt from persisted data if not already set
      if (this._expiresAt === undefined && persisted.expiresAt) {
        this._expiresAt = persisted.expiresAt;
      }
      return persisted.tokens;
    }
    return undefined;
  }

  /**
   * Save new tokens after authorization or refresh.
   *
   * Computes expiresAt from expires_in (seconds from now) and persists it
   * alongside the tokens for dashboard display.
   */
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    // Compute absolute expiry timestamp from relative expires_in
    if (tokens.expires_in != null && tokens.expires_in > 0) {
      this._expiresAt = Date.now() + tokens.expires_in * 1000;
    } else {
      this._expiresAt = undefined;
    }

    await this.tokenStore.saveTokens(this.serverUrl, tokens, this._expiresAt);
    this.updateStatus("authenticated");
    this.log("Tokens saved");
  }

  /**
   * Redirect the user agent to the authorization URL.
   *
   * In the inspector's architecture, we can't directly open a browser.
   * Instead, we store the URL and signal the callback handler to redirect
   * the user. The dashboard polls for this URL via /oauth/status.
   */
  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    this._pendingAuthUrl = authorizationUrl;
    this.updateStatus("authenticating");
    this.log(`Authorization URL ready: ${authorizationUrl.toString()}`);
  }

  /**
   * Save the PKCE code verifier for the current flow.
   */
  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this._codeVerifier = codeVerifier;
    await this.tokenStore.saveCodeVerifier(this.serverUrl, codeVerifier);
  }

  /**
   * Load the PKCE code verifier.
   */
  async codeVerifier(): Promise<string> {
    if (this._codeVerifier) {
      return this._codeVerifier;
    }

    // Fall back to persisted
    const persisted = await this.tokenStore.load(this.serverUrl);
    if (persisted?.codeVerifier) {
      this._codeVerifier = persisted.codeVerifier;
      return persisted.codeVerifier;
    }

    throw new Error("No PKCE code verifier available");
  }

  /**
   * Invalidate credentials when the server indicates they're no longer valid.
   */
  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier"): Promise<void> {
    if (scope === "all") {
      await this.tokenStore.delete(this.serverUrl);
      this._codeVerifier = null;
      this.updateStatus("unauthenticated");
    } else if (scope === "tokens") {
      // Only clear tokens, keep client info
      const existing = await this.tokenStore.load(this.serverUrl);
      if (existing) {
        await this.tokenStore.save(this.serverUrl, {
          tokens: undefined,
          clientInformation: existing.clientInformation,
        });
      }
      this.updateStatus("unauthenticated");
    } else if (scope === "client") {
      const existing = await this.tokenStore.load(this.serverUrl);
      if (existing) {
        await this.tokenStore.save(this.serverUrl, {
          tokens: existing.tokens,
          clientInformation: undefined,
        });
      }
    } else if (scope === "verifier") {
      this._codeVerifier = null;
    }
    this.log(`Credentials invalidated: scope=${scope}`);
  }

  // =========================================================================
  // Inspector-specific methods
  // =========================================================================

  /**
   * Get the current OAuth state for dashboard display.
   */
  getOAuthState(): OAuthState {
    return {
      status: this._status,
      errorMessage: this._errorMessage,
      expiresAt: this._expiresAt,
      supportsRevocation: this._supportsRevocation,
      ...(this._supportedScopes.length > 0 ? { supportedScopes: this._supportedScopes } : {}),
    };
  }

  /**
   * Get the pending authorization URL (consumed by callback handler).
   * Returns null if no authorization is pending.
   */
  getPendingAuthUrl(): URL | null {
    return this._pendingAuthUrl;
  }

  /**
   * Clear the pending authorization URL (after it's been consumed).
   */
  clearPendingAuthUrl(): void {
    this._pendingAuthUrl = null;
  }

  /**
   * Wait for the pending authorization to complete.
   * Returns a promise that resolves when onAuthorizationComplete is called.
   */
  waitForAuthorization(): Promise<void> {
    if (!this._pendingAuthUrl) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this._pendingAuthResolve = resolve;
    });
  }

  /**
   * Signal that the authorization callback has been received.
   * Called by the callback handler after processing /oauth/callback.
   */
  onAuthorizationComplete(): void {
    this._pendingAuthUrl = null;
    if (this._pendingAuthResolve) {
      this._pendingAuthResolve();
      this._pendingAuthResolve = null;
    }
  }

  /**
   * Set the error state.
   */
  setError(message: string): void {
    this._errorMessage = message;
    this.updateStatus("error");
  }

  /**
   * Get the server URL this provider is for.
   */
  getServerUrl(): string {
    return this.serverUrl;
  }

  /**
   * Get the underlying token store (for revocation and cleanup).
   */
  getTokenStore(): TokenStore {
    return this.tokenStore;
  }

  /**
   * Get cached supported scopes from auth server metadata.
   * Returns an empty array if scopes haven't been discovered yet.
   */
  getSupportedScopes(): string[] {
    return this._supportedScopes;
  }

  /**
   * Discover and cache supported scopes from the auth server metadata.
   *
   * Fetches RFC 8414 authorization server metadata, extracting
   * `scopes_supported`. Results are cached so subsequent calls are no-ops.
   */
  async discoverSupportedScopes(): Promise<string[]> {
    if (this._supportedScopes.length > 0) {
      return this._supportedScopes;
    }

    try {
      const metadata = await discoverAuthorizationServerMetadata(this.serverUrl);
      if (metadata?.scopes_supported) {
        this._supportedScopes = [...metadata.scopes_supported];
      }

      // Also detect revocation support while we have the metadata
      if (metadata && this._supportsRevocation === undefined) {
        this._supportsRevocation = !!(metadata as OAuthMetadata).revocation_endpoint;
      }
    } catch {
      this.log("Scope discovery failed — auth server metadata unavailable");
    }

    this.log(`Discovered ${this._supportedScopes.length} supported scopes`);
    return this._supportedScopes;
  }

  /**
   * Revoke tokens at the auth server's revocation endpoint (RFC 7009).
   *
   * Discovers the auth server metadata to find the revocation_endpoint,
   * then POSTs the access token (and refresh token if present) for revocation.
   *
   * Gracefully handles failures — if the server is unreachable or doesn't
   * support revocation, this method logs the issue but does not throw.
   *
   * @returns true if server-side revocation succeeded, false otherwise
   */
  async revokeTokens(): Promise<boolean> {
    const currentTokens = await this.tokens();
    if (!currentTokens?.access_token) {
      this.log("No tokens to revoke");
      return false;
    }

    try {
      // Discover auth server metadata for the revocation endpoint
      const metadata = await discoverAuthorizationServerMetadata(this.serverUrl);
      if (!metadata) {
        this.log("Auth server metadata not found, skipping server-side revocation");
        this._supportsRevocation = false;
        return false;
      }

      // revocation_endpoint is on OAuthMetadata (not all AuthorizationServerMetadata variants)
      const revocationEndpoint = (metadata as OAuthMetadata).revocation_endpoint;
      if (!revocationEndpoint) {
        this.log("Auth server does not expose a revocation endpoint");
        this._supportsRevocation = false;
        return false;
      }

      this._supportsRevocation = true;
      const endpointUrl = revocationEndpoint.toString();

      // Build client authentication (client_id + optional client_secret)
      const clientInfo = await this.clientInformation();

      // Revoke the access token per RFC 7009
      await this.postRevocation(
        endpointUrl,
        currentTokens.access_token,
        "access_token",
        clientInfo
      );

      // Also revoke the refresh token if present
      if (currentTokens.refresh_token) {
        await this.postRevocation(
          endpointUrl,
          currentTokens.refresh_token,
          "refresh_token",
          clientInfo
        );
      }

      this.log("Server-side token revocation succeeded");
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log(`Server-side token revocation failed: ${message}`);
      return false;
    }
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  /**
   * POST a token revocation request per RFC 7009.
   */
  private async postRevocation(
    endpointUrl: string,
    token: string,
    tokenTypeHint: string,
    clientInfo?: OAuthClientInformationMixed
  ): Promise<void> {
    const params = new URLSearchParams({
      token,
      token_type_hint: tokenTypeHint,
    });

    // Include client_id for identification (required by many servers)
    if (clientInfo) {
      params.set("client_id", clientInfo.client_id);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    // Use HTTP Basic auth for confidential clients (client_secret_basic)
    if (clientInfo && "client_secret" in clientInfo && clientInfo.client_secret) {
      const credentials = Buffer.from(
        `${clientInfo.client_id}:${clientInfo.client_secret}`
      ).toString("base64");
      headers["Authorization"] = `Basic ${credentials}`;
      // Remove client_id from body when using Basic auth
      params.delete("client_id");
    }

    const response = await fetch(endpointUrl, {
      method: "POST",
      headers,
      body: params.toString(),
    });

    // RFC 7009: The server responds with HTTP 200 for both successful
    // and invalid token revocations (the client shouldn't need to know).
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Revocation endpoint returned ${response.status}: ${body}`);
    }
  }

  private updateStatus(status: OAuthStatus): void {
    this._status = status;
    if (status !== "error") {
      this._errorMessage = undefined;
    }
    this.onStatusChange?.(this.getOAuthState());
  }

  private log(message: string): void {
    if (this._debug) {
      // eslint-disable-next-line no-console
      console.log(`[oauth:provider] ${message}`);
    }
  }
}
