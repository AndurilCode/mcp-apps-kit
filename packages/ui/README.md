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

await client.callTool("search_restaurants", { location: "Paris" });
```

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

Key exports include:

- `createClient`, `detectProtocol`
- `clientDebugLogger`, `ClientDebugLogger`
- `McpAdapter`, `OpenAIAdapter`, `MockAdapter`
- `HostContext`, `AppsClient`, `ToolResult`

## Contributing

See `../../CONTRIBUTING.md` for development setup and guidelines. Issues and pull requests are welcome.

## License

MIT
