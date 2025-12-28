/**
 * JWT Signature Verification
 *
 * Verifies JWT signatures using JWKS public keys and validates claims.
 */

import jwt from "jsonwebtoken";
import type { JwksClient } from "jwks-rsa";
import { OAuthError, ErrorCode } from "./errors.js";
import type { ValidatedToken, OAuthConfig } from "./types.js";

/**
 * Get signing key from JWKS client for JWT verification.
 *
 * @param client - JWKS client instance
 * @param kid - Key ID from JWT header
 * @returns Public key in PEM format
 */
async function getKey(client: JwksClient, kid: string): Promise<string> {
  try {
    const key = await client.getSigningKey(kid);
    return key.getPublicKey();
  } catch (error) {
    throw new OAuthError(
      ErrorCode.INVALID_TOKEN,
      `Failed to get signing key: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Verify JWT signature and validate claims.
 *
 * @param token - Bearer token string
 * @param config - OAuth configuration
 * @param jwksClient - JWKS client for fetching public keys
 * @returns Validated token details
 * @throws OAuthError if verification fails
 *
 * @example
 * ```typescript
 * const validatedToken = await verifyJWT(
 *   'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
 *   oauthConfig,
 *   jwksClient
 * );
 * console.log(validatedToken.clientId); // "client-123"
 * ```
 */
export async function verifyJWT(
  token: string,
  config: OAuthConfig,
  jwksClient: JwksClient
): Promise<ValidatedToken> {
  try {
    // Decode JWT header to get key ID (kid)
    const decoded = jwt.decode(token, { complete: true });

    if (!decoded || typeof decoded === "string") {
      throw new OAuthError(ErrorCode.INVALID_TOKEN, "Malformed JWT token");
    }

    const kid = decoded.header.kid;
    if (!kid) {
      throw new OAuthError(ErrorCode.INVALID_TOKEN, "JWT missing key ID (kid) in header");
    }

    // Get public key from JWKS
    const publicKey = await getKey(jwksClient, kid);

    // Determine allowed algorithms (default: RS256)
    const algorithms = config.algorithms ?? ["RS256"];

    // Determine expected audience (default: protectedResource)
    const audience = config.audience ?? config.protectedResource;

    // Normalize issuer to handle trailing slash differences
    // Auth0 and other providers may return issuer with trailing slash
    const normalizedIssuer = config.authorizationServer.replace(/\/$/, "");

    // Build verification options
    const verifyOptions: jwt.VerifyOptions = {
      algorithms: algorithms as jwt.Algorithm[],
      issuer: [normalizedIssuer, `${normalizedIssuer}/`], // Accept both with and without trailing slash
      clockTolerance: 5, // 5 second clock skew tolerance
    };

    // Handle audience (can be string or array)
    if (typeof audience === "string") {
      verifyOptions.audience = audience;
    } else if (Array.isArray(audience) && audience.length > 0) {
      // Convert string array to the tuple type expected by jwt.verify
      verifyOptions.audience = audience as [string, ...string[]];
    }

    // Verify signature and claims
    const payload = jwt.verify(token, publicKey, verifyOptions) as jwt.JwtPayload;

    // Extract validated token details
    const clientId = payload.client_id || payload.azp;
    if (!clientId) {
      throw new OAuthError(
        ErrorCode.INVALID_TOKEN,
        "JWT missing required claim: client_id or azp"
      );
    }

    const sub = payload.sub;
    if (!sub) {
      throw new OAuthError(ErrorCode.INVALID_TOKEN, "JWT missing required claim: sub");
    }

    const exp = payload.exp;
    if (!exp) {
      throw new OAuthError(ErrorCode.INVALID_TOKEN, "JWT missing required claim: exp");
    }

    // Extract scopes (space-separated string per RFC 8693)
    const scopeString = payload.scope || "";
    const scopes = typeof scopeString === "string" ? scopeString.split(" ").filter(Boolean) : [];

    // Return validated token
    return {
      token,
      clientId,
      scopes,
      expiresAt: exp,
      extra: {
        subject: sub,
        issuer: payload.iss,
        audience: payload.aud,
        ...payload,
      },
    };
  } catch (error) {
    // Handle JWT verification errors
    if (error instanceof OAuthError) {
      throw error;
    }

    if (error instanceof jwt.TokenExpiredError) {
      throw new OAuthError(ErrorCode.INVALID_TOKEN, "Token expired");
    }

    if (error instanceof jwt.JsonWebTokenError) {
      throw new OAuthError(
        ErrorCode.INVALID_TOKEN,
        `Token verification failed: ${error.message}`
      );
    }

    if (error instanceof jwt.NotBeforeError) {
      throw new OAuthError(ErrorCode.INVALID_TOKEN, "Token not yet valid (nbf claim)");
    }

    throw new OAuthError(
      ErrorCode.INVALID_TOKEN,
      `Token verification failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Extract subject (user identifier) from validated token.
 *
 * @param validatedToken - Validated token from JWT verification
 * @returns User identifier (sub claim)
 */
export function extractSubject(validatedToken: ValidatedToken): string {
  return validatedToken.extra?.subject as string;
}
