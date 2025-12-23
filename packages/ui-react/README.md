# @mcp-apps-kit/ui-react

[![npm](https://img.shields.io/npm/v/%40mcp-apps-kit%2Fui-react)](https://www.npmjs.com/package/@mcp-apps-kit/ui-react) [![node](https://img.shields.io/node/v/%40mcp-apps-kit%2Fui-react)](https://www.npmjs.com/package/@mcp-apps-kit/ui-react) [![license](https://img.shields.io/npm/l/%40mcp-apps-kit%2Fui-react)](https://www.npmjs.com/package/@mcp-apps-kit/ui-react)

React bindings for MCP app UIs/widgets.

This package builds on `@mcp-apps-kit/ui` and provides:
- an `AppsProvider`
- React hooks for host context + tool interactions

Use it inside your widget UI when you want React-first ergonomics.

## Install

```bash
npm install @mcp-apps-kit/ui-react @mcp-apps-kit/ui
```

Peer dependencies:
- `react` `^18 || ^19`
- `react-dom` `^18 || ^19`

## Quick start

```tsx
import { AppsProvider, useAppsClient, useToolResult, useHostContext } from "@mcp-apps-kit/ui-react";

function Widget() {
  const client = useAppsClient();
  const result = useToolResult();
  const host = useHostContext();

  return (
    <div data-theme={host.theme}>
      <button onClick={() => client.callTool("greet", { name: "Alice" })}>Greet</button>
      <pre>{JSON.stringify(result, null, 2)}</pre>
    </div>
  );
}

export function App() {
  return (
    <AppsProvider>
      <Widget />
    </AppsProvider>
  );
}
```

## Typed tools

For best TypeScript inference, parameterize the provider/client with your server-exported tool types.

```tsx
import { AppsProvider, useAppsClient } from "@mcp-apps-kit/ui-react";
import type { AppClientTools } from "../server";

function Widget() {
  const client = useAppsClient<AppClientTools>();
  // client.callTool(...) is now typed
  return null;
}

export function App() {
  return (
    <AppsProvider>
      <Widget />
    </AppsProvider>
  );
}
```

## Documentation & examples

- Project overview: ../../README.md
- Example React widget: ../../examples/kanban

## License

MIT
