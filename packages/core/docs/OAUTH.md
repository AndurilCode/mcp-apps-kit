# OAuth Integration Guide

This guide explains how to integrate OAuth 2.1 authentication with your MCP Apps Kit application using the MCP TypeScript SDK OAuth helpers and Express.

## Overview

`@mcp-apps-kit/core` provides **built-in OAuth 2.1 JWT verification** with automatic JWKS discovery - just configure your authorization server URL and the core handles everything automatically.

The MCP TypeScript SDK provides:

- Running an OAuth Authorization Server (AS) with standard endpoints + discovery metadata.
- Protecting an MCP Resource Server (RS) with bearer token authentication.

**What `@mcp-apps-kit/core` adds:**
- ✅ Built-in JWT verification using JWKS
- ✅ **Automatic JWKS discovery** from authorization server metadata
- ✅ Automatic token validation at the transport layer
- ✅ No manual `verifyAccessToken` implementation needed

Important note: tool handlers and middleware receive metadata derived from the request body's `_meta` field (e.g. `openai/subject`). HTTP headers (like `Authorization`) are not surfaced directly to tools.

When you configure OAuth via `createApp({ config: { oauth: ... } })`, `@mcp-apps-kit/core` validates `Authorization: Bearer …` at the transport layer (before any tools run) and injects a stable subject into `_meta` so tool handlers can read it as `context.subject`.

## Prerequisites

```bash
npm install @modelcontextprotocol/sdk express
```

- Node.js: `>=18`
- @modelcontextprotocol/sdk: `^1.25.1` (with OAuth support)
- Express: `^5.2.0`

**Note:** JWT verification libraries (`jsonwebtoken`, `jwks-rsa`) are built into `@mcp-apps-kit/core` - you don't need to install them separately.

## OAuth Architecture

OAuth integration in MCP servers typically requires three core endpoints:

1. **`/authorize`** - Handles authorization requests and user consent
2. **`/token`** - Manages token exchange and refresh operations
3. **`/register`** (optional) - Enables dynamic client registration

In addition, MCP authorization relies on discovery metadata:

- **Protected Resource Metadata (RS):** `/.well-known/oauth-protected-resource` (and/or via `WWW-Authenticate` `resource_metadata=`)
  - Contains: `resource` identifier, `authorization_servers` array
- **Authorization Server Metadata (AS):** `/.well-known/oauth-authorization-server` (and/or `/.well-known/openid-configuration`)
  - Contains: OAuth endpoints, **`jwks_uri`** for token verification, supported features

**Note:** The `jwksUri` you configure in `@mcp-apps-kit/core` comes from the **Authorization Server metadata**, not the Protected Resource metadata.

## Basic OAuth Setup

### 1. Run an OAuth Authorization Server (AS)

The simplest (and most spec-aligned) setup is to run your OAuth AS separately from your MCP server. You can use the SDK’s `mcpAuthRouter()` which installs standard OAuth endpoints and metadata.

```typescript
import express from "express";
import {
  mcpAuthRouter,
  ProxyOAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/index.js";

const app = express();
app.use(express.json());

// Example provider that proxies to an upstream IdP.
// Alternatively, implement a first-party OAuthServerProvider.
const provider = new ProxyOAuthServerProvider({
  endpoints: {
    authorizationUrl: "https://auth.example.com/authorize",
    tokenUrl: "https://auth.example.com/token",
    registrationUrl: "https://auth.example.com/register",
    revocationUrl: "https://auth.example.com/revoke",
  },
  verifyAccessToken: async (token) => {
    // For the authorization server: implement token verification
    // This is only needed if you're running your own AS with ProxyOAuthServerProvider
    // Your @mcp-apps-kit/core resource server doesn't need this - it has built-in JWT verification
    
    return {
      token,
      clientId: "client-123",
      scopes: ["mcp:read"],
      expiresAt: Math.floor(Date.now() / 1000) + 60 * 60,
    };
  },
  getClient: async (clientId) => {
    // Look up OAuth client configuration
    return {
      client_id: clientId,
      redirect_uris: ["http://localhost:3000/callback"],
      grant_types: ["authorization_code", "refresh_token"],
    };
  },
});

// Install router at root. If you mount under "/oauth", endpoints become "/oauth/authorize", etc.
app.use(
  mcpAuthRouter({
    provider,
    issuerUrl: new URL("https://auth.example.com"),
    baseUrl: new URL("http://localhost:3001"),
  })
);

app.listen(3001);
```

### 2. Treat `@mcp-apps-kit/core` as a Resource Server (RS)

In `@mcp-apps-kit/core`, you enable bearer token validation by setting `config.auth`. Validation happens at the HTTP/transport edge inside the built-in server.

On successful validation, the server:

- Injects `openai/subject` into request `_meta` (overriding any client-provided value), making it available to tools as `context.subject`.
- Injects validated auth details into `_meta["mcp-apps-kit/auth"]` (available via `context.raw`).

```typescript
import { createApp } from "@mcp-apps-kit/core";
import { z } from "zod";

// Create your MCP app with built-in JWT verification
const app = createApp({
  name: "my-authenticated-app",
  version: "1.0.0",
  config: {
    oauth: {
      // Public URL of this MCP server (the Protected Resource)
      protectedResource: "http://localhost:3000",
      // Issuer URL for your OAuth Authorization Server
      // Core auto-discovers JWKS URI from /.well-known/oauth-authorization-server
      authorizationServer: "https://auth.example.com",
      // Scopes required to call any tools on this server
      scopes: ["mcp:read"],
      // Optional: explicit JWKS URI (if not using standard discovery)
      // jwksUri: "https://auth.example.com/.well-known/jwks.json",
      // Optional: algorithms to accept (defaults to ["RS256"])
      // algorithms: ["RS256"],
      // Optional: custom audience validation (defaults to protectedResource)
      // audience: "http://localhost:3000",
    },
  },
  tools: {
    secure_action: {
      description: "An action requiring authentication",
      input: z.object({ data: z.string() }),
      handler: async (input, context) => {
        // Access user identity from context (derived from validated bearer token)
        const userId = context.subject;
        if (!userId) {
          throw new Error("Authentication required");
        }

        return { success: true, userId };
      },
    },
  },
});

// Start the MCP server (default route is POST /mcp)
await app.start({ port: 3000 });
```

### 3. Where Token Validation Happens

`@mcp-apps-kit/core` validates bearer tokens **automatically** at the transport layer (HTTP handler) when `config.oauth` is configured.

**What happens automatically:**
1. **On startup:** Core fetches `/.well-known/oauth-authorization-server` to discover JWKS URI (unless explicitly provided)
2. Core extracts the `Authorization: Bearer <token>` header from requests
3. Fetches public keys from the JWKS endpoint (with caching)
4. Validates JWT signature using the fetched keys
5. Verifies issuer, audience, and expiration
6. Extracts scopes and subject from token claims
7. Injects `openai/subject` into `_meta` (overriding client-provided values)
8. Makes validated data available via `context.subject` and `context.raw?.["mcp-apps-kit/auth"]`

**Tool handlers receive:**
- Validated identity via `context.subject` (injected into `_meta["openai/subject"]`)
- Additional validated data via `context.raw?.["mcp-apps-kit/auth"]`
- Tools **currently do not** receive the bearer token itself (see "Token Passthrough for Downstream APIs" section for planned enhancement)
- Tools **never** receive the raw `Authorization` header

If you prefer to validate tokens in a gateway/reverse proxy, you can do that and omit `config.oauth`. In that case, inject `openai/subject` into the MCP request `_meta` directly.

### Token Passthrough for Downstream APIs (Planned)

**Current behavior:** Tools receive only the validated identity (`context.subject`) and metadata from the token. The bearer token itself is not currently passed to tool handlers.

**Planned enhancement:** For scenarios where tools need to call downstream APIs on behalf of the authenticated user, the framework will make the bearer token available via the context:

```typescript
tools: {
  call_external_api: {
    description: "Calls an external API using the user's token",
    input: z.object({ endpoint: z.string() }),
    handler: async (input, context) => {
      // Planned: Access the original bearer token for passthrough
      const token = context.token; // or context.raw?.["mcp-apps-kit/auth"]?.token

      // Call downstream API with the same token
      const response = await fetch(input.endpoint, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      return await response.json();
    },
  },
}
```

**Use cases:**
- Calling organization APIs that use the same OAuth provider
- Proxying authenticated requests to microservices
- Integrating with third-party APIs that accept the same tokens

**Security considerations:**
- Tokens should only be used for passthrough when calling trusted downstream services
- Validate that the token has appropriate scopes for the downstream API
- Consider token expiration when making chained calls
- Never log or persist bearer tokens

## Session Management with OAuth

By default, `@mcp-apps-kit/core` handles JWT verification automatically. If you need additional server-side session checks (beyond token validation), you can add custom middleware.

```typescript
import { createApp } from "@mcp-apps-kit/core";
import { z } from "zod";

const sessions = new Map<string, { expiresAtMs: number }>();

const app = createApp({
  name: "secure-app",
  version: "1.0.0",
  config: {
    oauth: {
      protectedResource: "http://localhost:3000",
      authorizationServer: "https://auth.example.com", // JWKS URI auto-discovered
      scopes: ["mcp:read"],
    },
  },
  // Add middleware for session validation (optional)
  middleware: [
    async (context, next) => {
      // JWT already validated by core at this point
      const subject = context.subject;
      
      if (subject) {
        const session = sessions.get(subject);
        if (!session || session.expiresAtMs < Date.now()) {
          throw new Error("Session expired");
        }
      }
      
      await next();
    },
  ],
  tools: {
    // ... your tools ...
  },
});

await app.start({ port: 3000 });
```

## Database Schema for OAuth

To persist OAuth data, you'll need these models (example using Prisma):

```prisma
model OAuthClient {
  id           String   @id @default(cuid())
  clientId     String   @unique
  clientSecret String
  redirectUris String[]
  name         String
  createdAt    DateTime @default(now())
}

model AuthorizationCode {
  id          String   @id @default(cuid())
  code        String   @unique
  clientId    String
  userId      String
  redirectUri String
  scope       String?
  expiresAt   DateTime
  createdAt   DateTime @default(now())
}

model AccessToken {
  id        String   @id @default(cuid())
  token     String   @unique
  userId    String
  clientId  String
  scope     String?
  expiresAt DateTime
  createdAt DateTime @default(now())
}

model RefreshToken {
  id        String   @id @default(cuid())
  token     String   @unique
  userId    String
  clientId  String
  expiresAt DateTime
  createdAt DateTime @default(now())
}
```

## Token Verification

`@mcp-apps-kit/core` provides **built-in JWT verification** using JWKS. Simply configure your authorization server's JWKS endpoint and the core handles everything automatically.

### Built-in JWT Verification (Recommended)

The easiest approach - no manual verification code needed:

```typescript
import { createApp } from "@mcp-apps-kit/core";

const app = createApp({
  name: "my-app",
  version: "1.0.0",
  config: {
    oauth: {
      protectedResource: "http://localhost:3000",
      authorizationServer: "https://auth.example.com", // That's it!
      scopes: ["mcp:read"],
    },
  },
  tools: { /* ... */ },
});
```

**How it works:**
1. On startup, core fetches `https://auth.example.com/.well-known/oauth-authorization-server`
2. Extracts `jwks_uri` from the metadata
3. Fetches and caches public keys from JWKS endpoint
4. On each request:
   - Validates JWT signature, issuer, audience, expiration
   - Extracts subject and scopes
   - Injects verified identity into `context.subject`
5. All automatic - no manual configuration needed!

**Explicit JWKS URI (optional):**

If your authorization server doesn't support standard discovery, you can provide the JWKS URI explicitly:

```typescript
oauth: {
  protectedResource: "http://localhost:3000",
  authorizationServer: "https://auth.example.com",
  jwksUri: "https://custom-domain.com/keys.json", // Override auto-discovery
  scopes: ["mcp:read"],
}
```

### Advanced: Custom Token Verification

For special cases (token introspection, custom validation, non-JWT tokens), you can provide a custom `verifyAccessToken` function:

```typescript
import { createApp } from "@mcp-apps-kit/core";

const app = createApp({
  name: "my-app",
  version: "1.0.0",
  config: {
    oauth: {
      protectedResource: "http://localhost:3000",
      authorizationServer: "https://auth.example.com",
      scopes: ["mcp:read"],
      // Custom verification (overrides built-in JWT verification)
      tokenVerifier: {
        verifyAccessToken: async (token) => {
          // Your custom logic (e.g., token introspection)
          const response = await fetch("https://auth.example.com/introspect", {
            method: "POST",
            body: new URLSearchParams({ token }),
          });
          const data = await response.json();
          
          if (!data.active) throw new Error("Token inactive");
          
          return {
            token,
            clientId: data.client_id,
            scopes: data.scope.split(" "),
            expiresAt: data.exp,
            extra: { subject: data.sub },
          };
        },
      },
    },
  },
  tools: { /* ... */ },
});
```

### Manual JWT Verification (If Not Using Core)

If you're implementing your own OAuth server or need to verify JWTs outside of `@mcp-apps-kit/core`, here's how to do it manually:

```typescript
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

// Initialize JWKS client to fetch public keys
const client = jwksClient({
  jwksUri: "https://auth.example.com/.well-known/jwks.json",
  cache: true,
  cacheMaxAge: 600000, // 10 minutes
});

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

async function verifyAccessToken(token: string) {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        algorithms: ["RS256"], // Most OAuth providers use RS256
        issuer: "https://auth.example.com",
        audience: "http://localhost:3000", // Your resource identifier
      },
      (err, decoded) => {
        if (err) return reject(err);
        
        const payload = decoded as jwt.JwtPayload;
        
        // Additional validation
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
          return reject(new Error("Token expired"));
        }
        
        // Extract scopes
        const scopes = typeof payload.scope === "string" 
          ? payload.scope.split(" ") 
          : [];
        
        resolve({
          token,
          clientId: payload.client_id || payload.azp || "unknown",
          scopes,
          expiresAt: payload.exp || now + 3600,
          extra: { subject: payload.sub },
        });
      }
    );
  });
}
```

**Required packages (only if not using `@mcp-apps-kit/core`):**
```bash
npm install jsonwebtoken jwks-rsa
npm install --save-dev @types/jsonwebtoken
```

### Verification Checklist

When using `@mcp-apps-kit/core`, **all of these are handled automatically:**

1. ✅ **JWKS Discovery** - Auto-fetched from `/.well-known/oauth-authorization-server`
2. ✅ **Token signature** - Validated using discovered JWKS
3. ✅ **Issuer (`iss`)** - Checked against `authorizationServer`
4. ✅ **Audience (`aud`)** - Checked against `protectedResource` (or custom `audience`)
5. ✅ **Expiration (`exp`)** - Verified not passed
6. ✅ **Not-before (`nbf`)** - Verified if present
7. ✅ **Scopes** - Extracted and available in context
8. ✅ **Subject (`sub`)** - Extracted and injected into `context.subject`

**You only need to:**
- Configure `authorizationServer` URL in your OAuth config
- Handle the authenticated context in your tool handlers

## Security Best Practices

### 1. Use HTTPS in Production

```typescript
import https from "https";
import fs from "fs";

const app = createApp({ /* ... */ });

// Create HTTPS server
const httpsServer = https.createServer(
  {
    key: fs.readFileSync("private-key.pem"),
    cert: fs.readFileSync("certificate.pem"),
  },
  app.expressApp
);

httpsServer.listen(443, () => {
  console.log("Secure server running on port 443");
});
```

### 2. Implement Proper Token Expiration

```typescript
const ACCESS_TOKEN_EXPIRY = 3600; // 1 hour
const REFRESH_TOKEN_EXPIRY = 2592000; // 30 days
const AUTH_CODE_EXPIRY = 600; // 10 minutes
```

### 3. Validate Redirect URIs

```typescript
async function validateRedirectUri(clientId: string, redirectUri: string): Promise<boolean> {
  const client = await getClient(clientId);
  return client.redirectUris.includes(redirectUri);
}
```

### 4. Secure Client Secrets

Never expose client secrets in client-side code. Store them securely:

```typescript
import crypto from "crypto";

function generateClientSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}
```

### 5. Use State Parameter

Always validate the state parameter to prevent CSRF attacks:

```typescript
// Server-side example using an in-memory store (demo only)
// In production use a signed/encrypted cookie or a real session store.
const pendingStates = new Set<string>();

function createState(): string {
  const state = crypto.randomBytes(16).toString("base64url");
  pendingStates.add(state);
  return state;
}

function consumeAndValidateState(state: string | undefined): void {
  if (!state || !pendingStates.has(state)) {
    throw new Error("Invalid state parameter");
  }
  pendingStates.delete(state);
}
```

## Complete Example

For runnable OAuth examples (authorization server + client), see the MCP TypeScript SDK examples:

- `examples/shared/src/demoInMemoryOAuthProvider.ts`
- `examples/client/src/simpleOAuthClient.ts`

## Resources

- [MCP Authorization Specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [OAuth 2.1 RFC](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-10)
- [MCP TypeScript SDK OAuth Helpers](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/client.md)
- [An Introduction to MCP and Authorization | Auth0](https://auth0.com/blog/an-introduction-to-mcp-and-authorization/)

### What the MCP SDK & Core Provide

**`@mcp-apps-kit/core` includes:**

✅ **Built-in JWT verification:**
- **Automatic JWKS discovery** from authorization server metadata
- Automatic JWKS fetching and caching
- JWT signature validation
- Issuer, audience, and expiration checking
- Scope extraction
- Subject injection into tool context

✅ **Simple configuration:**
- Just provide `authorizationServer` URL - core discovers and handles the rest
- Supports RS256, RS384, RS512, ES256, ES384, ES512
- Optional explicit `jwksUri` for non-standard servers
- Optional custom `verifyAccessToken` for advanced cases

**`@modelcontextprotocol/sdk` includes:**

✅ **Authorization Server helpers:**
- `mcpAuthRouter()` - Express router with OAuth endpoints (`/authorize`, `/token`, `/register`, etc.)
- `ProxyOAuthServerProvider` - Wrapper for external OAuth providers
- OAuth metadata endpoints (`.well-known/oauth-authorization-server`, `.well-known/oauth-protected-resource`)

✅ **Bearer token authentication:**
- Bearer auth middleware for protecting HTTP endpoints
- Integration with Express apps via `createMcpExpressApp()`

**When you need custom verification:**
- Token introspection (non-JWT tokens)
- Provider-specific SDKs (Auth0, Stytch)
- Custom validation logic
- Additional session checks

## Troubleshooting

### Issue: "Missing or invalid authorization header"

**Solution**: Ensure the MCP client is sending the Bearer token in the Authorization header.

Note: `@mcp-apps-kit/core` does not currently surface HTTP headers to tool middleware/handlers; this error should be raised by your gateway/proxy (or by a custom MCP server that validates tokens) rather than by a tool middleware.

```typescript
// Client-side
const response = await fetch("http://localhost:3000/mcp", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ /* MCP request */ }),
});
```

### Issue: "Token expired"

**Solution**: Implement automatic token refresh:

```typescript
async function refreshAccessToken(refreshToken: string): Promise<string> {
  const response = await fetch("http://localhost:3001/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  const data = await response.json();
  return data.access_token;
}
```

### Issue: "Redirect URI mismatch"

**Solution**: Ensure the redirect URI in the authorization request exactly matches a registered URI:

```typescript
// When registering client
const client = await provider.registerClient({
  redirectUris: ["http://localhost:3000/callback"],
  name: "My App",
});

// When authorizing (must match exactly)
window.location.href = `http://localhost:3000/oauth/authorize?` +
  `client_id=${client.clientId}&` +
  `redirect_uri=http://localhost:3000/callback&` +
  `response_type=code`;
```

If you install the SDK router at the app root, the endpoint will be `/authorize` (not `/oauth/authorize`). If you mount it under `/oauth`, then `/oauth/authorize` is correct.

## Next Steps

1. Implement a user login/consent UI for the `/oauth/authorize` endpoint
2. Set up secure token storage (database or Redis)
3. Add rate limiting to prevent abuse
4. Implement OAuth scope management for fine-grained permissions
5. Add audit logging for security compliance
6. **Planned:** Enable bearer token passthrough to tools for downstream API calls (see "Token Passthrough for Downstream APIs" section)

For production deployments, consider using established OAuth libraries like:
- [oauth2-server](https://www.npmjs.com/package/oauth2-server) for Node.js
- [node-oauth2-server](https://www.npmjs.com/package/node-oauth2-server) with Express integration
