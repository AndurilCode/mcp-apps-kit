/**
 * Well-Known Endpoint Proxy for OAuth in Dual Mode
 *
 * Proxies upstream OAuth discovery endpoints (RFC 9728 + RFC 8414) through
 * the inspector's proxy port, rewriting the `resource` field to point to the
 * proxy URL instead of the upstream server.
 *
 * Endpoints:
 *   GET /.well-known/oauth-protected-resource  — RFC 9728 Protected Resource Metadata
 *   GET /.well-known/oauth-authorization-server — RFC 8414 Authorization Server Metadata
 *
 * Features:
 *   - Fetches and caches upstream metadata with configurable TTL
 *   - Rewrites `resource` field in protected resource metadata
 *   - Returns 404 when no OAuth-protected upstream is connected
 */

import type http from "http";
import type { OAuthProtectedResourceMetadata, OAuthMetadata } from "./types";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Cached metadata entry with TTL tracking.
 */
interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

/**
 * Options for the well-known proxy.
 */
export interface WellKnownProxyOptions {
  /** Cache TTL in milliseconds. Default: 5 minutes (300_000) */
  cacheTtlMs?: number;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Context needed to resolve upstream URLs and rewrite metadata.
 */
export interface WellKnownProxyContext {
  /** The upstream server URL (e.g., "https://mcp.example.com") */
  upstreamUrl: string;

  /** The proxy URL that clients see (e.g., "http://localhost:6274") */
  proxyUrl: string;

  /** Optional Bearer token for authenticating upstream fetches */
  authToken?: string | null;
}

// =============================================================================
// WELL-KNOWN PROXY
// =============================================================================

/**
 * Creates a well-known endpoint proxy that caches and rewrites upstream
 * OAuth discovery metadata.
 *
 * @param options - Proxy configuration
 * @returns Handler function for well-known routes
 */
export function createWellKnownProxy(options: WellKnownProxyOptions = {}) {
  const cacheTtlMs = options.cacheTtlMs ?? 300_000; // 5 minutes
  const debug = options.debug ?? false;

  // Separate caches per upstream URL to handle reconnections
  let resourceCache: CacheEntry<OAuthProtectedResourceMetadata> | null = null;
  let authServerCache: CacheEntry<OAuthMetadata> | null = null;
  let cachedUpstreamUrl: string | null = null;

  function log(message: string): void {
    if (debug) {
      // eslint-disable-next-line no-console
      console.log(`[oauth:wellknown-proxy] ${message}`);
    }
  }

  /**
   * Check if a cache entry is still valid.
   */
  function isCacheValid<T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> {
    if (!entry) return false;
    return Date.now() - entry.fetchedAt < cacheTtlMs;
  }

  /**
   * Invalidate caches when upstream URL changes.
   */
  function ensureCacheForUpstream(upstreamUrl: string): void {
    if (cachedUpstreamUrl !== upstreamUrl) {
      log(`Upstream changed from ${cachedUpstreamUrl} to ${upstreamUrl}, clearing cache`);
      resourceCache = null;
      authServerCache = null;
      cachedUpstreamUrl = upstreamUrl;
    }
  }

  /**
   * Fetch JSON from an upstream URL with optional Bearer auth.
   */
  async function fetchUpstream<T>(url: string, authToken?: string | null): Promise<T | null> {
    log(`Fetching upstream: ${url}`);
    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
      };
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        log(`Upstream returned ${response.status} for ${url}`);
        return null;
      }

      return (await response.json()) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`Failed to fetch upstream ${url}: ${message}`);
      return null;
    }
  }

  /**
   * Build the upstream well-known URL from the server URL.
   *
   * Per RFC 9728, the well-known URI is at the origin of the resource server.
   */
  function buildWellKnownUrl(upstreamUrl: string, path: string): string {
    const parsed = new URL(upstreamUrl);
    return `${parsed.origin}${path}`;
  }

  /**
   * Rewrite the `resource` field in protected resource metadata
   * to point to the proxy URL instead of the upstream server.
   */
  function rewriteResourceMetadata(
    metadata: OAuthProtectedResourceMetadata,
    proxyUrl: string
  ): OAuthProtectedResourceMetadata {
    return {
      ...metadata,
      resource: proxyUrl,
    };
  }

  /**
   * Fetch (or return cached) protected resource metadata from upstream.
   */
  async function getProtectedResourceMetadata(
    ctx: WellKnownProxyContext
  ): Promise<OAuthProtectedResourceMetadata | null> {
    ensureCacheForUpstream(ctx.upstreamUrl);

    if (isCacheValid(resourceCache)) {
      log("Returning cached protected resource metadata");
      return rewriteResourceMetadata(resourceCache.data, ctx.proxyUrl);
    }

    const url = buildWellKnownUrl(ctx.upstreamUrl, "/.well-known/oauth-protected-resource");
    const data = await fetchUpstream<OAuthProtectedResourceMetadata>(url, ctx.authToken);

    if (data) {
      resourceCache = { data, fetchedAt: Date.now() };
      log("Cached protected resource metadata");
      return rewriteResourceMetadata(data, ctx.proxyUrl);
    }

    return null;
  }

  /**
   * Fetch (or return cached) authorization server metadata from upstream.
   */
  async function getAuthServerMetadata(ctx: WellKnownProxyContext): Promise<OAuthMetadata | null> {
    ensureCacheForUpstream(ctx.upstreamUrl);

    if (isCacheValid(authServerCache)) {
      log("Returning cached auth server metadata");
      return authServerCache.data;
    }

    const url = buildWellKnownUrl(ctx.upstreamUrl, "/.well-known/oauth-authorization-server");
    const data = await fetchUpstream<OAuthMetadata>(url, ctx.authToken);

    if (data) {
      authServerCache = { data, fetchedAt: Date.now() };
      log("Cached auth server metadata");
      return data;
    }

    return null;
  }

  /**
   * Clear all cached metadata. Useful for testing or when upstream changes.
   */
  function clearCache(): void {
    resourceCache = null;
    authServerCache = null;
    cachedUpstreamUrl = null;
    log("Cache cleared");
  }

  /**
   * Handle a well-known HTTP request.
   *
   * @param req - HTTP incoming request
   * @param res - HTTP server response
   * @param ctx - Proxy context (upstream URL, proxy URL, auth token)
   * @returns true if the request was handled, false to pass through
   */
  async function handleWellKnownRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    ctx: WellKnownProxyContext | null
  ): Promise<boolean> {
    const url = req.url ?? "/";

    // Only handle well-known OAuth paths
    if (
      url !== "/.well-known/oauth-protected-resource" &&
      url !== "/.well-known/oauth-authorization-server"
    ) {
      return false;
    }

    // Only GET is allowed for discovery
    if (req.method !== "GET") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return true;
    }

    // No upstream connected or no OAuth context
    if (!ctx) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Not found",
          message: "No OAuth-protected upstream server connected",
        })
      );
      return true;
    }

    if (url === "/.well-known/oauth-protected-resource") {
      const metadata = await getProtectedResourceMetadata(ctx);
      if (!metadata) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Bad Gateway",
            message: "Upstream server does not expose protected resource metadata",
          })
        );
        return true;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(metadata));
      return true;
    }

    if (url === "/.well-known/oauth-authorization-server") {
      const metadata = await getAuthServerMetadata(ctx);
      if (!metadata) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Bad Gateway",
            message: "Upstream server does not expose authorization server metadata",
          })
        );
        return true;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(metadata));
      return true;
    }

    return false;
  }

  return {
    handleWellKnownRequest,
    getProtectedResourceMetadata,
    getAuthServerMetadata,
    clearCache,
  };
}
