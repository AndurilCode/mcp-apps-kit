# @mcp-apps-kit/ui-react

[![npm](https://img.shields.io/npm/v/%40mcp-apps-kit%2Fui-react)](https://www.npmjs.com/package/@mcp-apps-kit/ui-react) [![node](https://img.shields.io/node/v/%40mcp-apps-kit%2Fui-react)](https://www.npmjs.com/package/@mcp-apps-kit/ui-react) [![license](https://img.shields.io/npm/l/%40mcp-apps-kit%2Fui-react)](https://www.npmjs.com/package/@mcp-apps-kit/ui-react)

React bindings for MCP applications.

`@mcp-apps-kit/ui-react` builds on `@mcp-apps-kit/ui` to provide React context and hooks for tool calls, tool results, and host context.

## Table of Contents

- [Background](#background)
- [Features](#features)
- [Compatibility](#compatibility)
- [Install](#install)
- [Usage](#usage)
- [Examples](#examples)
- [API](#api)
- [Contributing](#contributing)
- [License](#license)

## Background

React widgets often need host-aware APIs for tool calls and UI state. This package provides a React-first wrapper around the vanilla UI SDK so you can use hooks instead of manual subscriptions.

## Features

- `AppsProvider` context wrapper
- Hooks for tools, host context, and widget state
- Typed tool calls with generics
- Optional debug logger hook

## Compatibility

- Hosts: MCP Apps and ChatGPT (OpenAI Apps SDK)
- Node.js: `>= 18` for tooling/builds (browser runtime)
- Peer dependencies: `react` and `react-dom` `^18 || ^19`

## Install

```bash
npm install @mcp-apps-kit/ui-react
```

## Usage

### Quick start

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

### Typed tools

```tsx
import { AppsProvider, useAppsClient } from "@mcp-apps-kit/ui-react";
import type { AppClientTools } from "../server";

function Widget() {
  const client = useAppsClient<AppClientTools>();
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

## Examples

- [kanban-mcp-example](https://github.com/AndurilCode/kanban-mcp-example)

## API

Key exports include:

- `AppsProvider`
- `useAppsClient`, `useToolResult`, `useHostContext`
- `useToolInput`, `useWidgetState`, `useDebugLogger`
- `useFileUpload`, `useFileDownload` (ChatGPT only)

## Contributing

See `../../CONTRIBUTING.md` for development setup and guidelines. Issues and pull requests are welcome.

## License

MIT
