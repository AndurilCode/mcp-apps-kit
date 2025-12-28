import { z } from "zod";

/**
 * Token verifier interface for custom token verification.
 * Allows developers to implement custom validation logic for non-JWT tokens
 * or use token introspection endpoints.
 */
export interface TokenVerifier {
  /**
   * Verify an access token and return validated details.
   *
   * @param token - The bearer token to verify
   * @returns Promise resolving to ValidatedToken
   * @throws Error if token is invalid
   *
   * @example
   * ```typescript
   * async verifyAccessToken(token: string): Promise<ValidatedToken> {
   *   const res = await fetch('https://auth.example.com/introspect', {
   *     method: 'POST',
   *     body: new URLSearchParams({ token })
   *   })
   *   const data = await res.json()
   *   if (!data.active) throw new Error('Token inactive')
   *   return {
   *     token,
   *     clientId: data.client_id,
   *     scopes: data.scope.split(' '),
   *     expiresAt: data.exp,
   *     extra: { subject: data.sub }
   *   }
   * }
   * ```
   */
  verifyAccessToken(token: string): Promise<ValidatedToken>;
}

/**
 * Result of successful token validation.
 */
export interface ValidatedToken {
  /**
   * The original bearer token string.
   * Planned for token passthrough to downstream APIs.
   */
  token: string;

  /**
   * OAuth client ID that requested the token.
   * Extracted from JWT 'client_id' or 'azp' claim.
   */
  clientId: string;

  /**
   * OAuth scopes granted to the token.
   * Extracted from JWT 'scope' claim (space-separated string).
   */
  scopes: string[];

  /**
   * Token expiration timestamp (Unix epoch seconds).
   * Extracted from JWT 'exp' claim.
   */
  expiresAt: number;

  /**
   * Optional: Provider-specific or custom validation data.
   * Preserved from custom tokenVerifier or JWT claims.
   */
  extra?: Record<string, unknown>;
}

/**
 * Authenticated request context injected into tool handlers.
 */
export interface AuthContext {
  /**
   * Authenticated user identifier (from JWT 'sub' claim).
   * Injected into _meta["openai/subject"] for cross-platform compatibility.
   */
  subject: string;

  /**
   * OAuth scopes granted to the token.
   */
  scopes: string[];

  /**
   * Token expiration timestamp (Unix epoch seconds).
   */
  expiresAt: number;

  /**
   * OAuth client ID that requested the token.
   */
  clientId: string;

  /**
   * Token issuer (authorization server URL).
   */
  issuer: string;

  /**
   * Token audience (protected resource identifier).
   * May be string or array based on JWT 'aud' claim.
   */
  audience: string | string[];

  /**
   * Optional: Original bearer token string.
   * Planned for token passthrough.
   */
  token?: string;

  /**
   * Optional: Provider-specific or custom data from ValidatedToken.extra.
   */
  extra?: Record<string, unknown>;
}

/**
 * OAuth 2.1 configuration object.
 */
export interface OAuthConfig {
  /**
   * Public URL of this MCP server (the Protected Resource).
   * Used as the default audience for JWT validation.
   *
   * @example "http://localhost:3000"
   * @example "https://api.example.com"
   */
  protectedResource: string;

  /**
   * Issuer URL of the OAuth 2.1 Authorization Server.
   * Used for automatic JWKS discovery and issuer validation.
   *
   * @example "https://auth.example.com"
   * @example "https://accounts.google.com"
   */
  authorizationServer: string;

  /**
   * Optional: Explicit JWKS URI to override automatic discovery.
   * If not provided, framework discovers via /.well-known/oauth-authorization-server
   *
   * @example "https://auth.example.com/.well-known/jwks.json"
   */
  jwksUri?: string;

  /**
   * Optional: Allowed JWT signing algorithms.
   * Defaults to ["RS256"] if not specified.
   *
   * @example ["RS256", "RS384", "RS512"]
   * @example ["ES256"]
   */
  algorithms?: string[];

  /**
   * Optional: Expected audience for JWT validation.
   * Defaults to protectedResource if not specified.
   *
   * @example "https://api.example.com"
   * @example ["https://api.example.com", "https://api.example.org"]
   */
  audience?: string | string[];

  /**
   * Optional: Required OAuth scopes for all requests.
   * If specified, tokens must contain ALL listed scopes.
   *
   * @example ["mcp:read", "mcp:write"]
   * @example []
   */
  scopes?: string[];

  /**
   * Optional: Custom token verification function.
   * If provided, replaces built-in JWT verification.
   * Use for token introspection, custom validation, or non-JWT tokens.
   */
  tokenVerifier?: TokenVerifier;
}

/**
 * Zod schema for OAuthConfig validation.
 * Used at app startup to validate OAuth configuration.
 */
export const OAuthConfigSchema = z.object({
  protectedResource: z.url("Protected resource must be a valid URL"),
  authorizationServer: z.url("Authorization server must be a valid URL"),
  jwksUri: z.string().url("JWKS URI must be a valid URL").optional(),
  algorithms: z.array(z.string()).min(1, "At least one algorithm required").optional(),
  audience: z.union([z.string(), z.array(z.string())]).optional(),
  scopes: z.array(z.string()).optional(),
  tokenVerifier: z
    .object({
      verifyAccessToken: z.function(),
    })
    .optional(),
});
