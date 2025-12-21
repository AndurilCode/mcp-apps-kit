# Deployment Guide

This guide covers the various deployment options for apps built with `@apps-builder/core`.

## Table of Contents

- [Built-in Server (Recommended for Development)](#built-in-server)
- [Express Middleware Integration](#express-middleware)
- [Serverless Deployment](#serverless-deployment)
- [Stdio Transport (Claude Desktop)](#stdio-transport)

## Built-in Server

The simplest way to run your app is using the built-in server:

```typescript
import { createApp } from "@apps-builder/core";
import { z } from "zod";

const app = createApp({
  name: "my-app",
  version: "1.0.0",
  tools: {
    greet: {
      description: "Greet a user",
      input: z.object({ name: z.string() }),
      output: z.object({ message: z.string() }),
      handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
    },
  },
});

// Start on port 3000 with HTTP transport
await app.start({ port: 3000 });
console.log("Server running on http://localhost:3000");
```

### Configuration Options

```typescript
await app.start({
  port: 3000,           // HTTP port (default: 3000)
  transport: "http",    // "http" or "stdio" (default: "http")
});
```

## Express Middleware

For integration with existing Express servers, use `app.handler()`:

```typescript
import express from "express";
import { createApp } from "@apps-builder/core";
import { z } from "zod";

// Create your MCP app
const mcpApp = createApp({
  name: "my-app",
  version: "1.0.0",
  tools: {
    greet: {
      description: "Greet a user",
      input: z.object({ name: z.string() }),
      output: z.object({ message: z.string() }),
      handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
    },
  },
});

// Create Express server
const expressApp = express();

// Add your own middleware
expressApp.use(express.json());
expressApp.use(cors());

// Add custom routes
expressApp.get("/", (req, res) => {
  res.json({ message: "Welcome to my API" });
});

// Mount MCP app handler on /mcp path
expressApp.use("/mcp", mcpApp.handler());

expressApp.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
  console.log("MCP endpoint: http://localhost:3000/mcp");
});
```

### Use Cases

- Adding MCP capabilities to an existing API server
- Custom authentication middleware
- Request logging and monitoring
- Rate limiting
- Custom error handling

## Serverless Deployment

Use `app.handleRequest()` for serverless platforms like Cloudflare Workers, Vercel Edge Functions, or AWS Lambda@Edge.

### Cloudflare Workers

```typescript
// src/worker.ts
import { createApp } from "@apps-builder/core";
import { z } from "zod";

const app = createApp({
  name: "my-worker",
  version: "1.0.0",
  tools: {
    greet: {
      description: "Greet a user",
      input: z.object({ name: z.string() }),
      output: z.object({ message: z.string() }),
      handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
    },
  },
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return app.handleRequest(request, env);
  },
};
```

### Vercel Edge Functions

```typescript
// api/mcp.ts
import { createApp } from "@apps-builder/core";
import { z } from "zod";

const app = createApp({
  name: "my-vercel-app",
  version: "1.0.0",
  tools: {
    greet: {
      description: "Greet a user",
      input: z.object({ name: z.string() }),
      output: z.object({ message: z.string() }),
      handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
    },
  },
});

export const config = {
  runtime: "edge",
};

export default async function handler(request: Request) {
  return app.handleRequest(request);
}
```

### AWS Lambda with Streaming

```typescript
// handler.ts
import { createApp } from "@apps-builder/core";
import { z } from "zod";

const app = createApp({
  name: "my-lambda",
  version: "1.0.0",
  tools: {
    greet: {
      description: "Greet a user",
      input: z.object({ name: z.string() }),
      output: z.object({ message: z.string() }),
      handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
    },
  },
});

export const handler = awslambda.streamifyResponse(
  async (event, responseStream) => {
    const request = new Request(event.requestContext.http.path, {
      method: event.requestContext.http.method,
      headers: event.headers,
      body: event.body,
    });

    const response = await app.handleRequest(request);

    responseStream.write(await response.text());
    responseStream.end();
  }
);
```

### Important Notes for Serverless

1. **Stateless Handling**: Each request creates a new MCP connection. The server does not maintain session state between requests.

2. **Cold Starts**: The first request may have additional latency due to initialization. Consider using provisioned concurrency for latency-sensitive applications.

3. **Request Limits**: Serverless platforms often have request/response size limits. Ensure your tool responses stay within platform limits.

## Stdio Transport

For Claude Desktop integration using stdio transport:

```typescript
// server.ts
import { createApp } from "@apps-builder/core";
import { z } from "zod";

const app = createApp({
  name: "my-claude-app",
  version: "1.0.0",
  tools: {
    greet: {
      description: "Greet a user",
      input: z.object({ name: z.string() }),
      output: z.object({ message: z.string() }),
      handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
    },
  },
});

// Start with stdio transport
await app.start({ transport: "stdio" });
```

### Claude Desktop Configuration

Add to your Claude Desktop configuration (`~/.config/claude/claude_desktop_config.json` on Linux/macOS or `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "my-app": {
      "command": "node",
      "args": ["/path/to/your/server.js"]
    }
  }
}
```

### Running with npx

If your package is published:

```json
{
  "mcpServers": {
    "my-app": {
      "command": "npx",
      "args": ["@your-org/my-app"]
    }
  }
}
```

## Health Checks

All deployment modes include a built-in health check endpoint:

```bash
curl http://localhost:3000/health
# Returns: {"status":"ok","name":"my-app","version":"1.0.0"}
```

## CORS Configuration

Enable CORS for browser-based clients:

```typescript
const app = createApp({
  name: "my-app",
  version: "1.0.0",
  tools: { /* ... */ },
  config: {
    cors: {
      origin: "https://your-frontend.com",
      credentials: true,
    },
  },
});
```

### CORS Options

| Option | Type | Description |
|--------|------|-------------|
| `origin` | `string \| string[] \| boolean` | Allowed origins. Use `true` for all origins. |
| `credentials` | `boolean` | Include credentials in CORS requests |

## Protocol Configuration

The SDK supports two protocols with different metadata formats:

### MCP Protocol (Default)

For Claude Desktop and other MCP-compatible hosts:

```typescript
const app = createApp({
  name: "my-app",
  version: "1.0.0",
  tools: { /* ... */ },
  ui: { /* ... */ },
  config: {
    protocol: "mcp", // Optional - this is the default
  },
});
```

MCP protocol uses:
- camelCase metadata format: `_meta.ui.csp.connectDomains`
- MIME type: `text/html;profile=mcp-app`
- Visibility: `readOnlyHint`, `appOnly`

### OpenAI Protocol

For ChatGPT and OpenAI-compatible hosts:

```typescript
const app = createApp({
  name: "my-chatgpt-app",
  version: "1.0.0",
  tools: {
    search: {
      description: "Search the web",
      input: z.object({ query: z.string() }),
      output: z.object({ results: z.array(z.string()) }),
      handler: async ({ query }) => ({ results: [] }),
      // ChatGPT-specific properties
      invokingMessage: "Searching...",
      invokedMessage: "Search complete!",
    },
  },
  ui: {
    widget: {
      html: "./widget.html",
      csp: {
        connectDomains: ["https://api.example.com"],
        redirectDomains: ["https://docs.example.com"], // ChatGPT-only
        frameDomains: ["https://embed.example.com"],   // ChatGPT-only
      },
      domain: "widget.example.com", // ChatGPT widget isolation
    },
  },
  config: {
    protocol: "openai",
  },
});
```

OpenAI protocol uses:
- snake_case metadata format with openai/ prefixes: `_meta["openai/widgetCSP"].connect_domains`
- MIME type: `text/html;profile=chatgpt-widget`
- Visibility: `invokableByAI`, `invokableByApp`
- Additional CSP fields: `redirectDomains`, `frameDomains`
- Widget isolation via `domain` property

## Production Considerations

### Environment Variables

```typescript
const app = createApp({
  name: process.env.APP_NAME || "my-app",
  version: process.env.APP_VERSION || "1.0.0",
  tools: { /* ... */ },
});

await app.start({
  port: parseInt(process.env.PORT || "3000"),
});
```

### Logging

Tool handlers can use standard logging:

```typescript
tools: {
  processData: {
    description: "Process data",
    input: z.object({ data: z.string() }),
    output: z.object({ result: z.string() }),
    handler: async ({ data }) => {
      console.log(`Processing data: ${data.substring(0, 50)}...`);
      const result = await process(data);
      console.log(`Processed successfully`);
      return { result };
    },
  },
},
```

### Error Handling

Errors thrown in handlers are automatically caught and returned as MCP errors:

```typescript
tools: {
  riskyOperation: {
    description: "May fail",
    input: z.object({}),
    output: z.object({}),
    handler: async () => {
      throw new Error("Something went wrong");
      // Returns: { error: { code: "TOOL_EXECUTION_ERROR", message: "Something went wrong" } }
    },
  },
},
```

## Next Steps

- [API Reference](./API-REFERENCE.md) - Detailed API documentation
- [Protocol Comparison](./PROTOCOL-COMPARISON.md) - MCP Apps vs ChatGPT Apps differences
- [Design Document](./DESIGN.md) - Architecture and design decisions
