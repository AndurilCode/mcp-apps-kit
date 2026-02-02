<p align="center">
  <img src=".github/assets/logo-light.svg#gh-light-mode-only" alt="MCP AppsKit Logo" width="500">
  <img src=".github/assets/logo-dark.svg#gh-dark-mode-only" alt="MCP AppsKit Logo" width="500">
</p>

<p align="center">
  <strong>Build interactive AI apps for MCP Apps and ChatGPT. The Modern TypeScript Way.</strong>
</p>

<p align="center">
  <a href="https://github.com/AndurilCode/mcp-apps-kit/actions/workflows/publish.yml">
    <img src="https://github.com/AndurilCode/mcp-apps-kit/actions/workflows/publish.yml/badge.svg?branch=main" alt="Publish to npm">
  </a>
  <a href="https://www.npmjs.com/package/@mcp-apps-kit/core">
    <img src="https://img.shields.io/npm/v/%40mcp-apps-kit%2Fcore?logo=npm&label=core" alt="npm @mcp-apps-kit/core">
  </a>
  <a href="https://www.npmjs.com/package/@mcp-apps-kit/codegen">
    <img src="https://img.shields.io/npm/v/%40mcp-apps-kit%2Fcodegen?logo=npm&label=codegen" alt="npm @mcp-apps-kit/codegen">
  </a>
  <a href="https://www.npmjs.com/package/@mcp-apps-kit/core">
    <img src="https://img.shields.io/node/v/%40mcp-apps-kit%2Fcore?label=node&logo=node.js&logoColor=white" alt="Node >=18">
  </a>
  <a href="https://github.com/AndurilCode/mcp-apps-kit/blob/main/LICENSE">
    <img src="https://img.shields.io/npm/l/%40mcp-apps-kit%2Fcore?label=license" alt="License MIT">
  </a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="https://andurilcode.github.io/mcp-apps-kit/">Documentation</a> •
  <a href="#examples">Examples</a> •
  <a href="https://github.com/AndurilCode/mcp-apps-kit/issues">Issues</a>
</p>

---

## Features at a Glance

| Feature                           | Description                                                        |
| --------------------------------- | ------------------------------------------------------------------ |
| **File-Based Development**        | Tools, widgets, and workflows auto-discovered from your filesystem |
| **Convention over Configuration** | `tools/get-weather.ts` → `getWeather` tool, automatically          |
| **Colocated Widgets**             | React UIs in `ui/widgets/` auto-bind to matching tools             |
| **Type-Safe End-to-End**          | Full TypeScript inference from inputs to UI props                  |
| **Dual Platform**                 | Single codebase deploys to MCP Apps & ChatGPT                      |
| **Hot Module Reload**             | Vite-powered HMR with React Fast Refresh for widgets               |
| **Zero Boilerplate**              | No manifest files to maintain — codegen handles it                 |

---

## Quick Start

```bash
npx @mcp-apps-kit/create-app@latest my-app
cd my-app && npm run dev
```

Or manually set up a file-based project:

```bash
npm install @mcp-apps-kit/core @mcp-apps-kit/codegen zod
```

---

## How It Works

MCP AppsKit uses **file-based conventions** to eliminate boilerplate. Drop files in the right directories and everything wires up automatically.

### Project Structure

```
my-app/
├── mcp.config.ts              # App configuration (single source of truth)
├── tools/
│   ├── get-weather.ts         # → getWeather tool
│   └── search-location.ts     # → searchLocation tool
├── workflows/
│   └── daily-briefing.ts      # → dailyBriefing workflow
├── ui/widgets/
│   ├── get-weather.tsx        # → Auto-bound to getWeather tool
│   └── daily-briefing.tsx     # → Auto-bound to dailyBriefing
├── middleware/
│   └── logging.ts             # Runs on every tool call
├── handlers/
│   └── app-lifecycle.ts       # Server events (start, shutdown)
└── __generated__/             # Auto-generated (gitignored)
    └── app-manifest.ts
```

### Configuration

```typescript
// mcp.config.ts
import { defineConfig } from "@mcp-apps-kit/codegen";

export default defineConfig({
  name: "weather-app",
  version: "1.0.0",
  directories: {
    tools: "tools",
    workflows: "workflows",
    uiWidgets: "ui/widgets",
    middleware: "middleware",
    handlers: "handlers",
  },
  config: {
    protocol: "mcp", // or "openai" for ChatGPT
    cors: { origin: true },
  },
});
```

### Define a Tool

```typescript
// tools/get-weather.ts
import { tool } from "@mcp-apps-kit/core";
import { z } from "zod";

export default tool
  .describe("Get current weather for a location")
  .input({
    location: z.string().describe("City name"),
  })
  .output(
    z.object({
      temperature: z.number(),
      conditions: z.string(),
      humidity: z.number(),
    })
  )
  .handle(async ({ location }) => {
    const data = await fetchWeather(location);
    return {
      temperature: data.temp,
      conditions: data.weather,
      humidity: data.humidity,
    };
  });
```

### Create a Widget

Widgets in `ui/widgets/` automatically bind to tools with matching filenames:

```tsx
// ui/widgets/get-weather.tsx
import { useToolResult, useHostContext } from "@mcp-apps-kit/ui-react";
import type { WidgetMetadata } from "@mcp-apps-kit/core";

export default function WeatherWidget() {
  const result = useToolResult<{ temperature: number; conditions: string }>();
  const { theme } = useHostContext();

  if (!result) return <div>Loading...</div>;

  return (
    <div className={theme === "dark" ? "dark" : ""}>
      <h2>{result.temperature}°C</h2>
      <p>{result.conditions}</p>
    </div>
  );
}

// Widget metadata (optional)
export const ui: WidgetMetadata = {
  name: "Weather Display",
  prefersBorder: true,
};
```

### Run Your App

```bash
npm run dev
```

The codegen watches for changes and regenerates the manifest. Your tools and widgets are instantly available. Widget changes are picked up by Vite's HMR with React Fast Refresh — no full reload needed.

---

## Naming Conventions

Files are automatically converted to camelCase identifiers:

| File                     | Tool Name                       |
| ------------------------ | ------------------------------- |
| `get-current-weather.ts` | `getCurrentWeather`             |
| `search_locations.ts`    | `searchLocations`               |
| `DailyBriefing.ts`       | `dailyBriefing`                 |
| `_shared.ts`             | _(ignored — underscore prefix)_ |

---

## Packages

| Package                                                                 | Description                                  |
| ----------------------------------------------------------------------- | -------------------------------------------- |
| [`@mcp-apps-kit/core`](packages/core/README.md)                         | Server framework with tool/workflow builders |
| [`@mcp-apps-kit/codegen`](packages/codegen/README.md)                   | File-based discovery and manifest generation |
| [`@mcp-apps-kit/ui`](packages/ui/README.md)                             | Client SDK (vanilla JS)                      |
| [`@mcp-apps-kit/ui-react`](packages/ui-react/README.md)                 | React bindings and hooks                     |
| [`@mcp-apps-kit/ui-react-builder`](packages/ui-react-builder/README.md) | Vite plugin for widget bundling and HMR      |
| [`@mcp-apps-kit/create-app`](packages/create-app/README.md)             | CLI scaffolding tool                         |
| [`@mcp-apps-kit/testing`](packages/testing/README.md)                   | Test utilities and mocks                     |

---

## Advanced Features

### Middleware

Add cross-cutting concerns like logging, auth, or metrics:

```typescript
// middleware/logging.ts
import { defineMiddleware } from "@mcp-apps-kit/codegen";

export default defineMiddleware({
  before: async (ctx) => {
    ctx.state.set("startTime", Date.now());
    console.log(`Tool called: ${ctx.toolName}`);
  },
  after: async (ctx) => {
    const duration = Date.now() - ctx.state.get("startTime");
    console.log(`Completed in ${duration}ms`);
  },
});
```

### Event Handlers

React to server lifecycle events:

```typescript
// handlers/app-lifecycle.ts
import { defineHandler, Events } from "@mcp-apps-kit/codegen";

export default defineHandler({
  event: Events.APP_START,
  handler: async ({ port }) => {
    console.log(`Server started on port ${port}`);
  },
});
```

### Multi-Version APIs

Support multiple API versions from a single codebase:

```typescript
// mcp.config.ts
export default defineConfig({
  name: "my-api",
  versions: {
    v1: {
      version: "1.0.0",
      // Uses versions/v1/tools, versions/v1/workflows, etc.
    },
    v2: {
      version: "2.0.0",
      config: { debug: { level: "debug" } },
    },
  },
});
```

### Workflow Engine

Compose multi-step operations:

```typescript
// workflows/order-process.ts
import { workflow, toolStep } from "@mcp-apps-kit/core";
import { z } from "zod";

export default workflow("process_order")
  .input({ orderId: z.string() })
  .output({ success: z.boolean() })
  .step("validate", toolStep("validate_order"))
  .step("payment", toolStep("process_payment"), {
    retry: { maxAttempts: 3, backoff: "exponential" },
  })
  .parallel("notify", [toolStep("send_email"), toolStep("send_sms")])
  .build();
```

---

## Platform Support

| Feature           | MCP Apps | ChatGPT Apps |
| ----------------- | -------- | ------------ |
| Tool Calling      | Yes      | Yes          |
| Structured Output | Yes      | Yes          |
| React Widgets     | Yes      | Yes          |
| OAuth 2.1         | Yes      | Yes          |
| Theme Support     | Yes      | Yes          |
| Persisted State   | No       | Yes          |
| Tool Cancellation | Yes      | No           |

---

## Examples

### Weather App

Full-featured example with tools, widgets, middleware, and workflows:

```bash
git clone https://github.com/AndurilCode/mcp-apps-kit.git
cd mcp-apps-kit/examples/weather-app
pnpm install && pnpm dev
```

### Kanban Demo

Production-ready example with tool calling, React widgets, plugins, middleware, and events:

```bash
git clone https://github.com/AndurilCode/kanban-mcp-example.git
cd kanban-mcp-example
npm install && npm run dev
```

---

## Deployment

### Express (default)

```typescript
// Handled automatically by codegen
npm run start
```

### Stdio Mode

```typescript
// mcp.config.ts
export default defineConfig({
  // ...
  config: {
    transport: "stdio",
  },
});
```

### Serverless

```typescript
import { createFileBasedApp } from "@mcp-apps-kit/codegen";

const app = await createFileBasedApp();

export default {
  async fetch(request: Request) {
    return app.handleRequest(request);
  },
};
```

---

## Compatibility

- **Node.js**: >= 18 (runtime), >= 20 (development/CLI)
- **React**: 18.x or 19.x
- **Zod**: ^4.0.0
- **Vite**: 5.x, 6.x, or 7.x

---

## API Reference

**[Full Documentation](https://andurilcode.github.io/mcp-apps-kit/)** — TypeDoc-generated API reference

Package documentation:

- [Core API](packages/core/README.md)
- [UI SDK](packages/ui/README.md)
- [React Hooks](packages/ui-react/README.md)
- [Widget Builder](packages/ui-react-builder/README.md)
- [Testing](packages/testing/README.md)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup. Issues and pull requests welcome.

---

## License

[MIT](LICENSE)
