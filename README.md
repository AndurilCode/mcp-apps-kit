# Unified MCP Apps Builder

A TypeScript framework for building interactive MCP applications that work seamlessly with both **Claude Desktop (MCP Apps)** and **ChatGPT (OpenAI Apps SDK)** from a single codebase.

## Why?

Building interactive MCP apps today requires:
- Different codebases for Claude vs ChatGPT
- Different APIs (`@modelcontextprotocol/ext-apps` vs `window.openai`)
- Different metadata schemas (`_meta.ui` vs `_meta["openai/..."]`)
- Different MIME types (`text/html;profile=mcp-app` vs `text/html+skybridge`)
- No type safety between tool definitions and UI code

**This framework solves all of that.**

## Features

- **Single `createApp()` entry point** - Define tools and UI once
- **Type-safe tool bindings** - Full TypeScript inference for inputs, outputs, and UI access
- **Protocol abstraction** - UI code works identically on both platforms
- **Flexible deployment** - Express server, custom transport, or serverless
- **Framework agnostic** - React, Vue, Svelte, or vanilla JS for UI

## Quick Start

### Installation

```bash
npm install @apps-builder/core @apps-builder/ui-react zod
```

### Server Setup

```typescript
// server/index.ts
import { createApp, type ClientToolsFromCore } from "@apps-builder/core";
import { z } from "zod";

const app = createApp({
  name: "restaurant-finder",
  version: "1.0.0",

  tools: {
    search_restaurants: {
      description: "Search for restaurants by location",
      input: z.object({
        location: z.string(),
        cuisine: z.string().optional(),
      }),
      output: z.object({
        count: z.number(),
        restaurants: z.array(z.object({
          id: z.string(),
          name: z.string(),
          rating: z.number(),
        })),
      }),
      handler: async ({ location, cuisine }) => {
        const results = await fetchRestaurants(location, cuisine);
        return {
          count: results.length,
          restaurants: results,
          _meta: { fullDetails: results }, // UI-only data
        };
      },
      ui: "restaurant-list",
    },
  },

  ui: {
    "restaurant-list": {
      html: "./dist/widget.html",
      csp: {
        connectDomains: ["https://api.yelp.com"],
      },
    },
  },
});

// Start server
await app.start({ port: 3000 });

// Export types for UI
export type AppTools = typeof app.tools;
export type AppClientTools = ClientToolsFromCore<AppTools>;
```

### UI Setup (React)

```typescript
// ui/src/App.tsx
import { useAppsClient, useToolResult, useHostContext } from "@apps-builder/ui-react";
import type { AppTools } from "../../server";
import type { AppClientTools } from "../../server";

function RestaurantList() {
  const client = useAppsClient<AppClientTools>();
  const result = useToolResult<AppClientTools>();
  const context = useHostContext();

  // Fully typed access
  const restaurants = result?.search_restaurants?.restaurants ?? [];

  const handleRefresh = async () => {
    await client.callTool("search_restaurants", {
      location: "Paris",
      // TypeScript error if you add invalid properties
    });
  };

  return (
    <div className={context.theme}>
      <h1>Restaurants ({result?.search_restaurants?.count})</h1>
      {restaurants.map(r => (
        <div key={r.id}>
          <h3>{r.name}</h3>
          <p>Rating: {r.rating}</p>
        </div>
      ))}
      <button onClick={handleRefresh}>Refresh</button>
    </div>
  );
}
```

## Documentation

| Document | Description |
|----------|-------------|
| [Design Document](./docs/DESIGN.md) | Architecture overview and core concepts |
| [Protocol Comparison](./docs/PROTOCOL-COMPARISON.md) | Detailed MCP Apps vs ChatGPT Apps mapping |
| [API Reference](./docs/API-REFERENCE.md) | Complete API documentation |
| [Implementation TODO](./docs/TODO.md) | Development roadmap and priorities |

## Packages

| Package | Description |
|---------|-------------|
| `@apps-builder/core` | Server-side framework |
| `@apps-builder/ui` | Client-side SDK (vanilla JS) |
| `@apps-builder/ui-react` | React bindings |
| `@apps-builder/create-app` | CLI scaffolding tool |

## How It Works

### Server Side

The framework generates protocol-specific metadata for each platform:

```typescript
// Your unified definition
tools: {
  my_tool: {
    ui: "widget",
    visibility: "both",
  }
}

// Generated for MCP Apps (Claude Desktop)
_meta: {
  ui: {
    resourceUri: "ui://my-app/widget",
    visibility: ["model", "app"]
  }
}

// Generated for ChatGPT Apps
_meta: {
  "openai/outputTemplate": "ui://my-app/widget",
  "openai/widgetAccessible": true,
  "openai/visibility": "public"
}
```

### Client Side

The UI SDK auto-detects the host and provides a unified API:

```typescript
const client = await createClient<AppClientTools>();

// Works on both platforms
await client.callTool("my_tool", { arg: "value" });
await client.sendFollowUpMessage("Tell me more");
await client.requestDisplayMode("fullscreen");
```

## Deployment Options

### Express Server (default)

```typescript
await app.start({ port: 3000 });
```

### Custom Express

```typescript
import express from "express";
const expressApp = express();
expressApp.use("/mcp", app.handler());
expressApp.listen(3000);
```

### Stdio (CLI tools)

```typescript
const server = app.getServer();
await server.connect(new StdioTransport());
```

### Serverless

```typescript
// Cloudflare Workers
export default {
  async fetch(request) {
    return app.handleRequest(request);
  }
};
```

## Platform Support

| Feature | Claude Desktop | ChatGPT |
|---------|---------------|---------|
| Tool Calling | ✅ | ✅ |
| Structured Data | ✅ | ✅ |
| Theme Support | ✅ | ✅ |
| Display Modes | ✅ | ✅ |
| Persisted State | ✅ (polyfill) | ✅ |
| File Upload | ❌ | ✅ |
| Tool Cancellation | ✅ | ❌ |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

MIT
