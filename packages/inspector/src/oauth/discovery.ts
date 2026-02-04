/**
 * OAuth Auth Discovery Service
 *
 * Discovers authentication requirements for an MCP server by fetching:
 *   1. OAuth Protected Resource Metadata (RFC 9728)
 *   2. Authorization Server Metadata (RFC 8414) with OIDC fallback
 *
 * Used for 401 auto-detection: when connecting to a server without
 * pre-configured OAuth, this module probes the server's .well-known
 * endpoints to determine what OAuth capabilities the server supports
 * (dynamic client registration, CIMD, required scopes, etc.).
 *
 * A backend proxy endpoint (/api/oauth/discover) exposes this to the
 * dashboard, bypassing CORS restrictions on browser-side .well-known fetches.
 */

import { discoverOAuthProtectedResourceMetadata } from "@modelcontextprotocol/sdk/client/auth.js";
import { discoverAuthorizationServerMetadata } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthProtectedResourceMetadata,
  AuthorizationServerMetadata,
} from "@modelcontextprotocol/sdk/shared/auth.js";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of probing a server's OAuth discovery endpoints.
 *
 * Contains all the information needed to decide whether to:
 *   - Proceed with dynamic client registration (DCR)
 *   - Use Client ID Metadata Document (CIMD)
 *   - Prompt the user for manual client credentials (pre-registration)
 */
export interface AuthRequiredEvent {
  /** The MCP server URL that was probed */
  serverUrl: string;

  /** Protected Resource Metadata (RFC 9728), or null if unavailable */
  resourceMetadata: OAuthProtectedResourceMetadata | null;

  /** Authorization server URL extracted from resourceMetadata.authorization_servers[0] */
  authServerUrl: string | null;

  /** Authorization Server Metadata (RFC 8414 or OIDC), or null if unavailable */
  authServerMetadata: AuthorizationServerMetadata | null;

  /** Whether the auth server supports Dynamic Client Registration (registration_endpoint exists) */
  supportsDCR: boolean;

  /** Whether the auth server supports Client ID Metadata Document (client_id_metadata_document_supported === true) */
  supportsCIMD: boolean;

  /** Whether manual client registration is required (neither DCR nor CIMD available) */
  requiresPreRegistration: boolean;

  /** Suggested scopes from PRM or auth server metadata */
  suggestedScopes: string[];
}

// =============================================================================
// DISCOVERY
// =============================================================================

/**
 * Discover OAuth authentication requirements for an MCP server.
 *
 * Flow:
 *   1. Fetch `{origin}/.well-known/oauth-protected-resource` → parse PRM
 *   2. Extract `authorization_servers[0]` from PRM
 *   3. Fetch auth server metadata (RFC 8414, then OIDC fallback)
 *   4. Detect DCR / CIMD capabilities
 *   5. Extract suggested scopes
 *
 * @param serverUrl - The MCP server URL to probe (e.g., "https://mcp.notion.com/mcp")
 * @returns Discovery result with server capabilities
 */
export async function discoverAuthRequirements(serverUrl: string): Promise<AuthRequiredEvent> {
  const result: AuthRequiredEvent = {
    serverUrl,
    resourceMetadata: null,
    authServerUrl: null,
    authServerMetadata: null,
    supportsDCR: false,
    supportsCIMD: false,
    requiresPreRegistration: true,
    suggestedScopes: [],
  };

  // Step 1: Fetch Protected Resource Metadata (RFC 9728)
  // SDK throws if the server doesn't implement PRM (404 or network error)
  try {
    result.resourceMetadata = await discoverOAuthProtectedResourceMetadata(serverUrl);
  } catch {
    // Server doesn't support PRM — return defaults (no auth info available)
    return result;
  }

  // Step 2: Extract authorization server URL from PRM
  const authServers = result.resourceMetadata.authorization_servers;
  if (authServers && authServers.length > 0) {
    // authorization_servers is URL[] (Zod ZodURL), convert to string
    result.authServerUrl = String(authServers[0]);
  }

  if (!result.authServerUrl) {
    // PRM exists but no auth server specified — extract scopes and return
    result.suggestedScopes = result.resourceMetadata.scopes_supported ?? [];
    return result;
  }

  // Step 3: Fetch Authorization Server Metadata (RFC 8414 + OIDC fallback)
  // SDK's discoverAuthorizationServerMetadata already tries:
  //   1. /.well-known/oauth-authorization-server
  //   2. /.well-known/openid-configuration (OIDC fallback)
  // Returns undefined on 4xx, throws on 5xx
  try {
    const metadata = await discoverAuthorizationServerMetadata(result.authServerUrl);
    result.authServerMetadata = metadata ?? null;
  } catch {
    // Auth server metadata unavailable — leave null
  }

  // Step 4: Detect capabilities from auth server metadata
  if (result.authServerMetadata) {
    const meta = result.authServerMetadata as Record<string, unknown>;

    // DCR: registration_endpoint exists and is non-null
    result.supportsDCR =
      "registration_endpoint" in meta &&
      meta.registration_endpoint !== undefined &&
      meta.registration_endpoint !== null;

    // CIMD: client_id_metadata_document_supported === true
    result.supportsCIMD =
      "client_id_metadata_document_supported" in meta &&
      meta.client_id_metadata_document_supported === true;

    // Pre-registration required only if neither DCR nor CIMD is available
    result.requiresPreRegistration = !result.supportsDCR && !result.supportsCIMD;
  }

  // Step 5: Extract scopes (PRM takes priority, fallback to auth server metadata)
  const prmScopes = result.resourceMetadata.scopes_supported;
  if (prmScopes && prmScopes.length > 0) {
    result.suggestedScopes = prmScopes;
  } else if (result.authServerMetadata) {
    const meta = result.authServerMetadata as Record<string, unknown>;
    if ("scopes_supported" in meta && Array.isArray(meta.scopes_supported)) {
      result.suggestedScopes = meta.scopes_supported as string[];
    }
  }

  return result;
}
