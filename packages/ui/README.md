# @mcp-apps-kit/ui

[![npm](https://img.shields.io/npm/v/%40mcp-apps-kit%2Fui)](https://www.npmjs.com/package/@mcp-apps-kit/ui) [![node](https://img.shields.io/node/v/%40mcp-apps-kit%2Fui)](https://www.npmjs.com/package/@mcp-apps-kit/ui) [![license](https://img.shields.io/npm/l/%40mcp-apps-kit%2Fui)](https://www.npmjs.com/package/@mcp-apps-kit/ui)

Client-side (UI/widget) SDK for MCP apps.

Use this package inside the HTML/JS UI that your tool returns (a widget). It gives you a single `createClient()` API that **auto-detects the host** and lets you:

- call tools
- read tool results and tool inputs
- react to host context (theme, display mode, safe areas, etc.)

This package is framework-agnostic (vanilla TS/JS). If you’re using React, prefer `@mcp-apps-kit/ui-react`.

## Install

```bash
npm install @mcp-apps-kit/ui
```

## Quick start

```ts
import { createClient } from "@mcp-apps-kit/ui";

const client = await createClient();

// Call a tool by name
await client.callTool("greet", { name: "Alice" });

// React to host context changes (theme, etc.)
client.onHostContextChange((ctx) => {
  document.documentElement.dataset.theme = ctx.theme;
});
```

## Typed tool calls (recommended)

If your server exports tool types, you can parameterize the client to get fully typed `callTool()` inputs/outputs.

```ts
import { createClient } from "@mcp-apps-kit/ui";
import type { AppClientTools } from "../server";

const client = await createClient<AppClientTools>();

await client.callTool("search_restaurants", { location: "Paris" });
```

## Testing locally

You can force a specific adapter (useful in local dev / unit tests):

```ts
import { createClient } from "@mcp-apps-kit/ui";

const client = await createClient({ forceAdapter: "mock" });
```

## Debug Logging

The client debug logger allows you to send structured logs from your UI to the server through the MCP protocol. This bypasses sandbox restrictions in iframe environments where `console` access may be unavailable (e.g., mobile ChatGPT).

### Basic Usage

```ts
import { clientDebugLogger } from "@mcp-apps-kit/ui";

// Configure the logger (call once at app startup)
clientDebugLogger.configure({
  enabled: true, // Enable MCP transport
  level: "debug", // Minimum level to log
  source: "my-widget", // Identifier for log entries
});

// Log messages at different levels
clientDebugLogger.debug("Component mounted", { props });
clientDebugLogger.info("User action", { action: "click", target: "button" });
clientDebugLogger.warn("Validation warning", { field: "email" });
clientDebugLogger.error("API request failed", { error: err.message });
```

### Features

- **Intelligent batching**: Logs are batched to reduce MCP calls (default: 10 entries or 5 seconds)
- **Immediate flush on errors**: Error-level logs are flushed immediately
- **Automatic fallback**: Falls back to `console` when MCP transport is unavailable
- **Circular reference handling**: Safely serializes objects with circular references
- **Graceful degradation**: Works silently in restricted environments

### Configuration Options

```ts
clientDebugLogger.configure({
  enabled: true, // Enable/disable MCP transport
  level: "info", // "debug" | "info" | "warn" | "error"
  batchSize: 10, // Flush after N log entries
  flushIntervalMs: 5000, // Max time between flushes (ms)
  source: "my-app", // Source identifier for logs
});
```

### Server-Side Setup

For the logs to be received, the server must have debug logging enabled:

```ts
// server/index.ts
const app = createApp({
  config: {
    debug: { enabled: true, level: "debug" },
  },
});
```

**See also:** [@mcp-apps-kit/core README](../core/README.md) for server-side configuration.

## Documentation & examples

- Project overview: ../../README.md
- Examples that include UI code:
  - [kanban-mcp-example](https://github.com/AndurilCode/kanban-mcp-example)
  - ../../examples/minimal

## License

MIT
