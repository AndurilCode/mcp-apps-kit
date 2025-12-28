/**
 * OAuth 2.1 Authentication Module
 *
 * This module provides OAuth 2.1 authentication with built-in JWT verification,
 * automatic JWKS discovery, and bearer token validation for MCP Apps Kit applications.
 *
 * @packageDocumentation
 */

export type {
  OAuthConfig,
  ValidatedToken,
  AuthContext,
  TokenVerifier,
} from "./types.js";

export { OAuthConfigSchema } from "./types.js";

export { OAuthError, ErrorCode } from "./errors.js";
