# @mcp-apps-kit/core

[![npm](https://img.shields.io/npm/v/%40mcp-apps-kit%2Fcore)](https://www.npmjs.com/package/@mcp-apps-kit/core) [![node](https://img.shields.io/node/v/%40mcp-apps-kit%2Fcore)](https://www.npmjs.com/package/@mcp-apps-kit/core) [![license](https://img.shields.io/npm/l/%40mcp-apps-kit%2Fcore)](https://www.npmjs.com/package/@mcp-apps-kit/core)

Server-side TypeScript framework for building interactive MCP apps that can run on both:

- **Claude Desktop (MCP Apps)**
- **ChatGPT (OpenAI Apps SDK)**

It provides a single `createApp()` API to define tools, validate inputs/outputs with Zod v4, and attach UI resources to tool responses.

## Install

```bash
npm install @mcp-apps-kit/core zod
```

- Node.js: `>=18`
- Zod: `^4.0.0`

## Quick start

Create an app with one tool using the `defineTool` helper for full type safety:

```ts
import { createApp, defineTool } from "@mcp-apps-kit/core";
import { z } from "zod";

const app = createApp({
  name: "my-app",
  version: "1.0.0",

  tools: {
    greet: defineTool({
      description: "Greet a user",
      input: z.object({
        name: z.string().describe("Name to greet"),
      }),
      output: z.object({ message: z.string() }),
      handler: async (input) => {
        // input.name is fully typed - no assertion needed!
        return { message: `Hello, ${input.name}!` };
      },
    }),
  },
});

await app.start({ port: 3000 });
```

## Type-Safe Tool Definitions

### The `defineTool` Helper

Use `defineTool` to get automatic type inference in your handlers:

```ts
import { defineTool } from "@mcp-apps-kit/core";

tools: {
  search: defineTool({
    input: z.object({
      query: z.string(),
      maxResults: z.number().optional(),
    }),
    handler: async (input) => {
      // ✅ input.query and input.maxResults are fully typed!
      return { results: await search(input.query, input.maxResults) };
    },
  }),
}
```

**Why `defineTool`?**

With Zod v4, TypeScript cannot infer concrete schema types across module boundaries when using generic `z.ZodType`. The `defineTool` helper captures specific schema types at the call site, enabling proper type inference without manual type assertions.

### Alternative: Object Syntax with Type Assertions

If you prefer not to use `defineTool`, you can use the object syntax directly, but you'll need type assertions:

```ts
// Define schema separately
const searchInput = z.object({
  query: z.string(),
  maxResults: z.number().optional(),
});

const app = createApp({
  tools: {
    search: {
      input: searchInput,
      handler: async (input) => {
        // Manual type assertion required
        const typed = input as z.infer<typeof searchInput>;
        return { results: await search(typed.query, typed.maxResults) };
      },
    },
  },
});
```

## Zod v4 Schema Descriptions

Use `.describe()` to add descriptions that appear in tool parameter documentation:

```ts
const myTool = defineTool({
  description: "Search for items",
  input: z.object({
    query: z.string().describe("Search query text"),
    maxResults: z.number().optional().describe("Maximum number of results to return"),
  }),
  handler: async (input) => {
    // input is fully typed
    return { results: [] };
  },
});
```

## Attach UI to tool outputs

Tools can optionally reference a UI resource by ID (e.g. `"restaurant-list"`). The host can then render the returned HTML as a widget.

A common pattern is to return both:

- the model-visible output (typed by your Zod `output` schema), and
- UI-only payload in `_meta`.

```ts
import { createApp } from "@mcp-apps-kit/core";
import { z } from "zod";

const app = createApp({
  name: "restaurant-finder",
  version: "1.0.0",
  tools: {
    search_restaurants: {
      description: "Search for restaurants by location",
      input: z.object({ location: z.string() }),
      output: z.object({ count: z.number() }),
      handler: async ({ location }) => {
        const restaurants = await fetchRestaurants(location);
        return {
          count: restaurants.length,
          _meta: { restaurants },
        };
      },
      ui: "restaurant-list",
    },
  },
  ui: {
    "restaurant-list": {
      html: "./dist/widget.html",
    },
  },
});
```

## Plugins, Middleware & Events

Extend your app with cross-cutting concerns (logging, authentication, analytics) using plugins, middleware, and events.

### Plugins

Plugins provide hooks into the application lifecycle and tool execution:

```ts
import { createPlugin } from "@mcp-apps-kit/core";

const loggingPlugin = createPlugin({
  name: "logger",
  version: "1.0.0",

  // Lifecycle hooks
  onInit: async () => console.log("App initializing..."),
  onStart: async () => console.log("App started"),

  // Tool execution hooks
  beforeToolCall: async (context) => {
    console.log(`Tool called: ${context.toolName}`);
  },
  afterToolCall: async (context, result) => {
    console.log(`Tool completed: ${context.toolName}`);
  },
  onToolError: async (context, error) => {
    console.error(`Tool failed: ${context.toolName}`, error);
  },
});

const app = createApp({
  name: "my-app",
  version: "1.0.0",
  plugins: [loggingPlugin],
  tools: {
    /* ... */
  },
});
```

### Middleware

Middleware processes requests in a pipeline, similar to Express or Koa:

```ts
import type { Middleware } from "@mcp-apps-kit/core";

// Request logging middleware
const logger: Middleware = async (context, next) => {
  const start = Date.now();
  console.log(`Processing ${context.toolName}...`);

  // Store data in context.state (shared with other middleware & handler)
  context.state.set("startTime", start);

  await next(); // Call next middleware or tool handler

  const duration = Date.now() - start;
  console.log(`${context.toolName} completed in ${duration}ms`);
};

// Register middleware (executed in order)
app.use(logger);
app.use(rateLimiter);
app.use(authenticator);
```

### Events

Listen to application events for analytics and monitoring:

```ts
// Track application lifecycle
app.on("app:init", ({ config }) => {
  console.log(`App initialized: ${config.name}`);
});

app.on("app:start", ({ transport }) => {
  console.log(`Started with transport: ${transport}`);
});

// Monitor tool execution
app.on("tool:called", ({ toolName, input }) => {
  analytics.track("tool_called", { tool: toolName });
});

app.on("tool:success", ({ toolName, duration }) => {
  metrics.timing("tool_duration", duration, { tool: toolName });
});

app.on("tool:error", ({ toolName, error }) => {
  errorTracker.report(error, { tool: toolName });
});
```

**See the [kanban-mcp-example](https://github.com/AndurilCode/kanban-mcp-example) for a complete demonstration.**

## Debug Logging

Enable debug logging to receive structured logs from client UIs through the MCP protocol. This is especially useful in sandboxed environments (like mobile ChatGPT) where `console` access is restricted.

### Server Configuration

```ts
const app = createApp({
  name: "my-app",
  version: "1.0.0",
  tools: {
    /* ... */
  },
  config: {
    debug: {
      logTool: true, // Enable debug logging
      level: "debug", // "debug" | "info" | "warn" | "error"
    },
  },
});
```

When enabled, the server:

- Registers an internal `log_debug` tool (hidden from the model)
- Receives batched log entries from connected client UIs
- Outputs logs to the server console with timestamps and source info

### Log Levels

| Level   | Description                   |
| ------- | ----------------------------- |
| `debug` | All logs including debug info |
| `info`  | Info, warning, and error logs |
| `warn`  | Warning and error logs only   |
| `error` | Error logs only               |

### Using the Debug Logger (Server-side)

You can also use the debug logger directly in your server code:

```ts
import { debugLogger } from "@mcp-apps-kit/core";

// Log messages at different levels
debugLogger.debug("Processing request", { requestId: "123" });
debugLogger.info("User logged in", { userId: "456" });
debugLogger.warn("Rate limit approaching", { remaining: 10 });
debugLogger.error("Database connection failed", { error: err.message });
```

**See also:** [@mcp-apps-kit/ui README](../ui/README.md) for client-side logging.

## OAuth 2.1 Authentication

Secure your MCP server with OAuth 2.1 bearer token validation. The framework includes built-in JWT verification with automatic JWKS discovery, complying with RFC 6750 (Bearer Token Usage) and RFC 8414 (Authorization Server Metadata).

### Quick Start

```ts
import { createApp } from "@mcp-apps-kit/core";

const app = createApp({
  name: "my-app",
  version: "1.0.0",
  tools: {
    /* ... */
  },
  oauth: {
    protectedResource: "http://localhost:3000",
    authorizationServer: "https://auth.example.com",
    scopes: ["mcp:read", "mcp:write"], // Optional: required scopes
  },
});
```

### Configuration

| Option                | Type                 | Required | Description                                                     |
| --------------------- | -------------------- | -------- | --------------------------------------------------------------- |
| `protectedResource`   | `string`             | ✅       | Public URL of this MCP server (used as default audience)        |
| `authorizationServer` | `string`             | ✅       | Issuer URL of OAuth 2.1 authorization server                    |
| `jwksUri`             | `string`             | ❌       | Explicit JWKS URI (auto-discovered if not provided)             |
| `algorithms`          | `string[]`           | ❌       | Allowed JWT algorithms (default: `["RS256"]`)                   |
| `audience`            | `string \| string[]` | ❌       | Expected audience claim (default: `protectedResource`)          |
| `scopes`              | `string[]`           | ❌       | Required OAuth scopes for all requests                          |
| `tokenVerifier`       | `TokenVerifier`      | ❌       | Custom token verification (for non-JWT tokens or introspection) |

### How It Works

1. **Automatic Discovery**: Framework discovers JWKS endpoint via `/.well-known/oauth-authorization-server`
2. **Request Validation**: Bearer tokens are validated before tool execution
3. **Auth Context Injection**: Authenticated user info is injected into tool handlers

> **Important**: This server is a **protected resource** (API/service that requires OAuth tokens), NOT an authorization server. The OAuth endpoints exposed by this framework provide metadata about the external authorization server that issues tokens, not authentication functionality itself.

#### OAuth Metadata Endpoints

When OAuth is enabled, the framework exposes two metadata endpoints:

- **`/.well-known/oauth-authorization-server`**: Returns metadata about your external authorization server (e.g., Auth0, Keycloak)
- **`/.well-known/oauth-protected-resource`**: Returns metadata about this protected resource (scopes, authorization servers)

These endpoints help clients discover OAuth configuration, but do not provide token issuance or user authentication.

```ts
tools: {
  get_user_data: defineTool({
    description: "Get authenticated user data",
    input: z.object({}),
    handler: async (input, context) => {
      // Access authenticated user information
      const auth = context.auth;

      console.log("User ID:", auth.subject);
      console.log("Scopes:", auth.scopes);
      console.log("Expires at:", new Date(auth.expiresAt * 1000));

      return { userId: auth.subject };
    },
  }),
}
```

### Auth Context Properties

When OAuth is enabled, tool handlers receive authenticated context via `context.auth`:

```ts
interface AuthContext {
  subject: string; // User identifier (JWT 'sub' claim)
  scopes: string[]; // OAuth scopes granted to token
  expiresAt: number; // Token expiration (Unix timestamp)
  clientId: string; // OAuth client ID
  issuer: string; // Token issuer (authorization server)
  audience: string | string[]; // Token audience
  token?: string; // Original bearer token
  extra?: Record<string, unknown>; // Additional JWT claims
}
```

### Error Responses

The framework returns RFC 6750-compliant error responses:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="http://localhost:3000",
                  error="invalid_token",
                  error_description="Token expired"
```

| Error Code           | Status | Description                          |
| -------------------- | ------ | ------------------------------------ |
| `invalid_request`    | 400    | Malformed request                    |
| `invalid_token`      | 401    | Token expired, revoked, or malformed |
| `insufficient_scope` | 403    | Token missing required scopes        |

### Custom Token Verification

For non-JWT tokens or token introspection:

```ts
import type { TokenVerifier } from "@mcp-apps-kit/core";

const customVerifier: TokenVerifier = {
  async verifyAccessToken(token: string) {
    // Call your token introspection endpoint
    const response = await fetch("https://auth.example.com/introspect", {
      method: "POST",
      body: new URLSearchParams({ token }),
    });

    const data = await response.json();

    if (!data.active) {
      throw new Error("Token inactive");
    }

    return {
      token,
      clientId: data.client_id,
      scopes: data.scope.split(" "),
      expiresAt: data.exp,
      extra: { subject: data.sub },
    };
  },
};

const app = createApp({
  oauth: {
    protectedResource: "http://localhost:3000",
    authorizationServer: "https://auth.example.com",
    tokenVerifier: customVerifier, // Use custom verifier
  },
});
```

### Security Features

- ✅ **JWT Signature Verification**: RSA/ECDSA signature validation via JWKS
- ✅ **Claim Validation**: Automatic validation of `iss`, `aud`, `exp`, `sub`, `client_id`
- ✅ **Scope Enforcement**: Optional scope validation for all requests
- ✅ **Issuer Normalization**: Handles trailing slash differences
- ✅ **Clock Skew Tolerance**: 5-second tolerance for timestamp validation
- ✅ **HTTPS Enforcement**: JWKS URIs must use HTTPS in production
- ✅ **Subject Override**: Framework overrides client-provided subject for security

### Production Considerations

1. **HTTPS Required**: JWKS URIs must use HTTPS in production environments
2. **Key Caching**: JWKS keys are cached with automatic refresh (10-minute TTL)
3. **Rate Limiting**: Built-in rate limiting for JWKS requests (10 requests/minute)
4. **Error Handling**: All validation errors return proper WWW-Authenticate headers

### Testing Without OAuth

Disable OAuth for development/testing:

```ts
const app = createApp({
  name: "my-app",
  version: "1.0.0",
  tools: {
    /* ... */
  },
  // No oauth config = OAuth disabled
});
```

## OpenAI Domain Verification

When submitting your app to the [ChatGPT App Store](https://developers.openai.com/apps-sdk/deploy/submission/), OpenAI requires domain verification to confirm you own the server hosting your MCP app. This is similar to how Google Search Console verifies domain ownership.

### Configuration

```ts
const app = createApp({
  name: "my-app",
  version: "1.0.0",
  tools: {
    /* ... */
  },
  config: {
    openai: {
      domain_challenge: "your-verification-token-from-openai",
    },
  },
});
```

### How It Works

1. When you register your app on the [OpenAI Platform](https://platform.openai.com/), you'll receive a verification token
2. Configure the token in `config.openai.domain_challenge`
3. The framework exposes `GET /.well-known/openai-apps-challenge` returning the token as plain text
4. OpenAI pings this endpoint when you submit to verify domain ownership

### Important Notes

- **Deploy first**: The verification check happens immediately when you click submit—make sure your app is deployed with the token configured
- **Plain text response**: The endpoint returns the token as `text/plain` (not JSON or HTML), as required by OpenAI
- **Works everywhere**: Supported in both Express server mode and serverless deployments (`handleRequest`)

### Reference

- [OpenAI Apps SDK - Submit your app](https://developers.openai.com/apps-sdk/deploy/submission/)
- [OpenAI Help Center - Domain Verification](https://help.openai.com/en/articles/8871611-domain-verification)

## What you get

- A single place to define **tools** + **UI resources**
- Runtime validation via Zod + strong TypeScript inference
- Protocol-aware metadata generation for both Claude and ChatGPT hosts

## Documentation & examples

- Project overview: ../../README.md
- Examples:
  - [kanban-mcp-example](https://github.com/AndurilCode/kanban-mcp-example) (comprehensive demo)
  - ../../examples/minimal
  - ../../examples/restaurant-finder

## License

MIT
