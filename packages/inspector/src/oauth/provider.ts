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
} from "./types";
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
   */
  async tokens(): Promise<OAuthTokens | undefined> {
    const persisted = await this.tokenStore.load(this.serverUrl);
    if (persisted?.tokens?.access_token) {
      return persisted.tokens;
    }
    return undefined;
  }

  /**
   * Save new tokens after authorization or refresh.
   */
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.tokenStore.saveTokens(this.serverUrl, tokens);
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

  // =========================================================================
  // Private helpers
  // =========================================================================

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
