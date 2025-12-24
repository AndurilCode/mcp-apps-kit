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

````ts
handler: async (input, context) => {
  const typedInput = input as z.infer<typeof myInputSchema>;
  // Now typedInput has full type safety
  const value = typedInput.someProperty;
}

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
````

## What you get

- A single place to define **tools** + **UI resources**
- Runtime validation via Zod + strong TypeScript inference
- Protocol-aware metadata generation for both Claude and ChatGPT hosts

## Documentation & examples

- Project overview: ../../README.md
- Examples:
  - ../../examples/kanban
  - ../../examples/minimal
  - ../../examples/restaurant-finder

## License

MIT
