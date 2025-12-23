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

## Documentation & examples

- Project overview: ../../README.md
- API reference: ../../docs/API-REFERENCE.md
- Examples that include UI code:
  - ../../examples/kanban
  - ../../examples/minimal

## License

MIT
