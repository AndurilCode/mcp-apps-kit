# Quickstart

Build interactive MCP applications with rich UIs that work on both **Claude Desktop** and **ChatGPT** from a single codebase.

## Installation

```bash
# Create a new project
npx @mcp-apps-kit/create-app my-app
cd my-app
pnpm install

# Or add to an existing project
pnpm add @mcp-apps-kit/core @mcp-apps-kit/ui-react zod
```

## Basic Server Setup

Create an MCP server with tools that return structured data:

```typescript
import { createApp, defineTool, defineUI } from "@mcp-apps-kit/core";
import { z } from "zod";

// Define a UI resource for the tool
const greetingWidget = defineUI({
  name: "Greeting Widget",
  html: "./ui/dist/greeting.html",
  prefersBorder: true,
});

// Create the app
const app = createApp({
  name: "my-app",
  version: "1.0.0",
  tools: {
    greet: defineTool({
      title: "Greet User",
      description: "Generate a personalized greeting",
      input: z.object({
        name: z.string().describe("Name to greet"),
      }),
      output: z.object({
        message: z.string(),
        timestamp: z.string(),
      }),
      ui: greetingWidget,
      handler: async ({ name }) => ({
        message: `Hello, ${name}!`,
        timestamp: new Date().toISOString(),
      }),
    }),
  },
});

// Start the server
await app.start({ port: 3000 });
```

## React UI Component

Create a React component that displays the tool result. Wrap your app with `AppsProvider`:

```tsx
// ui/src/App.tsx
import { AppsProvider } from "@mcp-apps-kit/ui-react";
import { GreetingWidget } from "./GreetingWidget";

export function App() {
  return (
    <AppsProvider>
      <GreetingWidget />
    </AppsProvider>
  );
}
```

```tsx
// ui/src/GreetingWidget.tsx
import { useToolResult, useHostContext } from "@mcp-apps-kit/ui-react";

interface GreetingResult {
  message: string;
  timestamp: string;
}

export function GreetingWidget() {
  const result = useToolResult<GreetingResult>();
  const { theme } = useHostContext();

  if (!result) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{
      padding: "1rem",
      background: theme === "dark" ? "#1a1a1a" : "#fff"
    }}>
      <h2>{result.message}</h2>
      <p>Generated at: {new Date(result.timestamp).toLocaleString()}</p>
    </div>
  );
}
```

## End-to-End Type Safety

Export types from your server to get fully typed tool results in UI code:

```typescript
// server/index.ts
import { createApp, defineTool, type ClientToolsFromCore } from "@mcp-apps-kit/core";
import { z } from "zod";

const app = createApp({
  name: "my-app",
  version: "1.0.0",
  tools: {
    greet: defineTool({
      input: z.object({ name: z.string() }),
      output: z.object({ message: z.string(), timestamp: z.string() }),
      handler: async (input) => ({
        message: `Hello, ${input.name}!`,
        timestamp: new Date().toISOString(),
      }),
    }),
  },
});

// Export types for UI code
export type AppTools = typeof app.tools;
export type AppClientTools = ClientToolsFromCore<AppTools>;
```

Then use the types in your UI:

```tsx
// ui/Widget.tsx
import { useToolResult, useAppsClient } from "@mcp-apps-kit/ui-react";
import type { AppClientTools } from "../server";

function Widget() {
  const client = useAppsClient<AppClientTools>();
  const result = useToolResult<AppClientTools>();

  // TypeScript enforces correct tool name and input shape
  const handleGreet = () => client.callTool("greet", { name: "Alice" });

  // result?.greet?.message is typed as string | undefined
  if (result?.greet) {
    return <p>{result.greet.message}</p>;
  }

  return <button onClick={handleGreet}>Greet</button>;
}
```

## Available React Hooks

### Core Hooks

| Hook | Purpose |
|------|---------|
| `useAppsClient()` | Client instance for tool calls |
| `useToolResult<T>()` | Current tool result data |
| `useToolInput<T>()` | Tool input parameters |
| `useHostContext()` | Host info (theme, viewport, locale) |
| `useWidgetState()` | Persist state across reloads |
| `useDisplayMode()` | Toggle fullscreen mode |

### Host Capabilities

```tsx
import { useHostCapabilities, useHostVersion } from "@mcp-apps-kit/ui-react";

function Widget() {
  const capabilities = useHostCapabilities();
  const version = useHostVersion();

  const themes = capabilities?.theming?.themes;       // ["light", "dark"]
  const modes = capabilities?.displayModes?.modes;    // ["inline", "fullscreen"]
  const hasFileUpload = !!capabilities?.fileUpload;   // ChatGPT only

  return <div>Host: {version?.name}</div>;
}
```

### File & Modal Operations (ChatGPT)

| Hook | Purpose |
|------|---------|
| `useFileUpload()` | Upload files to host |
| `useFileDownload()` | Get file download URLs |
| `useModal()` | Show modal dialogs |

### Theme & Style Hooks

| Hook | Purpose |
|------|---------|
| `useHostStyleVariables()` | Apply host CSS variables |
| `useDocumentTheme()` | Sync document theme |
| `useSafeAreaInsets()` | Safe area insets (ChatGPT) |

## Middleware

Add cross-cutting concerns with Koa-style middleware:

```typescript
app.use(async (context, next) => {
  console.log(`Tool called: ${context.toolName}`);
  const start = Date.now();

  await next();

  console.log(`Completed in ${Date.now() - start}ms`);
});
```

## Plugins

Extend functionality with lifecycle hooks:

```typescript
import { loggingPlugin } from "@mcp-apps-kit/core";

const app = createApp({
  name: "my-app",
  version: "1.0.0",
  plugins: [loggingPlugin],
  tools: { /* ... */ },
});
```

Create custom plugins:

```typescript
const myPlugin = {
  name: "my-plugin",
  onInit: async () => console.log("App initializing..."),
  onStart: async () => console.log("App started"),
  beforeToolCall: async (context) => {
    console.log(`Tool called: ${context.toolName}`);
  },
  afterToolCall: async (context) => {
    console.log(`Tool completed: ${context.toolName}`);
  },
};
```

## Events

Subscribe to app lifecycle events:

```typescript
app.on("tool:called", ({ toolName }) => {
  analytics.track("tool_called", { tool: toolName });
});
```

## Debug Logging

Enable debug logging to receive logs from client UIs:

```typescript
const app = createApp({
  name: "my-app",
  version: "1.0.0",
  tools: { /* ... */ },
  config: {
    debug: {
      logTool: true,
      level: "debug",
    },
  },
});
```

Use the server-side logger:

```typescript
import { debugLogger } from "@mcp-apps-kit/core";

debugLogger.info("User action", { userId: "456" });
```

## OAuth 2.1 Authentication

Add bearer token validation:

```typescript
const app = createApp({
  name: "my-app",
  version: "1.0.0",
  tools: { /* ... */ },
  config: {
    oauth: {
      protectedResource: "http://localhost:3000",
      authorizationServer: "https://auth.example.com",
      scopes: ["mcp:read", "mcp:write"],
    },
  },
});
```

Access auth context in handlers:

```typescript
tools: {
  get_user_data: defineTool({
    input: z.object({}),
    handler: async (_input, context) => {
      const subject = context.subject; // Authenticated user ID
      return { userId: subject };
    },
  }),
}
```

## Platform Support

MCP Apps Kit automatically handles protocol differences:

| Feature | Claude Desktop | ChatGPT |
|---------|---------------|---------|
| Tool execution | MCP protocol | OpenAI Apps SDK |
| UI rendering | iframe | Widget runtime |
| Theme support | Auto-detected | Auto-detected |
| File upload | Supported | Supported |
| Modals | Supported | Supported |
| Partial input | Supported | - |
| Size notifications | Supported | - |

## Next Steps

- Explore the API Reference in the navigation for detailed documentation
- Check out the [examples](https://github.com/AndurilCode/mcp-apps-kit/tree/main/examples) for more complex use cases
- Read the package READMEs for in-depth guides:
  - [@mcp-apps-kit/core](https://www.npmjs.com/package/@mcp-apps-kit/core) - Server framework
  - [@mcp-apps-kit/ui-react](https://www.npmjs.com/package/@mcp-apps-kit/ui-react) - React hooks
  - [@mcp-apps-kit/ui-react-builder](https://www.npmjs.com/package/@mcp-apps-kit/ui-react-builder) - Build tools
