# Quickstart: Unified MCP Apps Builder SDK

Get your first MCP app running in under 5 minutes.

## Prerequisites

- Node.js 18 or later
- pnpm 8 or later (recommended) or npm

## Option 1: CLI Scaffolding (Recommended)

```bash
# Create a new project
npx @apps-builder/create-app my-mcp-app

# Navigate to project
cd my-mcp-app

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

## Option 2: Manual Setup

### Step 1: Install Packages

```bash
# Create project
mkdir my-mcp-app && cd my-mcp-app
pnpm init

# Install core package
pnpm add @apps-builder/core zod

# Install UI packages (for widget development)
pnpm add @apps-builder/ui @apps-builder/ui-react react react-dom
```

### Step 2: Create Server

Create `server/index.ts`:

```typescript
import { createApp } from "@apps-builder/core";
import { z } from "zod";

const app = createApp({
  name: "my-first-app",
  version: "1.0.0",

  tools: {
    greet: {
      description: "Greet a user by name",
      input: z.object({
        name: z.string().describe("The name to greet"),
      }),
      output: z.object({
        message: z.string(),
        timestamp: z.string(),
      }),
      handler: async ({ name }) => {
        return {
          message: `Hello, ${name}!`,
          timestamp: new Date().toISOString(),
        };
      },
      ui: "greeting-widget",
    },
  },

  ui: {
    "greeting-widget": {
      html: "./ui/dist/index.html",
      csp: {
        connectDomains: [],
        resourceDomains: [],
      },
      prefersBorder: true,
    },
  },
});

// Start server
await app.start({ port: 3000 });
console.log("MCP server running on http://localhost:3000");
```

### Step 3: Create UI Widget

Create `ui/src/App.tsx`:

```tsx
import {
  AppsProvider,
  useAppsClient,
  useToolResult,
  useHostContext,
} from "@apps-builder/ui-react";

// Import types from your server
import type { app } from "../server";
type AppTools = typeof app.tools;

function GreetingWidget() {
  const client = useAppsClient<AppTools>();
  const result = useToolResult<AppTools>();
  const context = useHostContext();

  const greeting = result?.greet;

  return (
    <div className={`widget ${context.theme}`}>
      {greeting ? (
        <div className="greeting">
          <h1>{greeting.message}</h1>
          <p>Sent at: {greeting.timestamp}</p>
        </div>
      ) : (
        <p>Waiting for greeting...</p>
      )}

      <button
        onClick={() =>
          client.sendFollowUpMessage("Please greet me again!")
        }
      >
        Request New Greeting
      </button>
    </div>
  );
}

export default function App() {
  return (
    <AppsProvider fallback={<div>Loading...</div>}>
      <GreetingWidget />
    </AppsProvider>
  );
}
```

### Step 4: Configure Build

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist"
  },
  "include": ["server/**/*", "ui/src/**/*"]
}
```

### Step 5: Run

```bash
# Build and start server
npx tsx server/index.ts

# In another terminal, build UI
cd ui && npx vite build
```

## Connecting to Claude Desktop

Add to your Claude Desktop config (`~/.config/claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "my-first-app": {
      "command": "npx",
      "args": ["tsx", "/path/to/my-mcp-app/server/index.ts"]
    }
  }
}
```

## Connecting to ChatGPT

Deploy your server to a public URL and register it as an MCP server in ChatGPT settings.

## Next Steps

1. **Add more tools**: Define additional tools in the `tools` object
2. **Style your widget**: Use CSS variables from `useHostContext().styles`
3. **Persist state**: Use `useWidgetState()` for state that survives reloads
4. **Handle errors**: Wrap tool handlers in try/catch for graceful error handling

## Example: Restaurant Finder

A more complete example:

```typescript
import { createApp } from "@apps-builder/core";
import { z } from "zod";

const app = createApp({
  name: "restaurant-finder",
  version: "1.0.0",

  tools: {
    search_restaurants: {
      description: "Search for restaurants by location and cuisine",
      input: z.object({
        location: z.string(),
        cuisine: z.string().optional(),
        limit: z.number().default(10),
      }),
      output: z.object({
        count: z.number(),
        restaurants: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            rating: z.number(),
            cuisine: z.string(),
            priceLevel: z.number().min(1).max(4),
          })
        ),
      }),
      handler: async ({ location, cuisine, limit }) => {
        // Your restaurant API logic here
        const restaurants = await fetchRestaurants(location, cuisine);
        return {
          count: restaurants.length,
          restaurants: restaurants.slice(0, limit),
        };
      },
      ui: "restaurant-list",
    },

    get_details: {
      description: "Get detailed info about a restaurant",
      input: z.object({ id: z.string() }),
      output: z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        menu: z.array(z.object({ name: z.string(), price: z.number() })),
      }),
      handler: async ({ id }) => {
        return await fetchRestaurantDetails(id);
      },
      ui: "restaurant-details",
    },

    // UI-only tool (hidden from LLM)
    refresh: {
      description: "Refresh restaurant data",
      visibility: "app",
      input: z.object({ location: z.string() }),
      output: z.object({ success: z.boolean() }),
      handler: async ({ location }) => {
        await invalidateCache(location);
        return { success: true };
      },
    },
  },

  ui: {
    "restaurant-list": {
      html: "./ui/dist/list.html",
      csp: {
        connectDomains: ["https://api.yelp.com"],
        resourceDomains: ["https://s3-media0.fl.yelpcdn.com"],
      },
    },
    "restaurant-details": {
      html: "./ui/dist/details.html",
      csp: {
        connectDomains: ["https://api.yelp.com"],
        resourceDomains: ["https://s3-media0.fl.yelpcdn.com"],
      },
    },
  },
});

await app.start({ port: 3000 });
```

## Troubleshooting

### Widget not loading

1. Check that your HTML file path is correct
2. Verify the dev server is running
3. Check browser console for CSP errors

### Type errors

1. Ensure you're using `typeof app.tools` for type inference
2. Make sure Zod schemas match your handler return types

### Connection issues

1. Verify the port is not in use
2. Check Claude Desktop config path is correct
3. Restart Claude Desktop after config changes

## Resources

- [API Reference](../docs/API-REFERENCE.md)
- [Protocol Comparison](../docs/PROTOCOL-COMPARISON.md)
- [Examples](../examples/)
