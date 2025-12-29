# @mcp-apps-kit/core

[![npm](https://img.shields.io/npm/v/%40mcp-apps-kit%2Fcore)](https://www.npmjs.com/package/@mcp-apps-kit/core) [![node](https://img.shields.io/node/v/%40mcp-apps-kit%2Fcore)](https://www.npmjs.com/package/@mcp-apps-kit/core) [![license](https://img.shields.io/npm/l/%40mcp-apps-kit%2Fcore)](https://www.npmjs.com/package/@mcp-apps-kit/core)

Server-side framework for building MCP applications.

MCP AppsKit Core is the server runtime for defining tools, validating inputs and outputs with Zod, and binding UI resources. It targets both MCP Apps (Claude Desktop) and ChatGPT (OpenAI Apps SDK) from the same definitions.

## Table of Contents

- [Background](#background)
- [Features](#features)
- [Compatibility](#compatibility)
- [Install](#install)
- [Usage](#usage)
- [Type-Safe Tool Definitions](#type-safe-tool-definitions)
- [Plugins, Middleware & Events](#plugins-middleware--events)
- [Debug Logging](#debug-logging)
- [OAuth 2.1 Authentication](#oauth-21-authentication)
- [OpenAI Domain Verification](#openai-domain-verification)
- [Examples](#examples)
- [API](#api)
- [Contributing](#contributing)
- [License](#license)

## Background

Interactive MCP apps often need to support multiple hosts with slightly different APIs and metadata rules. Core provides a single server-side API for tools, metadata, and UI resources so you can support MCP Apps and ChatGPT Apps without parallel codebases.

## Features

- Single `createApp()` entry point for tools and UI definitions
- Zod-powered validation with strong TypeScript inference
- Unified metadata for MCP Apps and ChatGPT Apps
- OAuth 2.1 bearer token validation with JWKS discovery
- Plugins, middleware, and events for cross-cutting concerns
- Optional debug logging tool for client-to-server logs

## Compatibility

- Node.js: `>= 18`
- Zod: `^4.0.0` (peer dependency)
- MCP SDK: uses `@modelcontextprotocol/sdk`

## Install

```bash
npm install @mcp-apps-kit/core zod
```

## Usage

### Quick start

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
        return { message: `Hello, ${input.name}!` };
      },
    }),
  },
});

await app.start({ port: 3000 });
```

### Attach UI to tool outputs

Tools can include a UI definition for displaying results. Use `defineUI` for type-safe UI definitions, then reference it from your tool. Return UI-only payloads in `_meta`.

```ts
import { createApp, defineTool, defineUI } from "@mcp-apps-kit/core";
import { z } from "zod";

// Define UI widget for displaying restaurant list
const restaurantListUI = defineUI({
  name: "Restaurant List",
  description: "Displays restaurant search results",
  html: "./dist/widget.html",
  prefersBorder: true,
});

const app = createApp({
  name: "restaurant-finder",
  version: "1.0.0",
  tools: {
    search_restaurants: defineTool({
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
      ui: restaurantListUI,
    }),
  },
});
```

## Type-Safe Tool Definitions

### The `defineTool` helper

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
      return { results: await search(input.query, input.maxResults) };
    },
  }),
}
```

Why `defineTool`?

With Zod v4, TypeScript cannot infer concrete schema types across module boundaries when using generic `z.ZodType`. The `defineTool` helper captures specific schema types at the call site, enabling proper type inference without manual type assertions.

### Alternative: object syntax with type assertions

```ts
const searchInput = z.object({
  query: z.string(),
  maxResults: z.number().optional(),
});

const app = createApp({
  tools: {
    search: {
      input: searchInput,
      handler: async (input) => {
        const typed = input as z.infer<typeof searchInput>;
        return { results: await search(typed.query, typed.maxResults) };
      },
    },
  },
});
```

## Plugins, Middleware & Events

### Plugins

```ts
import { createPlugin } from "@mcp-apps-kit/core";

const loggingPlugin = createPlugin({
  name: "logger",
  version: "1.0.0",
  onInit: async () => console.log("App initializing..."),
  onStart: async () => console.log("App started"),
  beforeToolCall: async (context) => {
    console.log(`Tool called: ${context.toolName}`);
  },
  afterToolCall: async (context) => {
    console.log(`Tool completed: ${context.toolName}`);
  },
});
```

### Middleware

```ts
import type { Middleware } from "@mcp-apps-kit/core";

const logger: Middleware = async (context, next) => {
  const start = Date.now();
  context.state.set("startTime", start);
  await next();
  console.log(`${context.toolName} completed in ${Date.now() - start}ms`);
};

app.use(logger);
```

### Events

```ts
app.on("tool:called", ({ toolName }) => {
  analytics.track("tool_called", { tool: toolName });
});
```

## Debug Logging

Enable debug logging to receive structured logs from client UIs through the MCP protocol.

```ts
const app = createApp({
  name: "my-app",
  version: "1.0.0",
  tools: {
    /* ... */
  },
  config: {
    debug: {
      logTool: true,
      level: "debug",
    },
  },
});
```

You can also use the server-side logger directly:

```ts
import { debugLogger } from "@mcp-apps-kit/core";

debugLogger.info("User logged in", { userId: "456" });
```

## OAuth 2.1 Authentication

Core validates bearer tokens and injects auth metadata for tool handlers.

### Quick start

```ts
const app = createApp({
  name: "my-app",
  version: "1.0.0",
  tools: {
    /* ... */
  },
  config: {
    oauth: {
      protectedResource: "http://localhost:3000",
      authorizationServer: "https://auth.example.com",
      scopes: ["mcp:read", "mcp:write"],
    },
  },
});
```

### Auth context access

OAuth metadata is injected into `_meta` and surfaced via `context.subject` and `context.raw`:

```ts
tools: {
  get_user_data: defineTool({
    description: "Get authenticated user data",
    input: z.object({}),
    handler: async (_input, context) => {
      const subject = context.subject;
      const auth = context.raw?.["mcp-apps-kit/auth"] as
        | {
            subject: string;
            scopes: string[];
            expiresAt: number;
            clientId: string;
            issuer: string;
            audience: string | string[];
            token?: string;
            extra?: Record<string, unknown>;
          }
        | undefined;

      return { userId: subject, scopes: auth?.scopes ?? [] };
    },
  }),
}
```

### OAuth metadata endpoints

When OAuth is enabled, the server exposes:

- `/.well-known/oauth-authorization-server`
- `/.well-known/oauth-protected-resource`

These endpoints describe the external authorization server and this protected resource. They do not issue tokens.

### Custom token verification

For non-JWT tokens or token introspection:

```ts
import type { TokenVerifier } from "@mcp-apps-kit/core";

const customVerifier: TokenVerifier = {
  async verifyAccessToken(token: string) {
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
  name: "my-app",
  version: "1.0.0",
  tools: {
    /* ... */
  },
  config: {
    oauth: {
      protectedResource: "http://localhost:3000",
      authorizationServer: "https://auth.example.com",
      tokenVerifier: customVerifier,
    },
  },
});
```

### Security features

- JWT signature verification via JWKS
- Claim validation for `iss`, `aud`, `exp`, `sub`, `client_id`
- Optional scope enforcement
- Issuer normalization and clock skew tolerance
- HTTPS enforcement for JWKS in production
- Subject override for client-provided identity metadata

### Production considerations

1. JWKS keys are cached with automatic refresh (10-minute TTL)
2. JWKS requests are rate limited (10 requests/minute)
3. Validation errors return RFC 6750-compliant WWW-Authenticate headers

### Testing without OAuth

```ts
const app = createApp({
  name: "my-app",
  version: "1.0.0",
  tools: {
    /* ... */
  },
});
```

## OpenAI Domain Verification

When submitting your app to the ChatGPT App Store, OpenAI requires domain verification to confirm ownership of the MCP server host.

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

### How it works

1. Register your app on the OpenAI Platform to receive a verification token
2. Set the token in `config.openai.domain_challenge`
3. The framework exposes `GET /.well-known/openai-apps-challenge` returning the token as plain text
4. OpenAI pings the endpoint during submission to verify domain ownership

### Notes

- Deploy before submitting so the endpoint is live
- The endpoint returns `text/plain` as required
- Works in Express and serverless deployments (`handleRequest`)

### References

- [OpenAI Apps SDK - Submit your app](https://developers.openai.com/apps-sdk/deploy/submission/)
- [OpenAI Help Center - Domain Verification](https://help.openai.com/en/articles/8871611-domain-verification)

## Examples

- `../../examples/minimal`
- `../../examples/restaurant-finder`
- [kanban-mcp-example](https://github.com/AndurilCode/kanban-mcp-example)

## API

Key exports include:

- `createApp`, `defineTool`, `defineUI`
- `createPlugin`, `loggingPlugin`
- `debugLogger`, `ClientToolsFromCore`
- `Middleware`, `TypedEventEmitter`

For full types, see `packages/core/src/types` or the project overview in `../../README.md`.

## Contributing

See `../../CONTRIBUTING.md` for development setup and guidelines. Issues and pull requests are welcome.

## License

MIT
