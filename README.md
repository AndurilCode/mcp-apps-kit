# MCP AppsKit

[![Publish to npm](https://github.com/AndurilCode/mcp-apps-kit/actions/workflows/publish.yml/badge.svg?branch=main)](https://github.com/AndurilCode/mcp-apps-kit/actions/workflows/publish.yml)
[![Node >=18](https://img.shields.io/node/v/%40mcp-apps-kit%2Fcore?label=node&logo=node.js&logoColor=white)](https://www.npmjs.com/package/@mcp-apps-kit/core)
[![License MIT](https://img.shields.io/npm/l/%40mcp-apps-kit%2Fcore?label=license)](https://github.com/AndurilCode/mcp-apps-kit/blob/main/LICENSE)

[![npm @mcp-apps-kit/core](https://img.shields.io/npm/v/%40mcp-apps-kit%2Fcore?label=%40mcp-apps-kit%2Fcore&logo=npm)](https://www.npmjs.com/package/@mcp-apps-kit/core)
[![npm @mcp-apps-kit/ui](https://img.shields.io/npm/v/%40mcp-apps-kit%2Fui?label=%40mcp-apps-kit%2Fui&logo=npm)](https://www.npmjs.com/package/@mcp-apps-kit/ui)
[![npm @mcp-apps-kit/ui-react](https://img.shields.io/npm/v/%40mcp-apps-kit%2Fui-react?label=%40mcp-apps-kit%2Fui-react&logo=npm)](https://www.npmjs.com/package/@mcp-apps-kit/ui-react)
[![npm @mcp-apps-kit/ui-react-builder](https://img.shields.io/npm/v/%40mcp-apps-kit%2Fui-react-builder?label=%40mcp-apps-kit%2Fui-react-builder&logo=npm)](https://www.npmjs.com/package/@mcp-apps-kit/ui-react-builder)
[![npm @mcp-apps-kit/create-app](https://img.shields.io/npm/v/%40mcp-apps-kit%2Fcreate-app?label=%40mcp-apps-kit%2Fcreate-app&logo=npm)](https://www.npmjs.com/package/@mcp-apps-kit/create-app)

Build interactive AI apps for [MCP Apps](https://blog.modelcontextprotocol.io/posts/2025-11-21-mcp-apps/) and [ChatGPT](https://developers.openai.com/apps-sdk) from a single codebase.

MCP AppsKit is a TypeScript framework for building interactive applications with shared tool and UI definitions. [MCP Apps](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1865) is an official extension to the Model Context Protocol that enables servers to deliver interactive UIs to hosts. [OpenAI Apps SDK](https://openai.com/index/introducing-apps-in-chatgpt/) is the developer toolkit for building apps that run inside ChatGPT. This framework abstracts both protocols, providing a server runtime, vanilla JS UI client, React bindings, and a scaffolding CLI.

## Table of Contents

- [Background](#background)
- [Features](#features)
- [Packages](#packages)
- [Compatibility](#compatibility)
- [Install](#install)
- [Usage](#usage)
  - [React Component UIs](#react-component-uis)
- [Type-Safe Tool Definitions](#type-safe-tool-definitions)
- [How It Works](#how-it-works)
- [Deployment Options](#deployment-options)
- [Platform Support](#platform-support)
- [Examples](#examples)
- [API](#api)
- [Contributing](#contributing)
- [License](#license)

## Background

Building interactive MCP apps today requires:

- Different codebases for MCP Apps vs ChatGPT Apps
- Different APIs (`@modelcontextprotocol/ext-apps` vs `window.openai`)
- Different metadata schemas (`_meta.ui` vs `_meta["openai/..."]`)
- Different MIME types (`text/html;profile=mcp-app` vs `text/html+skybridge`)
- No type safety between tool definitions and UI code

This framework solves all of that.

### Who Is This For?

This project is most useful if you:

- Want one codebase that can serve MCP Apps and ChatGPT Apps
- Prefer defining tools with runtime validation (Zod) and strong TypeScript inference
- Want a first-class pattern for tool output to widget/UI rendering

### When It May Not Fit

This project may be a poor fit if you:

- Only target a single host/protocol and want direct, low-level control
- Need custom transport/session behavior that does not fit the built-in server (you can still use `app.handler()` and `app.getServer()`, but you will be closer to the metal)

## Features

- Single `createApp()` entry point to define tools and UI once
- Type-safe tool bindings with full TypeScript inference for inputs, outputs, and UI access
- Protocol abstraction so UI code works identically on both platforms
- OAuth 2.1 security with JWT validation and JWKS discovery (RFC 6750, RFC 8414)
- Flexible deployment: Express server, custom transport, or serverless
- Framework agnostic UI: React, Vue, Svelte, or vanilla JS
- Plugins, middleware, and events for logging, authentication, and analytics
- Debug logging from UI to server via MCP protocol (optional `log_debug` tool)

## Packages

| Package                          | Description                        |
| -------------------------------- | ---------------------------------- |
| `@mcp-apps-kit/core`             | Server-side framework              |
| `@mcp-apps-kit/ui`               | Client-side SDK (vanilla JS)       |
| `@mcp-apps-kit/ui-react`         | React bindings                     |
| `@mcp-apps-kit/ui-react-builder` | Build tool for React component UIs |
| `@mcp-apps-kit/create-app`       | CLI scaffolding tool               |

## Compatibility

- Node.js runtime: `@mcp-apps-kit/core`, `@mcp-apps-kit/ui`, and `@mcp-apps-kit/ui-react` require Node `>= 18`.
- CLI runtime: `@mcp-apps-kit/create-app` requires Node `>= 20`.
- Monorepo development: Node `>= 20` (root `package.json` engines).
- MCP SDK dependencies: core uses `@modelcontextprotocol/sdk`; UI uses `@modelcontextprotocol/ext-apps`.
- Versioning: breaking changes in supported protocol behavior or public APIs ship as a new major of `@mcp-apps-kit/*`.

## Install

Server framework (plus Zod peer dependency):

```bash
npm install @mcp-apps-kit/core zod
```

React UI bindings (installs `@mcp-apps-kit/ui` transitively):

```bash
npm install @mcp-apps-kit/ui-react
```

React bindings require `react` and `react-dom` (18 or 19).

Vanilla UI SDK:

```bash
npm install @mcp-apps-kit/ui
```

React UI builder (for defining UIs with React components):

```bash
npm install @mcp-apps-kit/ui-react-builder
```

CLI scaffolding tool:

```bash
npx @mcp-apps-kit/create-app@latest
```

## Usage

### Server Setup

```typescript
// server/index.ts
import { createApp, defineTool, defineUI, type ClientToolsFromCore } from "@mcp-apps-kit/core";
import { z } from "zod";

// Define UI widget for displaying restaurant results
const restaurantListUI = defineUI({
  name: "Restaurant List",
  description: "Displays restaurant search results",
  html: "./dist/widget.html",
  csp: {
    connectDomains: ["https://api.yelp.com"],
  },
});

const app = createApp({
  name: "restaurant-finder",
  version: "1.0.0",

  tools: {
    search_restaurants: defineTool({
      description: "Search for restaurants by location",
      input: z.object({
        location: z.string(),
        cuisine: z.string().optional(),
      }),
      output: z.object({
        count: z.number(),
        restaurants: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            rating: z.number(),
          })
        ),
      }),
      handler: async (input) => {
        const results = await fetchRestaurants(input.location, input.cuisine);
        return {
          count: results.length,
          restaurants: results,
          _meta: { fullDetails: results },
        };
      },
      ui: restaurantListUI,
    }),
  },
});

await app.start({ port: 3000 });

export type AppTools = typeof app.tools;
export type AppClientTools = ClientToolsFromCore<AppTools>;
```

### UI Setup (React)

```typescript
// ui/src/App.tsx
import { useAppsClient, useToolResult, useHostContext } from "@mcp-apps-kit/ui-react";
import type { AppClientTools } from "../../server";

function RestaurantList() {
  const client = useAppsClient<AppClientTools>();
  const result = useToolResult<AppClientTools>();
  const context = useHostContext();

  const restaurants = result?.search_restaurants?.restaurants ?? [];

  const handleRefresh = async () => {
    await client.callTool("search_restaurants", {
      location: "Paris",
    });
  };

  return (
    <div className={context.theme}>
      <h1>Restaurants ({result?.search_restaurants?.count})</h1>
      {restaurants.map((r) => (
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

### React Component UIs

Instead of pre-building HTML files, you can define UIs using React components directly with `@mcp-apps-kit/ui-react-builder`:

```typescript
// server/index.ts
import { createApp, defineTool } from "@mcp-apps-kit/core";
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { RestaurantList } from "./ui/RestaurantList";
import { z } from "zod";

const app = createApp({
  name: "restaurant-finder",
  version: "1.0.0",
  tools: {
    search_restaurants: defineTool({
      description: "Search for restaurants",
      input: z.object({ location: z.string() }),
      output: z.object({ restaurants: z.array(z.unknown()) }),
      // Define UI with React component - auto-builds to HTML
      ui: defineReactUI({
        component: RestaurantList,
        name: "Restaurant List",
        prefersBorder: true,
      }),
      handler: async (input) => {
        return { restaurants: await fetchRestaurants(input.location) };
      },
    }),
  },
});
```

Configure the Vite plugin to auto-discover and build React UIs:

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { mcpReactUI } from "@mcp-apps-kit/ui-react-builder/vite";

export default defineConfig({
  plugins: [
    mcpReactUI({
      serverEntry: "./src/index.ts",
      outDir: "./src/ui/dist",
    }),
  ],
});
```

The plugin scans your server entry for `defineReactUI` calls, bundles each component with React and `@mcp-apps-kit/ui-react`, and outputs self-contained HTML files.

### CLI

```bash
npx @mcp-apps-kit/create-app@latest my-app
```

## Type-Safe Tool Definitions

### The `defineTool` Helper

Use `defineTool` to get full TypeScript type inference in handlers without manual assertions:

```typescript
import { defineTool } from "@mcp-apps-kit/core";

tools: {
  greet: defineTool({
    input: z.object({ name: z.string() }),
    handler: async (input) => {
      return { message: `Hello ${input.name}` };
    },
  }),
}
```

Why `defineTool`?

With Zod v4, TypeScript cannot infer concrete schema types across module boundaries when using generic `z.ZodType`. The `defineTool` helper captures the specific schema type at the call site, enabling proper type inference without manual `as z.infer<typeof Schema>` assertions.

You can still use the object syntax without `defineTool`, but you will need type assertions in your handlers:

```typescript
// Without defineTool (requires type assertion)
tools: {
  greet: {
    input: GreetSchema,
    handler: async (input) => {
      const typed = input as z.infer<typeof GreetSchema>;
      return { message: `Hello ${typed.name}` };
    },
  },
}
```

## How It Works

### Server Side

The framework generates protocol-specific metadata for each platform:

```typescript
// Your unified definition (using colocated UI)
const myWidget = defineUI({ name: "Widget", html: "./dist/widget.html" });

tools: {
  my_tool: defineTool({
    ui: myWidget,
    visibility: "both",
    // ...
  }),
}

// Generated for MCP Apps
_meta: {
  ui: {
    resourceUri: "ui://my-app/__ui_my_tool",
    visibility: ["model", "app"],
  },
}

// Generated for ChatGPT Apps
_meta: {
  "openai/outputTemplate": "ui://my-app/__ui_my_tool",
  "openai/widgetAccessible": true,
  "openai/visibility": "public",
}
```

### Client Side

The UI SDK auto-detects the host and provides a unified API:

```typescript
import { createClient } from "@mcp-apps-kit/ui";
import type { AppClientTools } from "./server";

const client = await createClient<AppClientTools>();

await client.callTool("my_tool", { arg: "value" });
await client.sendFollowUpMessage("Tell me more");
await client.requestDisplayMode("fullscreen");
```

## OpenAI Domain Verification

When submitting your app to the [ChatGPT App Store](https://developers.openai.com/apps-sdk/deploy/submission/), OpenAI requires domain verification to confirm you own the server hosting your MCP app. This works similarly to Google Search Console verification.

Configure the verification token provided by OpenAI:

```typescript
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

This exposes a `GET /.well-known/openai-apps-challenge` endpoint that returns the token as plain text. OpenAI pings this endpoint when you submit your app to verify domain ownership.

> **Note:** Deploy your app with this configuration before clicking submit in the OpenAI platform—the verification check happens immediately.

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
await app.start({ transport: "stdio" });
```

### Serverless

```typescript
// Cloudflare Workers
export default {
  async fetch(request) {
    return app.handleRequest(request);
  },
};
```

## Platform Support

| Feature           | MCP Apps | ChatGPT Apps |
| ----------------- | -------- | ------------ |
| Tool Calling      | Yes      | Yes          |
| Structured Data   | Yes      | Yes          |
| OAuth 2.1 Auth    | Yes      | Yes          |
| Theme Support     | Yes      | Yes          |
| Display Modes     | Yes      | Yes          |
| Persisted State   | No       | Yes          |
| File Upload       | No       | Yes          |
| Tool Cancellation | Yes      | No           |
| Debug Logging     | Yes      | Yes          |

## Examples

Kanban demo repository (tool calling, React widgets, plugins, middleware, events):

```bash
git clone https://github.com/AndurilCode/kanban-mcp-example.git
cd kanban-mcp-example
npm install
npm run dev
```

Local examples:

- [examples/minimal](examples/minimal/) - minimal server and UI widget
- [examples/restaurant-finder](examples/restaurant-finder/) - end-to-end app with search functionality

## API

Detailed package documentation:

- [packages/core/README.md](packages/core/README.md)
- [packages/ui/README.md](packages/ui/README.md)
- [packages/ui-react/README.md](packages/ui-react/README.md)
- [packages/ui-react-builder/README.md](packages/ui-react-builder/README.md)
- [packages/create-app/README.md](packages/create-app/README.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines. Issues and pull requests are welcome.

## License

[MIT](LICENSE)
