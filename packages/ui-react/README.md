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
- **Host capabilities** - Query what the host supports (theming, display modes, file upload, etc.)
- **Size notifications** - Automatic resize observer integration
- **Partial tool input** - React to streaming tool inputs

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

### Typed tools and results

Use `ClientToolsFromCore` from `@mcp-apps-kit/core` for end-to-end type safety:

```tsx
import { AppsProvider, useAppsClient, useToolResult } from "@mcp-apps-kit/ui-react";
import type { AppClientTools } from "../server"; // Exported from your server

function Widget() {
  // Typed client - callTool arguments and return types are inferred
  const client = useAppsClient<AppClientTools>();

  // Typed results - result?.greet?.message is typed as string | undefined
  const result = useToolResult<AppClientTools>();

  const handleGreet = async () => {
    // TypeScript enforces correct tool name and input shape
    await client.callTool("greet", { name: "Alice" });
  };

  if (result?.greet) {
    return (
      <div>
        <p>{result.greet.message}</p>
        <p>at {result.greet.timestamp}</p>
      </div>
    );
  }

  return <button onClick={handleGreet}>Greet</button>;
}

export function App() {
  return (
    <AppsProvider>
      <Widget />
    </AppsProvider>
  );
}
```

The `AppClientTools` type is generated in your server code:

```ts
// server/index.ts
import { createApp, defineTool, type ClientToolsFromCore } from "@mcp-apps-kit/core";

const app = createApp({
  tools: {
    greet: defineTool({
      input: z.object({ name: z.string() }),
      output: z.object({ message: z.string(), timestamp: z.string() }),
      handler: async (input) => ({ ... }),
    }),
  },
});

// Export for UI code
export type AppClientTools = ClientToolsFromCore<typeof app.tools>;
```

## Examples

- [kanban-mcp-example](https://github.com/AndurilCode/kanban-mcp-example)

## API

### Provider

- `AppsProvider` - Context wrapper for all hooks

### Core Hooks

| Hook             | Description                               |
| ---------------- | ----------------------------------------- |
| `useAppsClient`  | Client instance for tool calls            |
| `useToolResult`  | Current tool result data                  |
| `useToolInput`   | Tool input parameters                     |
| `useHostContext` | Host info (theme, viewport, locale, etc.) |
| `useWidgetState` | Persisted state across reloads            |
| `useDisplayMode` | Fullscreen/panel mode control             |
| `useDebugLogger` | Debug logging configuration               |

### Host Capabilities & Version

```tsx
import { useHostCapabilities, useHostVersion } from "@mcp-apps-kit/ui-react";

function Widget() {
  const capabilities = useHostCapabilities();
  const version = useHostVersion();

  // Common capabilities (both platforms)
  const themes = capabilities?.theming?.themes; // ["light", "dark"]
  const modes = capabilities?.displayModes?.modes; // ["inline", "fullscreen", "pip"]

  // MCP Apps specific
  const hasPartialInput = !!capabilities?.partialToolInput;

  // ChatGPT specific
  const hasFileUpload = !!capabilities?.fileUpload;

  // Host version (MCP Apps only)
  // { name: "Claude Desktop", version: "1.0.0" }
  return <div>Host: {version?.name}</div>;
}
```

### Size Notifications (MCP Apps)

```tsx
import { useSizeChangedNotifications } from "@mcp-apps-kit/ui-react";

function Widget() {
  // Attach to container to auto-report size changes
  const containerRef = useSizeChangedNotifications();

  return <div ref={containerRef}>Content that may resize</div>;
}
```

### Partial Tool Input (MCP Apps)

```tsx
import { useOnToolInputPartial } from "@mcp-apps-kit/ui-react";

function Widget() {
  useOnToolInputPartial((input) => {
    // React to streaming partial input from the model
    console.log("Partial input:", input);
  });

  return <div>Streaming input widget</div>;
}
```

### Theme & Style Hooks

| Hook                    | Description                       |
| ----------------------- | --------------------------------- |
| `useHostStyleVariables` | Apply host-provided CSS variables |
| `useDocumentTheme`      | Sync document theme with host     |
| `useSafeAreaInsets`     | Safe area insets (ChatGPT)        |

### Lifecycle Hooks

| Hook                 | Description                            |
| -------------------- | -------------------------------------- |
| `useOnToolCancelled` | Callback when tool is cancelled        |
| `useOnTeardown`      | Cleanup callback before widget removal |

### File Operations (ChatGPT)

| Hook              | Description            |
| ----------------- | ---------------------- |
| `useFileUpload`   | Upload files to host   |
| `useFileDownload` | Get file download URLs |

### Layout (ChatGPT)

| Hook                 | Description                 |
| -------------------- | --------------------------- |
| `useIntrinsicHeight` | Set widget intrinsic height |
| `useView`            | View management             |

### Modals (ChatGPT)

| Hook       | Description             |
| ---------- | ----------------------- |
| `useModal` | Modal dialog management |

## Contributing

See `../../CONTRIBUTING.md` for development setup and guidelines. Issues and pull requests are welcome.

## License

MIT
