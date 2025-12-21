# Unified MCP Apps Builder Framework - Design Document

## Executive Summary

This document outlines the design for a unified framework that abstracts over **MCP Apps (SEP-1865)** for Claude Desktop and **ChatGPT Apps (OpenAI Apps SDK)**, enabling developers to build interactive MCP-based applications that work seamlessly with both platforms from a single codebase.

## Goals

1. **Single Entry Point**: One `createApp()` function to define tools, UI, and configuration
2. **Type-Safe Bindings**: Full TypeScript inference for tool inputs, outputs, and UI data access
3. **Protocol Abstraction**: UI code works identically on MCP Apps and ChatGPT Apps hosts
4. **Flexible Deployment**: Start Express server directly or get MCP server instance for custom setup
5. **Extensibility**: Support future protocols and features without breaking changes

## Problem Statement

### Current Pain Points

Developers building interactive MCP applications face:

1. **Duplicate Codebases**: Separate implementations for Claude Desktop vs ChatGPT
2. **Different APIs**:
   - MCP Apps: `@modelcontextprotocol/ext-apps` SDK with JSON-RPC
   - ChatGPT Apps: `window.openai` global with event-based subscription
3. **Different Metadata Schemas**:
   - MCP Apps: `_meta.ui.resourceUri`, `_meta.ui.visibility`
   - ChatGPT Apps: `_meta["openai/outputTemplate"]`, `_meta["openai/visibility"]`
4. **Different MIME Types**:
   - MCP Apps: `text/html;profile=mcp-app`
   - ChatGPT Apps: `text/html+skybridge`
5. **Inconsistent State Management**: Different patterns for persisting UI state
6. **No Type Safety**: Tool inputs/outputs not type-checked against UI usage

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           createApp() Entry Point                         │
│                                                                           │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────────────┐ │
│  │   Tool Defs     │   │   UI Resources  │   │   App Configuration     │ │
│  │   (typed)       │   │   (HTML/React)  │   │   (CSP, auth, etc.)     │ │
│  └────────┬────────┘   └────────┬────────┘   └────────────┬────────────┘ │
│           │                     │                         │              │
│           └─────────────────────┼─────────────────────────┘              │
│                                 ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                     Unified App Definition                            ││
│  │                                                                       ││
│  │   - Type-safe tool registry with input/output schemas                ││
│  │   - UI resource registry with tool bindings                          ││
│  │   - Security configuration (CSP, auth requirements)                  ││
│  └───────────────────────────────┬──────────────────────────────────────┘│
│                                  │                                        │
│           ┌──────────────────────┼──────────────────────┐                │
│           ▼                      ▼                      ▼                │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────────────┐ │
│  │  MCP Protocol   │   │ OpenAI Protocol │   │  Future Protocols       │ │
│  │  Adapter        │   │ Adapter         │   │  (extensible)           │ │
│  └────────┬────────┘   └────────┬────────┘   └────────────┬────────────┘ │
│           │                     │                         │              │
└───────────┼─────────────────────┼─────────────────────────┼──────────────┘
            │                     │                         │
            ▼                     ▼                         ▼
    ┌───────────────┐    ┌───────────────┐         ┌───────────────┐
    │ Claude Desktop│    │   ChatGPT     │         │ Future Hosts  │
    │ (MCP Apps)    │    │ (Apps SDK)    │         │               │
    └───────────────┘    └───────────────┘         └───────────────┘
```

## Core API Design

### 1. `createApp()` Function Signature

```typescript
import { createApp } from "@apps-builder/core";

const app = createApp({
  name: "my-app",
  version: "1.0.0",

  // Tool definitions with full type inference
  tools: {
    search_restaurants: {
      description: "Search for restaurants",
      input: z.object({
        location: z.string(),
        cuisine: z.string().optional(),
      }),
      output: z.object({
        count: z.number(),
        results: z.array(z.object({
          id: z.string(),
          name: z.string(),
          rating: z.number(),
        })),
      }),
      // Type-safe handler
      handler: async (input) => {
        // `input` is typed as { location: string, cuisine?: string }
        const restaurants = await fetchRestaurants(input.location, input.cuisine);
        return {
          count: restaurants.length,
          results: restaurants,
          // Additional metadata (UI-only, not sent to model)
          _meta: {
            fullDetails: restaurants,
            searchTimestamp: new Date().toISOString(),
          },
        };
      },
      // Link to UI
      ui: "main-widget",
    },

    // UI-only tool (hidden from model)
    refresh_data: {
      description: "Refresh data (internal)",
      visibility: "app", // Only callable from UI
      input: z.object({}),
      output: z.object({ /* ... */ }),
      handler: async () => { /* ... */ },
    },
  },

  // UI resources
  ui: {
    "main-widget": {
      // HTML template or path to bundled HTML
      html: "./dist/widget.html",
      // Or inline:
      // html: `<!DOCTYPE html>...`,

      // CSP configuration
      csp: {
        connectDomains: ["https://api.example.com"],
        resourceDomains: ["https://cdn.jsdelivr.net"],
      },

      // UI preferences
      prefersBorder: true,
    },
  },

  // Global configuration
  config: {
    // Authentication
    auth: {
      type: "oauth2",
      scopes: ["read", "write"],
      protectedResource: "https://api.example.com",
      authorizationServer: "https://auth.example.com",
    },
  },
});
```

### 2. Starting the Server

```typescript
// Option 1: Start with Express (batteries included)
await app.start({
  port: 3000,
  transport: "http", // or "stdio" for CLI
});

// Option 2: Get MCP server instance for custom setup
const mcpServer = app.getServer();

// Use with custom transport
const myTransport = new MyCustomTransport();
await mcpServer.connect(myTransport);

// Option 3: Express middleware
import express from "express";
const expressApp = express();
expressApp.use("/mcp", app.handler());
expressApp.listen(3000);
```

### 3. Type-Safe UI Client

The framework provides a unified client SDK for the UI that works on both platforms:

```typescript
// In your React/vanilla UI code
import { useAppsClient, useToolResult, useHostContext } from "@apps-builder/ui-react";

// Types are inferred from your tool definitions
type AppTools = typeof app.tools;

function RestaurantList() {
  const client = useAppsClient<AppTools>();

  // Type-safe access to tool results
  // result.search_restaurants is typed as the output schema
  const result = useToolResult<AppTools>();

  // Access host context (theme, display mode, etc.)
  const context = useHostContext();

  // Type-safe tool calls
  const handleRefresh = async () => {
    // TypeScript enforces correct input shape
    await client.callTool("search_restaurants", {
      location: "Paris",
      // Error if you add unknown properties
    });
  };

  // Accessing result data with full typing
  const restaurants = result?.search_restaurants?.results ?? [];

  return (
    <div className={context.theme}>
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

### 4. Vanilla JS Client

```typescript
import { createClient } from "@apps-builder/ui";

// Initialize client
const client = await createClient<AppTools>();

// Type-safe event handlers
client.onToolResult((result) => {
  // result is typed
  const restaurants = result.search_restaurants?.results ?? [];
  render(restaurants);
});

client.onHostContextChange((context) => {
  document.body.className = context.theme;
});

// Type-safe tool calls
await client.callTool("search_restaurants", {
  location: "Paris",
});
```

## Unified Interface Abstraction

### Host Context Interface

```typescript
interface HostContext {
  // Theme
  theme: "light" | "dark";

  // Display
  displayMode: "inline" | "fullscreen" | "pip";
  availableDisplayModes: string[];

  // Viewport
  viewport: {
    width: number;
    height: number;
    maxHeight?: number;
    maxWidth?: number;
  };

  // Locale
  locale: string;      // BCP 47 (e.g., "en-US")
  timeZone?: string;   // IANA (e.g., "America/New_York")

  // Platform
  platform: "web" | "desktop" | "mobile";
  userAgent?: string;

  // Device capabilities
  deviceCapabilities?: {
    touch?: boolean;
    hover?: boolean;
  };

  // Safe area (mobile)
  safeAreaInsets?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };

  // Theming
  styles?: {
    variables?: Record<string, string>;
    css?: {
      fonts?: string;
    };
  };
}
```

### Client Interface

```typescript
interface AppsClient<T extends ToolDefs> {
  // Tool operations
  callTool<K extends keyof T>(
    name: K,
    args: z.infer<T[K]["input"]>
  ): Promise<z.infer<T[K]["output"]>>;

  // Messaging
  sendMessage(content: { type: "text"; text: string }): Promise<void>;
  sendFollowUpMessage(prompt: string): Promise<void>; // ChatGPT-style alias

  // Navigation
  openLink(url: string): Promise<void>;
  requestDisplayMode(mode: "inline" | "fullscreen" | "pip"): Promise<{ mode: string }>;
  requestClose(): void;

  // State (persisted across renders)
  getState<S>(): S | null;
  setState<S>(state: S): void;

  // Files (if supported)
  uploadFile?(file: File): Promise<{ fileId: string }>;
  getFileDownloadUrl?(fileId: string): Promise<{ downloadUrl: string }>;

  // Resources
  readResource(uri: string): Promise<{ contents: ResourceContent[] }>;

  // Logging
  log(level: "debug" | "info" | "warning" | "error", data: unknown): void;

  // Events
  onToolResult(handler: (result: ToolResult<T>) => void): () => void;
  onToolInput(handler: (input: ToolInput) => void): () => void;
  onToolCancelled(handler: (reason?: string) => void): () => void;
  onHostContextChange(handler: (context: HostContext) => void): () => void;
  onTeardown(handler: (reason?: string) => void): () => void;

  // Current state
  hostContext: HostContext;
  toolInput?: Record<string, unknown>;
  toolOutput?: Record<string, unknown>;
  toolMeta?: Record<string, unknown>;
}
```

## Protocol Adapters

### MCP Apps Adapter

```typescript
// internal implementation
class McpAppsAdapter implements ProtocolAdapter {
  private app: App;

  constructor() {
    this.app = new App({
      name: config.name,
      version: config.version,
    });
  }

  async connect(): Promise<void> {
    await this.app.connect(new PostMessageTransport(window.parent));
  }

  mapToolCall(name: string, args: Record<string, unknown>) {
    return this.app.callServerTool({ name, arguments: args });
  }

  mapHostContext(mcpContext: McpHostContext): HostContext {
    return {
      theme: mcpContext.theme,
      displayMode: mcpContext.displayMode,
      viewport: mcpContext.viewport,
      locale: mcpContext.locale,
      // ... map all fields
    };
  }

  // ... implement all interface methods
}
```

### ChatGPT Apps Adapter

```typescript
class ChatGptAppsAdapter implements ProtocolAdapter {
  async connect(): Promise<void> {
    // window.openai is already injected by ChatGPT
    if (!window.openai) {
      throw new Error("Not running in ChatGPT context");
    }
  }

  mapToolCall(name: string, args: Record<string, unknown>) {
    return window.openai.callTool(name, args);
  }

  mapHostContext(): HostContext {
    return {
      theme: window.openai.theme,
      displayMode: window.openai.displayMode,
      locale: window.openai.locale,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        maxHeight: window.openai.maxHeight,
      },
      safeAreaInsets: window.openai.safeArea,
      userAgent: window.openai.userAgent,
      // ... map all fields
    };
  }

  getState<S>(): S | null {
    return window.openai.widgetState as S;
  }

  setState<S>(state: S): void {
    window.openai.setWidgetState(state);
  }

  // ... implement all interface methods
}
```

### Auto-Detection

```typescript
function detectProtocol(): ProtocolAdapter {
  // Check for ChatGPT's window.openai
  if (typeof window !== "undefined" && window.openai) {
    return new ChatGptAppsAdapter();
  }

  // Check for MCP Apps iframe context
  if (typeof window !== "undefined" && window.parent !== window) {
    return new McpAppsAdapter();
  }

  // Development/testing fallback
  return new MockAdapter();
}
```

## Server-Side Protocol Mapping

The server adapts tool definitions to each protocol's expected format:

### Tool Registration

```typescript
function registerToolsForMcp(tools: ToolDefs, server: McpServer) {
  for (const [name, def] of Object.entries(tools)) {
    server.registerTool(name, {
      title: def.title ?? name,
      description: def.description,
      inputSchema: zodToJsonSchema(def.input),
      outputSchema: def.output ? zodToJsonSchema(def.output) : undefined,
      _meta: {
        ui: {
          resourceUri: def.ui ? `ui://${appName}/${def.ui}` : undefined,
          visibility: mapVisibility(def.visibility),
        },
      },
    }, async (args) => {
      const result = await def.handler(args);
      return {
        content: [{ type: "text", text: result._text ?? JSON.stringify(result) }],
        structuredContent: result,
        _meta: result._meta,
      };
    });
  }
}

function registerToolsForOpenAI(tools: ToolDefs, server: McpServer) {
  for (const [name, def] of Object.entries(tools)) {
    server.registerTool(name, {
      title: def.title ?? name,
      description: def.description,
      inputSchema: zodToJsonSchema(def.input),
      _meta: {
        "openai/outputTemplate": def.ui ? `ui://${appName}/${def.ui}` : undefined,
        "openai/widgetAccessible": def.visibility !== "model",
        "openai/visibility": def.visibility === "app" ? "private" : "public",
        "openai/toolInvocation/invoking": def.invokingMessage,
        "openai/toolInvocation/invoked": def.invokedMessage,
      },
    }, async (args) => {
      const result = await def.handler(args);
      return {
        content: [{ type: "text", text: result._text ?? JSON.stringify(result) }],
        structuredContent: result,
        _meta: result._meta,
      };
    });
  }
}
```

### Resource Registration

```typescript
function registerResourcesForMcp(ui: UIDefs, server: McpServer) {
  for (const [id, def] of Object.entries(ui)) {
    server.registerResource({
      uri: `ui://${appName}/${id}`,
      name: def.name ?? id,
      description: def.description,
      mimeType: "text/html;profile=mcp-app",
      _meta: {
        ui: {
          csp: def.csp,
          domain: def.domain,
          prefersBorder: def.prefersBorder,
        },
      },
    });
  }
}

function registerResourcesForOpenAI(ui: UIDefs, server: McpServer) {
  for (const [id, def] of Object.entries(ui)) {
    server.registerResource({
      uri: `ui://${appName}/${id}`,
      name: def.name ?? id,
      description: def.description,
      mimeType: "text/html+skybridge",
      _meta: {
        "openai/widgetPrefersBorder": def.prefersBorder,
        "openai/widgetDomain": def.domain,
        "openai/widgetCSP": {
          connect_domains: def.csp?.connectDomains,
          resource_domains: def.csp?.resourceDomains,
          redirect_domains: def.csp?.redirectDomains,
          frame_domains: def.csp?.frameDomains,
        },
      },
    });
  }
}
```

## Type Safety Implementation

### Zod-Based Schema Definition

```typescript
import { z } from "zod";

// Define tool schemas with Zod
const searchRestaurantsInput = z.object({
  location: z.string().describe("City or address"),
  cuisine: z.string().optional().describe("Type of cuisine"),
  maxResults: z.number().default(10),
});

const searchRestaurantsOutput = z.object({
  count: z.number(),
  results: z.array(z.object({
    id: z.string(),
    name: z.string(),
    rating: z.number(),
    address: z.string(),
  })),
});

// Tool definition with full type inference
const tools = {
  search_restaurants: {
    description: "Search for restaurants",
    input: searchRestaurantsInput,
    output: searchRestaurantsOutput,
    handler: async (input) => {
      // `input` is fully typed as z.infer<typeof searchRestaurantsInput>
      // { location: string, cuisine?: string, maxResults: number }

      const results = await db.query(input.location, input.cuisine);

      // Return type is checked against output schema
      return {
        count: results.length,
        results: results.slice(0, input.maxResults),
      };
    },
    ui: "main-widget",
  },
} satisfies ToolDefs;

// Type is automatically inferred
type SearchInput = z.infer<typeof searchRestaurantsInput>;
type SearchOutput = z.infer<typeof searchRestaurantsOutput>;
```

### Type Inference Helpers

```typescript
// Core type definitions
type ToolDef<TInput extends z.ZodType, TOutput extends z.ZodType> = {
  description: string;
  input: TInput;
  output: TOutput;
  handler: (input: z.infer<TInput>) => Promise<z.infer<TOutput> & { _meta?: Record<string, unknown> }>;
  ui?: string;
  visibility?: "model" | "app" | "both";
};

type ToolDefs = Record<string, ToolDef<z.ZodType, z.ZodType>>;

// Extract input/output types from tool definitions
type ToolInputs<T extends ToolDefs> = {
  [K in keyof T]: z.infer<T[K]["input"]>;
};

type ToolOutputs<T extends ToolDefs> = {
  [K in keyof T]: z.infer<T[K]["output"]>;
};

// Type-safe client
interface TypedClient<T extends ToolDefs> {
  callTool<K extends keyof T>(
    name: K,
    args: ToolInputs<T>[K]
  ): Promise<ToolOutputs<T>[K]>;
}
```

### Additive Properties (Non-Breaking)

The type system allows extra properties without breaking:

```typescript
// Tool output schema
const output = z.object({
  name: z.string(),
  rating: z.number(),
});

// In handler, can return additional properties
handler: async (input) => {
  return {
    name: "Restaurant",
    rating: 4.5,
    // Extra properties allowed - useful for _meta
    _meta: {
      fullDetails: { ... },
    },
    // Future additions won't break existing code
    newField: "value",
  };
}

// UI access is type-safe for known fields
const result = useToolResult();
result.name;   // ✓ typed as string
result.rating; // ✓ typed as number
result.unknownField; // ✓ allowed (additive), typed as unknown
```

## Package Structure

```
@apps-builder/
├── core/                    # Server-side framework
│   ├── src/
│   │   ├── createApp.ts     # Main entry point
│   │   ├── server.ts        # MCP server wrapper
│   │   ├── adapters/
│   │   │   ├── mcp.ts       # MCP Apps protocol adapter
│   │   │   └── openai.ts    # ChatGPT Apps protocol adapter
│   │   ├── types/
│   │   │   ├── tools.ts     # Tool definition types
│   │   │   ├── ui.ts        # UI resource types
│   │   │   └── config.ts    # Configuration types
│   │   └── utils/
│   │       ├── schema.ts    # Zod to JSON Schema
│   │       └── metadata.ts  # Protocol metadata mapping
│   └── package.json
│
├── ui/                      # Client-side SDK (vanilla)
│   ├── src/
│   │   ├── client.ts        # Unified client
│   │   ├── adapters/
│   │   │   ├── mcp.ts       # MCP Apps UI adapter
│   │   │   └── openai.ts    # ChatGPT Apps UI adapter
│   │   ├── detection.ts     # Protocol auto-detection
│   │   └── types.ts         # Shared types
│   └── package.json
│
├── ui-react/                # React bindings
│   ├── src/
│   │   ├── hooks.ts         # useAppsClient, useToolResult, etc.
│   │   ├── context.ts       # React context providers
│   │   └── components.ts    # Common components
│   └── package.json
│
├── ui-vue/                  # Vue bindings (future)
├── ui-svelte/               # Svelte bindings (future)
│
└── create-app/              # CLI scaffolding tool
    ├── src/
    │   ├── cli.ts
    │   └── templates/
    └── package.json
```

## Usage Examples

### Complete Example: Restaurant Search App

**Server (`server/index.ts`):**

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
        restaurants: z.array(z.object({
          id: z.string(),
          name: z.string(),
          rating: z.number(),
          cuisine: z.string(),
          priceLevel: z.number(),
        })),
      }),
      handler: async ({ location, cuisine, limit }) => {
        const results = await fetchRestaurants(location, cuisine, limit);
        return {
          count: results.length,
          restaurants: results,
          _meta: {
            fullDetails: results,
            timing: performance.now(),
          },
        };
      },
      ui: "restaurant-list",
      invokingMessage: "Searching for restaurants...",
      invokedMessage: "Found restaurants",
    },

    get_restaurant_details: {
      description: "Get detailed information about a restaurant",
      input: z.object({
        id: z.string(),
      }),
      output: z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        menu: z.array(z.object({
          name: z.string(),
          price: z.number(),
        })),
        reviews: z.array(z.object({
          author: z.string(),
          rating: z.number(),
          text: z.string(),
        })),
      }),
      handler: async ({ id }) => {
        return await fetchRestaurantDetails(id);
      },
      ui: "restaurant-details",
    },

    // UI-only tool for refreshing data
    refresh: {
      description: "Refresh restaurant data",
      visibility: "app",
      input: z.object({
        location: z.string(),
      }),
      output: z.object({ success: z.boolean() }),
      handler: async ({ location }) => {
        await invalidateCache(location);
        return { success: true };
      },
    },
  },

  ui: {
    "restaurant-list": {
      html: "./dist/list.html",
      csp: {
        connectDomains: ["https://api.yelp.com"],
        resourceDomains: ["https://s3-media0.fl.yelpcdn.com"],
      },
      prefersBorder: true,
    },
    "restaurant-details": {
      html: "./dist/details.html",
      csp: {
        connectDomains: ["https://api.yelp.com"],
        resourceDomains: ["https://s3-media0.fl.yelpcdn.com"],
      },
    },
  },
});

// Start server
await app.start({ port: 3000 });
```

**UI (`ui/src/RestaurantList.tsx`):**

```typescript
import { useAppsClient, useToolResult, useHostContext } from "@apps-builder/ui-react";
import type { AppTools } from "../server"; // Import types from server

function RestaurantList() {
  const client = useAppsClient<AppTools>();
  const result = useToolResult<AppTools>();
  const context = useHostContext();

  const restaurants = result?.search_restaurants?.restaurants ?? [];

  const handleRefresh = async () => {
    const input = result?.search_restaurants?._input;
    if (input?.location) {
      await client.callTool("search_restaurants", {
        location: input.location,
      });
    }
  };

  const handleDetails = async (id: string) => {
    await client.callTool("get_restaurant_details", { id });
  };

  const handleFollowUp = async (name: string) => {
    await client.sendFollowUpMessage(`Tell me more about ${name}`);
  };

  return (
    <div className={`app ${context.theme}`}>
      <header>
        <h1>Restaurants</h1>
        <button onClick={handleRefresh}>Refresh</button>
        {context.displayMode !== "fullscreen" && (
          <button onClick={() => client.requestDisplayMode("fullscreen")}>
            Fullscreen
          </button>
        )}
      </header>

      <main>
        {restaurants.map((r) => (
          <article key={r.id} className="restaurant-card">
            <h2>{r.name}</h2>
            <p>Cuisine: {r.cuisine}</p>
            <p>Rating: {"⭐".repeat(Math.round(r.rating))}</p>
            <p>Price: {"$".repeat(r.priceLevel)}</p>

            <div className="actions">
              <button onClick={() => handleDetails(r.id)}>
                View Details
              </button>
              <button onClick={() => handleFollowUp(r.name)}>
                Ask About
              </button>
            </div>
          </article>
        ))}
      </main>
    </div>
  );
}

export default RestaurantList;
```

**Styling (`ui/src/styles.css`):**

```css
:root {
  /* Fallbacks for graceful degradation */
  --color-background-primary: light-dark(#ffffff, #171717);
  --color-background-secondary: light-dark(#f5f5f5, #262626);
  --color-text-primary: light-dark(#171717, #fafafa);
  --color-text-secondary: light-dark(#525252, #a3a3a3);
  --color-border: light-dark(#e5e5e5, #404040);
  --font-sans: system-ui, -apple-system, sans-serif;
  --border-radius-md: 8px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
}

.app {
  background: var(--color-background-primary);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  padding: var(--spacing-md);
  min-height: 100vh;
}

.restaurant-card {
  background: var(--color-background-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
}

.actions {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
}

button {
  background: var(--color-background-primary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
}

button:hover {
  background: var(--color-background-secondary);
}
```

## Deployment Options

### Option 1: Built-in Express Server

```typescript
await app.start({
  port: 3000,
  transport: "http",
  // Optional CORS configuration
  cors: {
    origin: ["https://chatgpt.com", "https://claude.ai"],
  },
});
```

### Option 2: Custom Express Setup

```typescript
import express from "express";

const expressApp = express();

// Add custom middleware
expressApp.use(cors());
expressApp.use(helmet());

// Mount MCP handler
expressApp.use("/mcp", app.handler());

// Add custom routes
expressApp.get("/health", (req, res) => res.json({ ok: true }));

expressApp.listen(3000);
```

### Option 3: Raw MCP Server (stdio)

```typescript
const mcpServer = app.getServer();
await mcpServer.connect(new StdioTransport());
```

### Option 4: Serverless (Cloudflare Workers, Vercel, etc.)

```typescript
// For Cloudflare Workers
export default {
  async fetch(request: Request, env: Env) {
    return app.handleRequest(request, env);
  },
};

// For Vercel
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return app.handleRequest(req, res);
}
```

## Migration Path

### From Existing MCP Apps

```typescript
// Before: Manual MCP Apps setup
const server = new McpServer({ name: "my-app", version: "1.0.0" });

server.registerResource({
  uri: "ui://my-app/widget",
  name: "Widget",
  mimeType: "text/html;profile=mcp-app",
  _meta: { ui: { csp: { ... } } }
});

server.registerTool("my_tool", {
  inputSchema: { ... },
  _meta: { ui: { resourceUri: "ui://my-app/widget" } }
}, handler);

// After: Unified framework
const app = createApp({
  name: "my-app",
  version: "1.0.0",
  tools: {
    my_tool: {
      input: z.object({ ... }),
      handler: handler,
      ui: "widget",
    },
  },
  ui: {
    widget: {
      html: "./widget.html",
      csp: { ... },
    },
  },
});
```

### From Existing ChatGPT Apps

```typescript
// Before: Manual ChatGPT Apps setup
const server = new McpServer({ name: "my-app", version: "1.0.0" });

server.registerResource(
  "widget",
  "ui://widget/app.html",
  {},
  async () => ({
    contents: [{
      uri: "ui://widget/app.html",
      mimeType: "text/html+skybridge",
      text: html,
      _meta: {
        "openai/widgetCSP": { ... },
      },
    }],
  })
);

server.registerTool("my_tool", {
  inputSchema: { ... },
  _meta: {
    "openai/outputTemplate": "ui://widget/app.html",
    "openai/widgetAccessible": true,
  }
}, handler);

// After: Same unified framework
const app = createApp({
  name: "my-app",
  version: "1.0.0",
  tools: {
    my_tool: {
      input: z.object({ ... }),
      handler: handler,
      ui: "widget",
    },
  },
  ui: {
    widget: {
      html: "./widget.html",
      csp: { ... },
    },
  },
});
```

## Future Extensions

### Planned Features

1. **State Persistence**: Cross-session state storage API
2. **Multi-Widget**: Multiple UI resources per tool result
3. **External URLs**: Support for `text/uri-list` content type
4. **Streaming**: Real-time data streaming to UI
5. **Widget Communication**: Widget-to-widget messaging

### Protocol Extensions

The adapter pattern allows adding new host protocols without changing app code:

```typescript
// Register new protocol adapter
registerProtocolAdapter("my-platform", MyPlatformAdapter);

// Auto-detection includes new platform
const client = await createClient(); // Works on all platforms
```

## Open Questions

1. **Auth Abstraction**: Should we abstract OAuth configuration or let developers configure per-platform?
2. **File Handling**: MCP Apps doesn't have direct file APIs - should we provide a unified abstraction?
3. **State Scope**: How to handle different state semantics (ChatGPT: per-message, MCP: per-session)?
4. **CSP Differences**: ChatGPT has `redirect_domains` and `frame_domains` - how to map to MCP Apps?

## Next Steps

1. Implement core `createApp()` function with basic tool registration
2. Build MCP Apps server adapter
3. Build ChatGPT Apps server adapter
4. Create unified UI client SDK (vanilla JS)
5. Add React bindings
6. Create CLI scaffolding tool
7. Write comprehensive documentation and examples
8. Publish to npm as `@apps-builder/*` packages
