/**
 * OAuth Validation Middleware
 *
 * Validates bearer tokens at the HTTP transport layer before tool execution.
 */

import type { Request, Response, NextFunction } from "express";
import type { JwksClient } from "jwks-rsa";
import { OAuthError, ErrorCode } from "./errors.js";
import type { OAuthConfig, ValidatedToken, AuthContext } from "./types.js";
import { verifyJWT } from "./jwt-verifier.js";

/**
 * Extract bearer token from Authorization header.
 *
 * @param req - Express request object
 * @returns Bearer token string
 * @throws OAuthError if token is missing or malformed
 *
 * @example
 * ```typescript
 * const token = extractBearerToken(req);
 * // "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
 * ```
 */
export function extractBearerToken(req: Request): string {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    // Per RFC 6750: Missing credentials should return 401 with invalid_token
    throw new OAuthError(ErrorCode.INVALID_TOKEN, "Missing Authorization header");
  }

  if (!authHeader.startsWith("Bearer ")) {
    // Per RFC 6750: Invalid auth scheme should return 401 with invalid_token
    throw new OAuthError(
      ErrorCode.INVALID_TOKEN,
      "Invalid Authorization header format. Expected: Bearer <token>"
    );
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix

  if (!token || token.trim().length === 0) {
    // Per RFC 6750: Empty/missing token should return 401 with invalid_token
    throw new OAuthError(ErrorCode.INVALID_TOKEN, "Empty bearer token");
  }

  return token;
}

/**
 * Validate OAuth scopes against required scopes.
 *
 * @param tokenScopes - Scopes from the validated token
 * @param requiredScopes - Required scopes from configuration
 * @throws OAuthError if token is missing required scopes
 */
function validateScopes(tokenScopes: string[], requiredScopes?: string[]): void {
  if (!requiredScopes || requiredScopes.length === 0) {
    return; // No scope validation required
  }

  const missingScopes = requiredScopes.filter((scope) => !tokenScopes.includes(scope));

  if (missingScopes.length > 0) {
    const error = new OAuthError(
      ErrorCode.INSUFFICIENT_SCOPE,
      `Token missing required scopes: ${missingScopes.join(", ")}`
    );
    error.wwwAuthenticateParams = {
      scope: requiredScopes.join(" "),
    };
    throw error;
  }
}

/**
 * Transform ValidatedToken to AuthContext for injection.
 *
 * @param validatedToken - Validated token from JWT verification
 * @returns Auth context for request metadata
 */
function createAuthContext(validatedToken: ValidatedToken): AuthContext {
  return {
    subject: validatedToken.extra?.subject as string,
    scopes: validatedToken.scopes,
    expiresAt: validatedToken.expiresAt,
    clientId: validatedToken.clientId,
    issuer: validatedToken.extra?.issuer as string,
    audience: validatedToken.extra?.audience as string | string[],
    token: validatedToken.token,
    extra: validatedToken.extra,
  };
}

/**
 * Inject authenticated context into request metadata.
 *
 * Injects auth details into MCP request _meta for tool handler access:
 * - _meta["openai/subject"]: User identifier (cross-platform)
 * - _meta["mcp-apps-kit/auth"]: Full auth context (framework-specific)
 *
 * @param req - Express request object
 * @param authContext - Authenticated context
 */
function injectAuthContext(req: Request, authContext: AuthContext): void {
  // Per MCP spec: _meta should be inside params, not at root level of JSON-RPC message
  const body = req.body as {
    params?: { _meta?: Record<string, unknown> };
  };

  // Ensure params object exists
  body.params ??= {};

  // Get or create _meta object inside params
  body.params._meta ??= {};

  // Inject subject for cross-platform compatibility (always override client value)
  body.params._meta["openai/subject"] = authContext.subject;

  // Inject full auth context for framework-specific access
  body.params._meta["mcp-apps-kit/auth"] = authContext;
}

/**
 * Create OAuth validation middleware.
 *
 * This middleware validates bearer tokens before MCP request processing.
 * It extracts the token, verifies the signature, validates claims and scopes,
 * and injects authenticated context into the request.
 *
 * @param config - OAuth configuration
 * @param jwksClient - JWKS client for JWT verification (null if custom verifier)
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * const middleware = createOAuthMiddleware(oauthConfig, jwksClient);
 * app.use('/mcp', middleware);
 * ```
 */
export function createOAuthMiddleware(
  config: OAuthConfig,
  jwksClient: JwksClient | null
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Extract bearer token from Authorization header
      const token = extractBearerToken(req);

      let validatedToken: ValidatedToken;

      // Use custom verifier if provided, otherwise use JWT verification
      if (config.tokenVerifier) {
        validatedToken = await config.tokenVerifier.verifyAccessToken(token);
      } else {
        if (!jwksClient) {
          throw new OAuthError(
            ErrorCode.INVALID_REQUEST,
            "OAuth configuration error: JWKS client not initialized"
          );
        }
        validatedToken = await verifyJWT(token, config, jwksClient);
      }

      // Validate scopes if required
      validateScopes(validatedToken.scopes, config.scopes);

      // Create auth context
      const authContext = createAuthContext(validatedToken);

      // Inject auth context into request metadata
      injectAuthContext(req, authContext);

      // Continue to next middleware/handler
      next();
    } catch (error) {
      // Handle OAuth errors
      if (error instanceof OAuthError) {
        // Generate WWW-Authenticate header
        const wwwAuthenticate = error.toWWWAuthenticateHeader(config.protectedResource);

        res.setHeader("WWW-Authenticate", wwwAuthenticate);
        res.status(error.statusCode).json(error.toJSON());
        return;
      }

      // Handle unexpected errors
      const oauthError = new OAuthError(
        ErrorCode.INVALID_TOKEN,
        error instanceof Error ? error.message : "Unknown authentication error"
      );

      const wwwAuthenticate = oauthError.toWWWAuthenticateHeader(config.protectedResource);
      res.setHeader("WWW-Authenticate", wwwAuthenticate);
      res.status(oauthError.statusCode).json(oauthError.toJSON());
    }
  };
}
