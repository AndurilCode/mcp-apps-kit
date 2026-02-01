/**
 * OAuth module for MCP Inspector
 *
 * Provides OAuth 2.1 + PKCE support for authenticated MCP server connections.
 */

export { InspectorOAuthProvider } from "./provider";
export type { InspectorOAuthProviderOptions } from "./provider";
export { TokenStore, getTokenStorePath, hashServerUrl } from "./token-store";
export { handleOAuthRoutes } from "./callback-handler";
export { createWellKnownProxy } from "./wellknown-proxy";
export type { WellKnownProxyOptions, WellKnownProxyContext } from "./wellknown-proxy";
export {
  hasPresetFlags,
  parsePresetFlags,
  loadPresetConfigFile,
  resolvePresetConfig,
  createPresetProvider,
  checkExistingTokens,
} from "./preset-config";
export type { PresetCLIFlags, PresetConfigFile, PresetProviderOptions } from "./preset-config";
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
