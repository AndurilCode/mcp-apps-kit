# OAuth 2.1 Authentication for ChatGPT Apps

Complete guide to implementing OAuth 2.1 authentication for ChatGPT Apps following the MCP authorization specification.

## Overview

ChatGPT Apps that expose user-specific data or write actions must implement OAuth 2.1 authentication with:

- **PKCE (Proof Key for Code Exchange)** - Mandatory for security
- **Dynamic Client Registration (DCR)** - ChatGPT registers itself per session
- **Resource-scoped tokens** - Tokens tied to specific MCP server
- **Discovery metadata** - Well-known endpoints for configuration

## Architecture

### Components

**Your MCP Server (Resource Server)**
- Exposes tools and protected resources
- Publishes protected resource metadata
- Verifies access tokens on every request
- Returns `401` with `WWW-Authenticate` when auth required

**Your Authorization Server (Identity Provider)**
- Issues access tokens
- Publishes OAuth discovery metadata
- Supports dynamic client registration
- Implements PKCE with `S256` code challenge

**ChatGPT (OAuth Client)**
- Discovers auth configuration
- Registers dynamic client
- Runs authorization code + PKCE flow
- Attaches tokens to MCP requests

## Implementation Steps

### Step 1: Protected Resource Metadata

Expose metadata at `/.well-known/oauth-protected-resource` on your MCP server:

```json
{
  "resource": "https://your-mcp.example.com",
  "authorization_servers": [
    "https://auth.yourcompany.com"
  ],
  "scopes_supported": ["read", "write", "admin"],
  "resource_documentation": "https://yourcompany.com/docs/api",
  "token_endpoint_auth_methods_supported": ["none"],
  "introspection_endpoint": "https://auth.yourcompany.com/introspect"
}
```

**Required fields:**

- `resource`: Canonical HTTPS identifier for your MCP server (ChatGPT sends this as `resource` query param during OAuth)
- `authorization_servers`: Array of issuer base URLs pointing to your identity provider

**Optional fields (RFC 9728):**

- `scopes_supported`: List of available scopes for documentation
- `resource_documentation`: URL to API docs
- `token_endpoint_auth_methods_supported`: Auth methods for token endpoint
- `introspection_endpoint`: Token introspection URL

**Alternative: WWW-Authenticate header**

Return this on `401 Unauthorized` responses:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://your-mcp.example.com/.well-known/oauth-protected-resource", scope="read write"
```

### Step 2: Authorization Server Metadata

Publish OAuth discovery metadata at one of:
- `https://auth.yourcompany.com/.well-known/oauth-authorization-server`
- `https://auth.yourcompany.com/.well-known/openid-configuration` (OpenID Connect)

```json
{
  "issuer": "https://auth.yourcompany.com",
  "authorization_endpoint": "https://auth.yourcompany.com/oauth2/authorize",
  "token_endpoint": "https://auth.yourcompany.com/oauth2/token",
  "registration_endpoint": "https://auth.yourcompany.com/oauth2/register",
  "code_challenge_methods_supported": ["S256"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "scopes_supported": ["read", "write", "admin"],
  "token_endpoint_auth_methods_supported": ["none", "client_secret_post"],
  "jwks_uri": "https://auth.yourcompany.com/.well-known/jwks.json"
}
```

**Critical fields:**

- `authorization_endpoint`: Where to redirect user for consent
- `token_endpoint`: Where to exchange authorization code for token
- `registration_endpoint`: Dynamic client registration endpoint
- `code_challenge_methods_supported`: **MUST include `"S256"`** for PKCE
- `jwks_uri`: Public keys for token signature verification

### Step 3: Redirect URIs

Allowlist these redirect URIs in your authorization server:

**Production:**
```
https://chatgpt.com/connector_platform_oauth_redirect
```

**Review/Testing:**
```
https://platform.openai.com/apps-manage/oauth
```

ChatGPT redirects here after user consent with authorization code.

### Step 4: Tool Security Schemes

Declare auth requirements per tool:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const server = new McpServer({ name: "my-app", version: "1.0.0" });

// Public tool (no auth)
server.registerTool(
  "search_public",
  {
    title: "Public Search",
    description: "Search public data",
    inputSchema: { /* ... */ },
    securitySchemes: [
      { type: "noauth" }
    ],
    _meta: {
      "openai/outputTemplate": "ui://widget/app.html"
    }
  },
  async ({ input }) => {
    return { content: [], structuredContent: {} };
  }
);

// Optional auth (works both ways)
server.registerTool(
  "search_enhanced",
  {
    title: "Enhanced Search",
    description: "Search with optional personalization",
    inputSchema: { /* ... */ },
    securitySchemes: [
      { type: "noauth" },
      { type: "oauth2", scopes: ["read"] }
    ],
    _meta: {
      "openai/outputTemplate": "ui://widget/app.html"
    }
  },
  async ({ input }, context) => {
    // Check if user authenticated
    const isAuthenticated = !!context.authorization;
    // Return personalized or generic results
    return { content: [], structuredContent: {} };
  }
);

// Auth required
server.registerTool(
  "create_booking",
  {
    title: "Create Booking",
    description: "Create a restaurant booking",
    inputSchema: { /* ... */ },
    securitySchemes: [
      { type: "oauth2", scopes: ["write"] }
    ],
    _meta: {
      "openai/outputTemplate": "ui://widget/app.html"
    }
  },
  async ({ input }, context) => {
    // Verify token first
    if (!context.authorization) {
      return {
        content: [{ type: "text", text: "Authentication required" }],
        _meta: {
          "mcp/www_authenticate": [
            'Bearer resource_metadata="https://your-mcp.example.com/.well-known/oauth-protected-resource", error="insufficient_scope", error_description="Login to create bookings"'
          ]
        },
        isError: true
      };
    }
    
    const user = await verifyToken(context.authorization);
    // Create booking for user
    return { content: [], structuredContent: {} };
  }
);
```

**Security scheme types:**

- `noauth`: Tool is publicly accessible
- `oauth2`: Requires OAuth 2.0 access token with specified scopes

**Declaring both:** Enables graceful degradation (works without auth, enhanced with auth)

### Step 5: Token Verification

Verify tokens on **every** request:

```typescript
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

// Initialize JWKS client
const client = jwksClient({
  jwksUri: "https://auth.yourcompany.com/.well-known/jwks.json",
  cache: true,
  cacheMaxAge: 600000, // 10 minutes
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

async function verifyToken(authHeader: string) {
  // Extract token from "Bearer <token>"
  const token = authHeader.replace(/^Bearer\s+/i, "");
  
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        algorithms: ["RS256"],
        issuer: "https://auth.yourcompany.com",
        audience: "https://your-mcp.example.com", // Your resource identifier
      },
      (err, decoded) => {
        if (err) return reject(err);
        
        // Additional checks
        const now = Math.floor(Date.now() / 1000);
        if (decoded.exp < now) {
          return reject(new Error("Token expired"));
        }
        
        // Verify scopes
        const scopes = decoded.scope?.split(" ") ?? [];
        
        resolve({
          userId: decoded.sub,
          scopes,
          expiresAt: decoded.exp,
        });
      }
    );
  });
}

// Use in tool handler
server.registerTool(
  "protected_action",
  {
    title: "Protected Action",
    securitySchemes: [{ type: "oauth2", scopes: ["write"] }],
    // ...
  },
  async ({ input }, context) => {
    try {
      const user = await verifyToken(context.authorization);
      
      // Enforce scope
      if (!user.scopes.includes("write")) {
        return {
          content: [{ type: "text", text: "Insufficient permissions" }],
          _meta: {
            "mcp/www_authenticate": [
              'Bearer resource_metadata="https://your-mcp.example.com/.well-known/oauth-protected-resource", error="insufficient_scope", error_description="This action requires write permission"'
            ]
          },
          isError: true
        };
      }
      
      // Execute protected action
      const result = await performAction(user.userId, input);
      return { content: [], structuredContent: result };
      
    } catch (error) {
      return {
        content: [{ type: "text", text: "Authentication failed" }],
        _meta: {
          "mcp/www_authenticate": [
            'Bearer resource_metadata="https://your-mcp.example.com/.well-known/oauth-protected-resource", error="invalid_token", error_description="Token verification failed"'
          ]
        },
        isError: true
      };
    }
  }
);
```

**Verification checklist:**

1. ✅ Extract token from `Authorization: Bearer <token>` header
2. ✅ Verify signature using JWKS from authorization server
3. ✅ Check issuer (`iss`) matches your auth server
4. ✅ Check audience (`aud`) matches your resource identifier
5. ✅ Check expiration (`exp`) hasn't passed
6. ✅ Check not-before (`nbf`) if present
7. ✅ Verify required scopes present
8. ✅ Return `401` with `WWW-Authenticate` on failure

### Step 6: Trigger Authentication UI

Return error with `mcp/www_authenticate` metadata when auth required:

```typescript
// Token missing or invalid
return {
  content: [
    { type: "text", text: "Authentication required to access this feature" }
  ],
  _meta: {
    "mcp/www_authenticate": [
      'Bearer resource_metadata="https://your-mcp.example.com/.well-known/oauth-protected-resource", error="insufficient_scope", error_description="Please login to continue"'
    ]
  },
  isError: true
};
```

**WWW-Authenticate format:**

```
Bearer resource_metadata="<metadata-url>", error="<error-code>", error_description="<user-message>"
```

**Error codes (OAuth 2.0 spec):**

- `invalid_token`: Token is malformed, expired, or revoked
- `insufficient_scope`: Token lacks required scopes
- `invalid_request`: Request format error

## OAuth Flow

The complete flow when user invokes an authenticated tool:

```
1. ChatGPT calls tool
   ↓
2. MCP server returns 401 with WWW-Authenticate
   ↓
3. ChatGPT fetches protected resource metadata
   ↓
4. ChatGPT fetches authorization server metadata
   ↓
5. ChatGPT registers dynamic client (DCR)
   ← receives client_id
   ↓
6. ChatGPT generates PKCE code_verifier and code_challenge
   ↓
7. ChatGPT redirects user to authorization_endpoint
   with: client_id, redirect_uri, scope, state, code_challenge, code_challenge_method=S256, resource
   ↓
8. User authenticates and consents
   ↓
9. Authorization server redirects to ChatGPT with authorization code
   ↓
10. ChatGPT exchanges code for token at token_endpoint
    with: code, code_verifier, client_id, redirect_uri, resource
    ← receives access_token, refresh_token, expires_in
    ↓
11. ChatGPT retries tool call with Authorization: Bearer <token>
    ↓
12. MCP server verifies token and executes tool
```

## Resource Parameter

**Critical:** Echo the `resource` parameter throughout the flow.

ChatGPT appends `resource=https%3A%2F%2Fyour-mcp.example.com` to:
- Authorization request
- Token request

Your authorization server **must**:
1. Accept the `resource` parameter
2. Include it in issued access token (typically as `aud` claim)
3. Enforce resource scope at token endpoint

**Example token payload:**

```json
{
  "iss": "https://auth.yourcompany.com",
  "sub": "user-123",
  "aud": "https://your-mcp.example.com",
  "exp": 1735689600,
  "iat": 1735686000,
  "scope": "read write"
}
```

**Verification:**

```typescript
jwt.verify(token, publicKey, {
  issuer: "https://auth.yourcompany.com",
  audience: "https://your-mcp.example.com", // Must match resource param
});
```

## PKCE Implementation

**Code Challenge Method:** ChatGPT uses `S256` (SHA-256 hash)

**Authorization server must:**
1. Accept `code_challenge` and `code_challenge_method` in authorization request
2. Store code challenge with authorization code
3. Verify `code_verifier` matches stored challenge at token exchange

**Verification (token endpoint):**

```typescript
import crypto from "crypto";

function verifyPKCE(codeVerifier: string, storedChallenge: string): boolean {
  // Compute challenge from verifier
  const computedChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  
  return computedChallenge === storedChallenge;
}
```

Without PKCE verification, authorization codes can be intercepted and replayed.

## Identity Providers

### Recommended Providers

**Auth0**
- [MCP Authorization Guide](https://github.com/openai/openai-mcpkit/blob/main/python-authenticated-mcp-server-scaffold/README.md#2-configure-auth0-authentication)
- Supports DCR out of the box
- Easy to configure resource parameters

**Stytch**
- [MCP Server Overview](https://stytch.com/docs/guides/connected-apps/mcp-server-overview)
- [MCP Authorization Guide](https://stytch.com/blog/MCP-authentication-and-authorization-guide/)
- [Apps SDK Specific Guide](https://stytch.com/blog/guide-to-authentication-for-the-openai-apps-sdk/)
- Purpose-built for MCP

**Custom Implementation**
- Use libraries like `node-oauth2-server` or `authlib` (Python)
- Ensure PKCE support and DCR endpoints
- Test thoroughly with MCP Inspector

### Provider Configuration Checklist

1. ✅ Enable dynamic client registration
2. ✅ Support PKCE with `S256` code challenge method
3. ✅ Accept `resource` parameter in authorization and token requests
4. ✅ Include `resource` in token `aud` claim
5. ✅ Expose discovery metadata at well-known endpoint
6. ✅ Allowlist ChatGPT redirect URIs
7. ✅ Publish JWKS endpoint for token verification
8. ✅ Configure token expiration (recommend 1-24 hours)
9. ✅ Support refresh tokens for long-lived sessions

## Dynamic Client Registration (DCR)

ChatGPT registers a new OAuth client per connection using RFC 7591.

**Registration endpoint receives:**

```json
{
  "client_name": "ChatGPT Connector for <User>",
  "redirect_uris": [
    "https://chatgpt.com/connector_platform_oauth_redirect"
  ],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",
  "scope": "read write"
}
```

**Registration endpoint returns:**

```json
{
  "client_id": "client-abc123",
  "client_secret": null,
  "client_name": "ChatGPT Connector for <User>",
  "redirect_uris": [
    "https://chatgpt.com/connector_platform_oauth_redirect"
  ],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}
```

**Challenges:**
- Creates many short-lived clients (one per user session)
- Can clutter client database
- Hard to enforce per-client policies

**Future: Client Metadata Documents (CMID)**

MCP is advancing CMID as replacement for DCR. ChatGPT will publish stable metadata at `https://openai.com/chatgpt.json` that authorization servers can fetch and pin.

Until CMID lands, continue supporting DCR.

## Client Identification

**Question:** How to confirm requests come from ChatGPT?

**Current answer:** Network-level filtering

Allowlist ChatGPT's egress IP ranges: [chatgpt-connectors.json](https://openai.com/chatgpt-connectors.json)

**Future:** CMID will provide HTTPS-hosted signed declaration of ChatGPT's identity.

**Not supported:**
- Machine-to-machine OAuth (client credentials)
- Service accounts
- JWT bearer assertions
- mTLS certificates
- Custom API keys

## Testing

### MCP Inspector

Use [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) Auth settings:

1. Start MCP server locally
2. Open Inspector and connect to `http://localhost:<port>/mcp`
3. Navigate to Auth tab
4. Walk through OAuth flow step by step:
   - Fetch protected resource metadata
   - Fetch authorization server metadata
   - Register dynamic client
   - Initiate authorization flow
   - Exchange code for token
   - Call protected tool with token

### Test Checklist

1. ✅ Protected resource metadata returns correct JSON
2. ✅ Authorization server metadata includes `S256` in `code_challenge_methods_supported`
3. ✅ Registration endpoint creates client and returns `client_id`
4. ✅ Authorization endpoint accepts PKCE parameters
5. ✅ Token endpoint verifies PKCE `code_verifier`
6. ✅ Token endpoint includes `resource` in token `aud`
7. ✅ Tokens include correct scopes
8. ✅ MCP server verifies token signature, issuer, audience, expiry
9. ✅ MCP server returns 401 with `WWW-Authenticate` when token invalid
10. ✅ ChatGPT shows linking UI when tool requires auth

## Security Considerations

### Token Storage

**Never expose tokens in:**
- `structuredContent` (model reads this)
- `content` (model reads this)
- `_meta` (widget reads this)
- `widgetState` (persisted, model may read)
- Widget localStorage/sessionStorage (not reliably sandboxed)

**Tokens should only:**
- Be attached to MCP requests by ChatGPT
- Be verified server-side
- Never reach widget or model

### Scope Enforcement

Always verify token scopes match required operation:

```typescript
if (!user.scopes.includes("write")) {
  return { /* 401 insufficient_scope */ };
}
```

Don't rely on tool `securitySchemes` declaration alone - enforce server-side.

### Token Rotation

- Issue short-lived access tokens (1-24 hours)
- Support refresh tokens for long sessions
- Revoke tokens on logout or suspicious activity
- Clear tokens when user disconnects connector

### Audit Logging

Log authentication events:
- Token issued/refreshed/revoked
- Failed verification attempts
- Scope violations
- Unusual patterns (rapid retries, etc.)

Redact PII from logs.

## Troubleshooting

### OAuth flow never starts

**Symptoms:**
- No linking UI appears
- Tool fails silently

**Solutions:**
1. Verify protected resource metadata returns correct JSON at `/.well-known/oauth-protected-resource`
2. Ensure tool has `securitySchemes` declared
3. Check tool handler returns `_meta["mcp/www_authenticate"]` with error on auth failure
4. Verify `WWW-Authenticate` includes `error` and `error_description` parameters

### Authorization redirect fails

**Symptoms:**
- User redirected but flow doesn't complete
- Error in ChatGPT: "OAuth redirect failed"

**Solutions:**
1. Verify redirect URI allowlisted: `https://chatgpt.com/connector_platform_oauth_redirect`
2. Check authorization server logs for errors
3. Confirm `code_challenge_methods_supported` includes `S256`
4. Verify authorization endpoint accepts `resource` parameter

### Token exchange fails

**Symptoms:**
- Authorization code exchanged but no token returned
- Error: "Token request failed"

**Solutions:**
1. Check token endpoint accepts PKCE `code_verifier`
2. Verify code challenge validation logic (SHA-256 hash of verifier)
3. Confirm token endpoint accepts `resource` parameter
4. Check authorization code hasn't expired (typically 10 minutes)

### Token verification fails

**Symptoms:**
- Tool returns 401 even with valid token
- Error: "Token verification failed"

**Solutions:**
1. Verify token signature using JWKS from authorization server
2. Check issuer (`iss`) matches authorization server URL
3. Confirm audience (`aud`) matches your resource identifier
4. Verify token hasn't expired (`exp`)
5. Check required scopes present in token

### Linking UI loops

**Symptoms:**
- OAuth completes but immediately prompts again
- Token seems valid but keeps asking for login

**Solutions:**
1. Verify token includes correct `aud` (your resource identifier)
2. Check token endpoint includes `resource` parameter in issued token
3. Confirm MCP server accepts token in subsequent requests
4. Check token expiration (`exp`) is future timestamp
5. Verify JWKS keys haven't changed (check cache TTL)

## SDK Support

### TypeScript MCP SDK

Token verification helpers:

```typescript
import { withAuth } from "@modelcontextprotocol/sdk/server/auth.js";

// Configure auth
const authConfig = {
  jwksUri: "https://auth.yourcompany.com/.well-known/jwks.json",
  issuer: "https://auth.yourcompany.com",
  audience: "https://your-mcp.example.com",
};

// Wrap tool handler with auth
server.registerTool(
  "protected_tool",
  { /* ... */ },
  withAuth(authConfig, async ({ input }, context) => {
    // context.user populated with verified token data
    const userId = context.user.sub;
    // ...
  })
);
```

### Python MCP SDK

Token verification:

```python
from mcp.server.auth import verify_token

@server.tool(security_schemes=[{"type": "oauth2", "scopes": ["read"]}])
async def protected_tool(input: dict, context: dict):
    token = context.get("authorization")
    if not token:
        raise AuthError("Authentication required")
    
    user = await verify_token(
        token,
        issuer="https://auth.yourcompany.com",
        audience="https://your-mcp.example.com",
        jwks_uri="https://auth.yourcompany.com/.well-known/jwks.json"
    )
    
    # Use user.sub, user.scopes
    return {"content": [], "structuredContent": {}}
```

## Resources

**Specifications:**
- [RFC 9728 - OAuth 2.0 Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
- [RFC 8414 - OAuth 2.0 Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [RFC 7591 - Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591)
- [RFC 7636 - Proof Key for Code Exchange (PKCE)](https://datatracker.ietf.org/doc/html/rfc7636)
- [OpenID Connect Discovery](https://openid.net/specs/openid-connect-discovery-1_0.html)
- [MCP Authorization Spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)

**Guides:**
- [Auth0 MCP Configuration](https://github.com/openai/openai-mcpkit/blob/main/python-authenticated-mcp-server-scaffold/README.md)
- [Stytch MCP Overview](https://stytch.com/docs/guides/connected-apps/mcp-server-overview)
- [Stytch Authorization Guide](https://stytch.com/blog/MCP-authentication-and-authorization-guide/)

**Tools:**
- [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)
- [JWT.io Debugger](https://jwt.io/)
- [OAuth Debugger](https://oauthdebugger.com/)
