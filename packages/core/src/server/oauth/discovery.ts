/**
 * Authorization Server Metadata Discovery
 *
 * Implements RFC 8414 (OAuth 2.0 Authorization Server Metadata) discovery.
 * Automatically discovers JWKS URI from authorization server metadata endpoint.
 */

import { OAuthError, ErrorCode } from "./errors.js";

/**
 * Authorization Server Metadata from RFC 8414.
 * Returned by /.well-known/oauth-authorization-server endpoint.
 */
export interface AuthorizationServerMetadata {
  /**
   * Authorization server issuer identifier.
   * @example "https://auth.example.com"
   */
  issuer: string;

  /**
   * JWKS endpoint URI.
   * @example "https://auth.example.com/.well-known/jwks.json"
   */
  jwks_uri: string;

  /**
   * Supported response types.
   * @example ["code", "token"]
   */
  response_types_supported: string[];

  /**
   * Supported grant types.
   * @example ["authorization_code", "refresh_token"]
   */
  grant_types_supported?: string[];

  /**
   * Token endpoint URI.
   * @example "https://auth.example.com/token"
   */
  token_endpoint?: string;

  /**
   * Authorization endpoint URI.
   * @example "https://auth.example.com/authorize"
   */
  authorization_endpoint?: string;

  /**
   * Supported scopes.
   * @example ["openid", "profile", "email"]
   */
  scopes_supported?: string[];
}

/**
 * Discover authorization server metadata via RFC 8414 endpoint.
 *
 * Fetches metadata from {authorizationServer}/.well-known/oauth-authorization-server
 * and validates the response.
 *
 * @param authorizationServer - Base URL of the authorization server
 * @param timeoutMs - Timeout in milliseconds (default: 5000ms)
 * @returns Authorization server metadata including JWKS URI
 * @throws OAuthError if discovery fails or response is invalid
 *
 * @example
 * ```typescript
 * const metadata = await discoverAuthServerMetadata('https://auth.example.com');
 * console.log(metadata.jwks_uri); // "https://auth.example.com/.well-known/jwks.json"
 * ```
 */
export async function discoverAuthServerMetadata(
  authorizationServer: string,
  timeoutMs = 5000
): Promise<AuthorizationServerMetadata> {
  // Construct discovery endpoint URL per RFC 8414
  const discoveryUrl = `${authorizationServer}/.well-known/oauth-authorization-server`;

  try {
    // Fetch metadata with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(discoveryUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new OAuthError(
        ErrorCode.INVALID_REQUEST,
        `Authorization server metadata discovery failed: HTTP ${response.status} ${response.statusText}`,
        500
      );
    }

    const metadata = (await response.json()) as AuthorizationServerMetadata;

    // Validate required fields
    if (!metadata.issuer) {
      throw new OAuthError(
        ErrorCode.INVALID_REQUEST,
        "Authorization server metadata missing required 'issuer' field",
        500
      );
    }

    if (!metadata.jwks_uri) {
      throw new OAuthError(
        ErrorCode.INVALID_REQUEST,
        "Authorization server metadata missing required 'jwks_uri' field",
        500
      );
    }

    // Validate issuer matches authorization server
    if (metadata.issuer !== authorizationServer) {
      throw new OAuthError(
        ErrorCode.INVALID_REQUEST,
        `Issuer mismatch: expected '${authorizationServer}', got '${metadata.issuer}'`,
        500
      );
    }

    // Validate JWKS URI uses HTTPS in production
    if (
      process.env.NODE_ENV === "production" &&
      !metadata.jwks_uri.startsWith("https://")
    ) {
      throw new OAuthError(
        ErrorCode.INVALID_REQUEST,
        "JWKS URI must use HTTPS in production",
        500
      );
    }

    return metadata;
  } catch (error) {
    if (error instanceof OAuthError) {
      throw error;
    }

    // Handle fetch errors (network, timeout, etc.)
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new OAuthError(
          ErrorCode.INVALID_REQUEST,
          `Authorization server metadata discovery timed out after ${timeoutMs}ms`,
          500
        );
      }

      throw new OAuthError(
        ErrorCode.INVALID_REQUEST,
        `Authorization server metadata discovery failed: ${error.message}`,
        500
      );
    }

    throw new OAuthError(
      ErrorCode.INVALID_REQUEST,
      "Authorization server metadata discovery failed with unknown error",
      500
    );
  }
}

/**
 * Extract JWKS URI from authorization server metadata.
 * Handles both explicit JWKS URI and automatic discovery.
 *
 * @param authorizationServer - Base URL of the authorization server
 * @param explicitJwksUri - Optional explicit JWKS URI from config
 * @returns JWKS URI for key fetching
 * @throws OAuthError if both discovery and explicit URI fail
 *
 * @example
 * ```typescript
 * // Automatic discovery
 * const jwksUri = await getJwksUri('https://auth.example.com');
 *
 * // Explicit URI (skips discovery)
 * const jwksUri = await getJwksUri(
 *   'https://auth.example.com',
 *   'https://custom.com/keys.json'
 * );
 * ```
 */
export async function getJwksUri(
  authorizationServer: string,
  explicitJwksUri?: string
): Promise<string> {
  // Use explicit JWKS URI if provided
  if (explicitJwksUri) {
    return explicitJwksUri;
  }

  // Discover JWKS URI from authorization server metadata
  const metadata = await discoverAuthServerMetadata(authorizationServer);
  return metadata.jwks_uri;
}
