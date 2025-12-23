# @mcp-apps-kit/core

[![npm](https://img.shields.io/npm/v/%40mcp-apps-kit%2Fcore)](https://www.npmjs.com/package/@mcp-apps-kit/core) [![node](https://img.shields.io/node/v/%40mcp-apps-kit%2Fcore)](https://www.npmjs.com/package/@mcp-apps-kit/core) [![license](https://img.shields.io/npm/l/%40mcp-apps-kit%2Fcore)](https://www.npmjs.com/package/@mcp-apps-kit/core)

Server-side TypeScript framework for building interactive MCP apps that can run on both:

- **Claude Desktop (MCP Apps)**
- **ChatGPT (OpenAI Apps SDK)**

It provides a single `createApp()` API to define tools, validate inputs/outputs with Zod, and attach UI resources to tool responses.

## Install

```bash
npm install @mcp-apps-kit/core zod
```

- Node.js: `>=18`

## Quick start

Create an app with one tool:

```ts
import { createApp } from "@mcp-apps-kit/core";
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

await app.start({ port: 3000 });
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

## What you get

- A single place to define **tools** + **UI resources**
- Runtime validation via Zod + strong TypeScript inference
- Protocol-aware metadata generation for both Claude and ChatGPT hosts

## Documentation & examples

- Project overview: ../../README.md
- API reference: ../../docs/API-REFERENCE.md
- Protocol mapping notes: ../../docs/PROTOCOL-COMPARISON.md
- Examples:
  - ../../examples/kanban
  - ../../examples/minimal
  - ../../examples/restaurant-finder

## License

MIT
