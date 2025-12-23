# MCP AppsKit

[![Publish to npm](https://github.com/AndurilCode/mcp-apps-kit/actions/workflows/publish.yml/badge.svg?branch=main)](https://github.com/AndurilCode/mcp-apps-kit/actions/workflows/publish.yml)
[![Node >=18](https://img.shields.io/node/v/%40mcp-apps-kit%2Fcore?label=node&logo=node.js&logoColor=white)](https://www.npmjs.com/package/@mcp-apps-kit/core)
[![License MIT](https://img.shields.io/npm/l/%40mcp-apps-kit%2Fcore?label=license)](https://github.com/AndurilCode/mcp-apps-kit/blob/main/LICENSE)

[![npm @mcp-apps-kit/core](https://img.shields.io/npm/v/%40mcp-apps-kit%2Fcore?label=%40mcp-apps-kit%2Fcore&logo=npm)](https://www.npmjs.com/package/@mcp-apps-kit/core)
[![npm @mcp-apps-kit/ui](https://img.shields.io/npm/v/%40mcp-apps-kit%2Fui?label=%40mcp-apps-kit%2Fui&logo=npm)](https://www.npmjs.com/package/@mcp-apps-kit/ui)
[![npm @mcp-apps-kit/ui-react](https://img.shields.io/npm/v/%40mcp-apps-kit%2Fui-react?label=%40mcp-apps-kit%2Fui-react&logo=npm)](https://www.npmjs.com/package/@mcp-apps-kit/ui-react)
[![npm @mcp-apps-kit/create-app](https://img.shields.io/npm/v/%40mcp-apps-kit%2Fcreate-app?label=%40mcp-apps-kit%2Fcreate-app&logo=npm)](https://www.npmjs.com/package/@mcp-apps-kit/create-app)

A TypeScript framework for building interactive MCP applications that work seamlessly with both **MCP Apps** and **ChatGPT (OpenAI Apps SDK)** from a single codebase.

## Why?

Building interactive MCP apps today requires:
- Different codebases for MCP Apps vs ChatGPT Apps
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

## Who Is This For?

This project is most useful if you:
- Want one codebase that can serve **MCP Apps** and **ChatGPT Apps**
- Prefer defining tools with runtime validation (Zod) and strong TypeScript inference
- Want a first-class pattern for **tool output → widget/UI rendering**

This project may be a poor fit if you:
- Only target a single host/protocol and want direct, low-level control
- Need custom transport/session behavior that doesn’t fit the built-in server (you can still use `app.handler()` / `app.getServer()`, but you’ll be closer to the metal)

## Compatibility Policy

- **Node.js**: `>= 18` (see `@mcp-apps-kit/core` engines)
- **MCP SDK**: `@mcp-apps-kit/core` depends on `@modelcontextprotocol/sdk` and is the only place that should need to change when the MCP SDK changes.
- **Versioning**: breaking changes in supported protocol behavior or public APIs ship as a new major of `@mcp-apps-kit/*`.

## Quick Start

### 5-minute Demo (Kanban Example)

Run the included Kanban board example, which demonstrates tool calling + a React widget:

```bash
pnpm install
pnpm -C examples/kanban dev
```

Then open:
- http://localhost:3001/health
- http://localhost:3001/mcp

### Installation

```bash
npm install @mcp-apps-kit/core @mcp-apps-kit/ui-react zod
```

### Server Setup

```typescript
// server/index.ts
import { createApp, type ClientToolsFromCore } from "@mcp-apps-kit/core";
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
import { useAppsClient, useToolResult, useHostContext } from "@mcp-apps-kit/ui-react";
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

## Packages

| Package | Description |
|---------|-------------|
| `@mcp-apps-kit/core` | Server-side framework |
| `@mcp-apps-kit/ui` | Client-side SDK (vanilla JS) |
| `@mcp-apps-kit/ui-react` | React bindings |
| `@mcp-apps-kit/create-app` | CLI scaffolding tool |

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

// Generated for MCP Apps
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

| Feature | MCP Apps | ChatGPT Apps |
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
