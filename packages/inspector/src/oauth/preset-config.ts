/**
 * Preset OAuth Configuration for CLI / Agent Mode (Mode B)
 *
 * Parses CLI flags into an OAuthClientConfig and creates a non-interactive
 * InspectorOAuthProvider that throws on redirect instead of opening a browser.
 *
 * Usage:
 *   const config = parsePresetFlags({ clientId: "...", scopes: "read,write" });
 *   const config = await loadPresetConfigFile("/path/to/oauth.json");
 *   const provider = createPresetProvider({ serverUrl, config, callbackPort });
 */

import { readFile } from "node:fs/promises";
import { InspectorOAuthProvider } from "./provider";
import { TokenStore } from "./token-store";
import type { OAuthClientConfig, OAuthPresetConfig } from "./types";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Raw CLI flag values as parsed from argv.
 */
export interface PresetCLIFlags {
  oauthClientId?: string;
  oauthClientSecret?: string;
  oauthScopes?: string;
  oauthConfig?: string;
  oauthAutoRegister?: boolean;
}

/**
 * JSON config file schema (superset of OAuthPresetConfig).
 */
export interface PresetConfigFile {
  clientId?: string;
  clientSecret?: string;
  scopes?: string;
  autoRegister?: boolean;
  clientName?: string;
}

/**
 * Options for creating a preset (non-interactive) provider.
 */
export interface PresetProviderOptions {
  /** Target MCP server URL */
  serverUrl: string;

  /** Parsed OAuth client config */
  config: OAuthClientConfig;

  /** Port for redirect URI construction */
  callbackPort: number;

  /** Custom token store (for testing) */
  tokenStore?: TokenStore;

  /** Enable debug logging */
  debug?: boolean;
}

// =============================================================================
// FLAG PARSING
// =============================================================================

/**
 * Check whether any OAuth preset flags were provided.
 */
export function hasPresetFlags(flags: PresetCLIFlags): boolean {
  return !!(
    flags.oauthClientId ||
    flags.oauthClientSecret ||
    flags.oauthScopes ||
    flags.oauthConfig ||
    flags.oauthAutoRegister
  );
}

/**
 * Parse CLI flags into an OAuthClientConfig.
 *
 * Validates that the minimal required configuration is present:
 * either a clientId or autoRegister must be specified.
 *
 * @throws Error if configuration is invalid
 */
export function parsePresetFlags(flags: PresetCLIFlags): OAuthClientConfig {
  const config: OAuthClientConfig = {
    redirectUri: "", // Filled by provider based on callbackPort
  };

  if (flags.oauthClientId) {
    config.clientId = flags.oauthClientId;
  }

  if (flags.oauthClientSecret) {
    config.clientSecret = flags.oauthClientSecret;
  }

  if (flags.oauthScopes) {
    // Accept comma-separated or space-separated scopes, normalize to space-separated
    config.scopes = flags.oauthScopes.replace(/,/g, " ").trim();
  }

  if (flags.oauthAutoRegister) {
    config.enableDynamicRegistration = true;
  }

  // Validate: need at least clientId or autoRegister
  if (!config.clientId && !config.enableDynamicRegistration) {
    throw new Error("OAuth preset requires --oauth-client-id or --oauth-auto-register");
  }

  return config;
}

// =============================================================================
// CONFIG FILE LOADING
// =============================================================================

/**
 * Load and validate an OAuth config from a JSON file.
 *
 * @param filePath - Path to the JSON config file
 * @returns Parsed OAuthClientConfig
 * @throws Error if the file cannot be read or is invalid
 */
export async function loadPresetConfigFile(filePath: string): Promise<OAuthClientConfig> {
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read OAuth config file: ${message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`OAuth config file is not valid JSON: ${filePath}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`OAuth config file must contain a JSON object: ${filePath}`);
  }

  const file = parsed as PresetConfigFile;

  // Validate: need at least clientId or autoRegister
  if (!file.clientId && !file.autoRegister) {
    throw new Error(`OAuth config file must include "clientId" or "autoRegister": ${filePath}`);
  }

  const config: OAuthClientConfig = {
    redirectUri: "", // Filled by provider based on callbackPort
  };

  if (file.clientId) {
    if (typeof file.clientId !== "string") {
      throw new Error(`OAuth config: "clientId" must be a string`);
    }
    config.clientId = file.clientId;
  }

  if (file.clientSecret) {
    if (typeof file.clientSecret !== "string") {
      throw new Error(`OAuth config: "clientSecret" must be a string`);
    }
    config.clientSecret = file.clientSecret;
  }

  if (file.scopes) {
    if (typeof file.scopes !== "string") {
      throw new Error(`OAuth config: "scopes" must be a string`);
    }
    config.scopes = file.scopes.replace(/,/g, " ").trim();
  }

  if (file.autoRegister) {
    config.enableDynamicRegistration = true;
  }

  if (file.clientName) {
    if (typeof file.clientName !== "string") {
      throw new Error(`OAuth config: "clientName" must be a string`);
    }
    config.clientName = file.clientName;
  }

  return config;
}

// =============================================================================
// PRESET PROVIDER FACTORY
// =============================================================================

/**
 * Merge CLI flags with an optional config file.
 *
 * CLI flags take precedence over file values.
 */
export async function resolvePresetConfig(flags: PresetCLIFlags): Promise<OAuthClientConfig> {
  let fileConfig: OAuthClientConfig | undefined;

  if (flags.oauthConfig) {
    fileConfig = await loadPresetConfigFile(flags.oauthConfig);
  }

  // If only a config file was provided (no inline flags), return file config
  const hasInlineFlags = !!(
    flags.oauthClientId ||
    flags.oauthClientSecret ||
    flags.oauthScopes ||
    flags.oauthAutoRegister
  );

  if (fileConfig && !hasInlineFlags) {
    return fileConfig;
  }

  // Parse inline flags
  const flagConfig = parsePresetFlags(flags);

  if (!fileConfig) {
    return flagConfig;
  }

  // Merge: CLI flags override file config
  return {
    clientId: flagConfig.clientId ?? fileConfig.clientId,
    clientSecret: flagConfig.clientSecret ?? fileConfig.clientSecret,
    redirectUri: flagConfig.redirectUri || fileConfig.redirectUri || "",
    scopes: flagConfig.scopes ?? fileConfig.scopes,
    enableDynamicRegistration:
      flagConfig.enableDynamicRegistration ?? fileConfig.enableDynamicRegistration,
    clientName: fileConfig.clientName, // Only from file
  };
}

/**
 * Create a non-interactive InspectorOAuthProvider for preset/CLI auth.
 *
 * The returned provider throws an error on redirectToAuthorization instead of
 * opening a browser, since CLI/agent mode has no user to interact with.
 * It will first check the token store for existing valid tokens.
 *
 * @param options - Provider creation options
 * @returns A configured InspectorOAuthProvider with non-interactive redirect
 */
export function createPresetProvider(options: PresetProviderOptions): InspectorOAuthProvider {
  const { serverUrl, config, callbackPort, tokenStore, debug } = options;

  // Fill in redirect URI based on callback port
  const resolvedConfig: OAuthClientConfig = {
    ...config,
    redirectUri: config.redirectUri || `http://127.0.0.1:${callbackPort}/oauth/callback`,
  };

  const provider = new InspectorOAuthProvider({
    serverUrl,
    config: resolvedConfig,
    callbackPort,
    tokenStore,
    debug,
  });

  // Override redirectToAuthorization to throw instead of waiting for browser
  const originalRedirect = provider.redirectToAuthorization.bind(provider);
  provider.redirectToAuthorization = async (authorizationUrl: URL): Promise<void> => {
    // Still store the URL for debugging/logging purposes
    await originalRedirect(authorizationUrl);

    // But throw immediately — no browser is available in CLI/agent mode
    throw new Error(
      `OAuth authorization required but no browser available in preset/CLI mode. ` +
        `Authorization URL: ${authorizationUrl.toString()}`
    );
  };

  return provider;
}

/**
 * Check whether existing tokens are available for a server URL.
 *
 * Useful for determining whether auth is needed before starting a connection.
 *
 * @param serverUrl - The target MCP server URL
 * @param tokenStore - Token store to check (uses default if not provided)
 * @returns The stored tokens, or undefined if none exist
 */
export async function checkExistingTokens(
  serverUrl: string,
  tokenStore?: TokenStore
): Promise<{ hasTokens: boolean; hasRefreshToken: boolean }> {
  const store = tokenStore ?? new TokenStore();
  const persisted = await store.load(serverUrl);

  if (!persisted?.tokens?.access_token) {
    return { hasTokens: false, hasRefreshToken: false };
  }

  return {
    hasTokens: true,
    hasRefreshToken: !!persisted.tokens.refresh_token,
  };
}
