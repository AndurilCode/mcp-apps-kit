# @mcp-apps-kit/ui

[![npm](https://img.shields.io/npm/v/%40mcp-apps-kit%2Fui)](https://www.npmjs.com/package/@mcp-apps-kit/ui) [![node](https://img.shields.io/node/v/%40mcp-apps-kit%2Fui)](https://www.npmjs.com/package/@mcp-apps-kit/ui) [![license](https://img.shields.io/npm/l/%40mcp-apps-kit%2Fui)](https://www.npmjs.com/package/@mcp-apps-kit/ui)

Client-side SDK for MCP applications (vanilla JavaScript).

Use this inside the HTML/JS UI returned by your tools. The SDK auto-detects the host (MCP Apps or ChatGPT Apps) and exposes a unified client for tool calls and host context.

## Table of Contents

- [Background](#background)
- [Features](#features)
- [Compatibility](#compatibility)
- [Install](#install)
- [Usage](#usage)
- [Debug Logging](#debug-logging)
- [Examples](#examples)
- [API](#api)
- [Contributing](#contributing)
- [License](#license)

## Background

Widget UIs run inside host environments with different APIs and capabilities. This package normalizes those differences so your UI code can call tools, read results, and respond to host context changes from a single API. For React apps, use `@mcp-apps-kit/ui-react`.

## Features

- `createClient()` with host auto-detection
- Tool calls with optional TypeScript typing
- Host context access (theme, display mode, safe areas)
- Tool inputs and results access
- Optional debug logger that transports logs via MCP
- Test adapter for local development
- **Host capabilities** - Query what the host supports (theming, display modes, file upload, etc.)
- **Bidirectional tools** - Register handlers for host-initiated tool calls
- **Theme & style utilities** - Apply host themes and CSS variables

## Compatibility

- Hosts: MCP Apps and ChatGPT (OpenAI Apps SDK)
- Node.js: `>= 18` for tooling/builds (browser runtime)
- MCP SDK: uses `@modelcontextprotocol/ext-apps`

## Install

```bash
npm install @mcp-apps-kit/ui
```

## Usage

### Quick start

```ts
import { createClient } from "@mcp-apps-kit/ui";

const client = await createClient();

await client.callTool("greet", { name: "Alice" });

client.onHostContextChange((ctx) => {
  document.documentElement.dataset.theme = ctx.theme;
});
```

### Typed tool calls

```ts
import { createClient } from "@mcp-apps-kit/ui";
import type { AppClientTools } from "../server";

const client = await createClient<AppClientTools>();

// Option 1: Using callTool with tool name string
await client.callTool("search_restaurants", { location: "Paris" });

// Option 2: Using the typed tools proxy (recommended)
await client.tools.callSearchRestaurants({ location: "Paris" });
```

The `tools` property provides a typed proxy with methods like `callGreet()`, `callSearchRestaurants()`, etc. Method names are generated from tool names by prepending "call" and capitalizing the first letter.

### Local testing

```ts
import { createClient } from "@mcp-apps-kit/ui";

const client = await createClient({ forceAdapter: "mock" });
```

## Debug Logging

Send structured logs from the UI to the server via MCP:

```ts
import { clientDebugLogger } from "@mcp-apps-kit/ui";

clientDebugLogger.configure({
  enabled: true,
  level: "debug",
  source: "my-widget",
});

clientDebugLogger.info("Component mounted", { props: "..." });
```

Server-side configuration:

```ts
const app = createApp({
  config: {
    debug: {
      logTool: true,
      level: "debug",
    },
  },
});
```

## Examples

- `../../examples/minimal`
- [kanban-mcp-example](https://github.com/AndurilCode/kanban-mcp-example)

## API

### Client Factory

- `createClient(options?)` - Create a connected client with auto-detection
- `detectProtocol()` - Detect the host platform ("mcp" | "openai" | "mock")

### Typed Tools Proxy

The `client.tools` property provides typed method wrappers for tool calls:

```ts
import type { AppClientTools } from "../server";

const client = await createClient<AppClientTools>();

// Tool name "greet" becomes method "callGreet"
const result = await client.tools.callGreet({ name: "Alice" });

// Tool name "searchRestaurants" becomes "callSearchRestaurants"
const restaurants = await client.tools.callSearchRestaurants({ location: "Paris" });
```

This is equivalent to `client.callTool("greet", { name: "Alice" })` but provides better IDE autocomplete and type checking.

### Host Capabilities

```ts
const capabilities = client.getHostCapabilities();

// Common capabilities (both platforms)
capabilities?.theming?.themes; // ["light", "dark"]
capabilities?.displayModes?.modes; // ["inline", "fullscreen", "pip"]
capabilities?.statePersistence?.persistent; // boolean
capabilities?.openLinks; // {} if supported
capabilities?.logging; // {} if supported

// MCP Apps specific
capabilities?.serverTools?.listChanged; // boolean
capabilities?.serverResources?.listChanged; // boolean
capabilities?.sizeNotifications; // {} if supported
capabilities?.partialToolInput; // {} if supported

// ChatGPT specific
capabilities?.fileUpload; // {} if supported
capabilities?.safeAreaInsets; // {} if supported
capabilities?.views; // {} if supported
```

### Host Version

```ts
const version = client.getHostVersion();
// { name: "Claude Desktop", version: "1.0.0" } (MCP Apps only)
```

### Theme & Style Utilities

```ts
import {
  applyDocumentTheme,
  getDocumentTheme,
  applyHostStyleVariables,
  applyHostFonts,
  removeHostFonts,
  clearHostStyleVariables,
} from "@mcp-apps-kit/ui";

// Apply theme to document
applyDocumentTheme("dark"); // or "light" or "os"

// Apply host-provided CSS variables
applyHostStyleVariables({
  "primary-color": "#007bff",
  "--font-size": "16px",
});

// Apply host-provided font CSS
applyHostFonts("@font-face { ... }");
```

### Bidirectional Tools (MCP Apps)

```ts
// Register a handler for host-initiated tool calls
client.setCallToolHandler(async (toolName, args) => {
  if (toolName === "get_selection") {
    return { selection: document.getSelection()?.toString() };
  }
  throw new Error(`Unknown tool: ${toolName}`);
});

// Register a handler for listing available tools
client.setListToolsHandler(async () => [
  { name: "get_selection", description: "Get current text selection" },
]);
```

### Protocol Logging

```ts
// Send logs via the MCP protocol (appears in host logs)
await client.sendLog("info", { event: "user_action", details: "..." });
```

### Error Handling

```ts
import { UIError, UIErrorCode } from "@mcp-apps-kit/ui";

try {
  await client.callTool("unknown");
} catch (error) {
  if (error instanceof UIError) {
    console.error(error.code, error.message);
  }
}
```

### Key Types

- `HostContext` - Theme, viewport, locale, display mode, etc.
- `HostCapabilities` - Protocol-agnostic capability interface
- `HostVersion` - Host application name and version
- `AppsClient` - Main client interface
- `UIError`, `UIErrorCode` - Client-side error types

## Contributing

See `../../CONTRIBUTING.md` for development setup and guidelines. Issues and pull requests are welcome.

## License

MIT
