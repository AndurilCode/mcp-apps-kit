/**
 * JWKS Client Initialization
 *
 * Manages JWKS (JSON Web Key Set) client for fetching and caching public keys.
 * Uses jwks-rsa library for automatic caching and key rotation.
 */

import jwksClient from "jwks-rsa";
import type { JwksClient, SigningKey } from "jwks-rsa";

/**
 * JWKS client configuration options.
 */
export interface JwksClientConfig {
  /**
   * JWKS endpoint URI.
   * @example "https://auth.example.com/.well-known/jwks.json"
   */
  jwksUri: string;

  /**
   * Cache duration in milliseconds.
   * @default 600000 (10 minutes)
   */
  cacheMaxAge?: number;

  /**
   * Maximum requests per minute to JWKS endpoint.
   * Prevents abuse and rate limiting.
   * @default 10
   */
  jwksRequestsPerMinute?: number;

  /**
   * Request timeout in milliseconds.
   * @default 5000 (5 seconds)
   */
  timeout?: number;
}

/**
 * Create JWKS client for fetching and caching public keys.
 *
 * The client uses built-in caching from jwks-rsa library:
 * - 10-minute TTL by default
 * - Automatic refresh on unknown key ID
 * - Rate limiting to prevent abuse
 *
 * @param config - JWKS client configuration
 * @returns Configured JWKS client instance
 *
 * @example
 * ```typescript
 * const client = createJwksClient({
 *   jwksUri: 'https://auth.example.com/.well-known/jwks.json'
 * });
 *
 * // Get signing key for JWT verification
 * const key = await client.getSigningKey('key-id-123');
 * console.log(key.getPublicKey());
 * ```
 */
export function createJwksClient(config: JwksClientConfig): JwksClient {
  return jwksClient({
    jwksUri: config.jwksUri,
    cache: true,
    cacheMaxAge: config.cacheMaxAge ?? 600000, // 10 minutes
    rateLimit: true,
    jwksRequestsPerMinute: config.jwksRequestsPerMinute ?? 10,
    timeout: config.timeout ?? 5000,
  });
}

/**
 * Get signing key from JWKS client.
 *
 * Fetches the signing key for a given key ID (kid).
 * Uses in-memory cache with automatic expiration and refresh.
 *
 * @param client - JWKS client instance
 * @param kid - Key ID from JWT header
 * @returns Signing key for signature verification
 * @throws Error if key not found or fetch fails
 *
 * @example
 * ```typescript
 * const client = createJwksClient({ jwksUri: '...' });
 * const key = await getSigningKey(client, 'key-123');
 * const publicKey = key.getPublicKey(); // PEM format
 * ```
 */
export async function getSigningKey(client: JwksClient, kid: string): Promise<SigningKey> {
  return client.getSigningKey(kid);
}
