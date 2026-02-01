/**
 * OAuth module for MCP Inspector
 *
 * Provides OAuth 2.1 + PKCE support for authenticated MCP server connections.
 */

export { InspectorOAuthProvider } from "./provider";
export type { InspectorOAuthProviderOptions } from "./provider";
export { TokenStore, getTokenStorePath, hashServerUrl } from "./token-store";
export type {
  OAuthClientConfig,
  OAuthState,
  OAuthStatus,
  OAuthPresetConfig,
  PersistedTokenData,
} from "./types";

// Re-export SDK types for convenience
export type {
  OAuthClientProvider,
  OAuthTokens,
  OAuthClientMetadata,
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientInformationMixed,
  OAuthMetadata,
  OAuthProtectedResourceMetadata,
  AuthorizationServerMetadata,
} from "./types";
