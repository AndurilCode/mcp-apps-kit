<p align="center">
  <img src=".github/assets/logo-light.svg#gh-light-mode-only" alt="MCP AppsKit Logo" width="500">
  <img src=".github/assets/logo-dark.svg#gh-dark-mode-only" alt="MCP AppsKit Logo" width="500">
</p>

<p align="center">
  <a href="https://github.com/AndurilCode/mcp-apps-kit/actions/workflows/publish.yml">
    <img src="https://github.com/AndurilCode/mcp-apps-kit/actions/workflows/publish.yml/badge.svg?branch=main" alt="Publish to npm">
  </a>
  <a href="https://www.npmjs.com/package/@mcp-apps-kit/core">
    <img src="https://img.shields.io/node/v/%40mcp-apps-kit%2Fcore?label=node&logo=node.js&logoColor=white" alt="Node >=18">
  </a>
  <a href="https://github.com/AndurilCode/mcp-apps-kit/blob/main/LICENSE">
    <img src="https://img.shields.io/npm/l/%40mcp-apps-kit%2Fcore?label=license" alt="License MIT">
  </a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mcp-apps-kit/core">
    <img src="https://img.shields.io/npm/v/%40mcp-apps-kit%2Fcore?label=%40mcp-apps-kit%2Fcore&logo=npm" alt="npm @mcp-apps-kit/core">
  </a>
  <a href="https://www.npmjs.com/package/@mcp-apps-kit/ui">
    <img src="https://img.shields.io/npm/v/%40mcp-apps-kit%2Fui?label=%40mcp-apps-kit%2Fui&logo=npm" alt="npm @mcp-apps-kit/ui">
  </a>
  <a href="https://www.npmjs.com/package/@mcp-apps-kit/ui-react">
    <img src="https://img.shields.io/npm/v/%40mcp-apps-kit%2Fui-react?label=%40mcp-apps-kit%2Fui-react&logo=npm" alt="npm @mcp-apps-kit/ui-react">
  </a>
  <a href="https://www.npmjs.com/package/@mcp-apps-kit/ui-react-builder">
    <img src="https://img.shields.io/npm/v/%40mcp-apps-kit%2Fui-react-builder?label=%40mcp-apps-kit%2Fui-react-builder&logo=npm" alt="npm @mcp-apps-kit/ui-react-builder">
  </a>
  <a href="https://www.npmjs.com/package/@mcp-apps-kit/create-app">
    <img src="https://img.shields.io/npm/v/%40mcp-apps-kit%2Fcreate-app?label=%40mcp-apps-kit%2Fcreate-app&logo=npm" alt="npm @mcp-apps-kit/create-app">
  </a>
  <a href="https://www.npmjs.com/package/@mcp-apps-kit/testing">
    <img src="https://img.shields.io/npm/v/%40mcp-apps-kit%2Ftesting?label=%40mcp-apps-kit%2Ftesting&logo=npm" alt="npm @mcp-apps-kit/testing">
  </a>
</p>

<p align="center">
  <strong>Build interactive AI apps for <a href="https://blog.modelcontextprotocol.io/posts/2025-11-21-mcp-apps/">MCP Apps</a> and <a href="https://developers.openai.com/apps-sdk">ChatGPT</a> from a single codebase.</strong>
</p>

## Quick Start

```bash
npx @mcp-apps-kit/create-app@latest my-app
cd my-app && npm run dev
```

## Features

- 🔌 **Single codebase** — Define tools and UI once, deploy to MCP Apps & ChatGPT
- 🎯 **Type-safe** — Full TypeScript inference for inputs, outputs, and UI access
- ⚛️ **React bindings** — First-class hooks, context, and component UIs
- 🔐 **OAuth 2.1** — JWT validation and JWKS discovery built-in
- 🧪 **Testing utilities** — Property-based testing, UI mocks, and LLM evaluation
- 📦 **Flexible deployment** — Express server, serverless, or stdio
- 🔀 **API versioning** — Expose multiple versions from a single app
- 🔄 **Workflow engine** — Compose multi-step workflows with parallel execution, branching, and retry policies

## Table of Contents

- [Packages](#packages)
- [Install](#install)
- [Usage](#usage)
- [Deployment](#deployment)
- [Platform Support](#platform-support)
- [Examples](#examples)
- [API](#api)
- [Contributing](#contributing)

---

## Background

MCP AppsKit is a TypeScript framework for building interactive applications with shared tool and UI definitions. [MCP Apps](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1865) enables servers to deliver interactive UIs to MCP hosts. [OpenAI Apps SDK](https://openai.com/index/introducing-apps-in-chatgpt/) powers apps inside ChatGPT. This framework abstracts both protocols, providing a server runtime, client SDK, React bindings, and a scaffolding CLI.

**Best for:** One codebase serving MCP Apps + ChatGPT, type-safe tools with Zod, tool-to-UI rendering patterns.

**May not fit:** Single protocol with low-level control needs, or custom transport/session behavior beyond the built-in server.

## Packages

| Package                          | Description                        |
| -------------------------------- | ---------------------------------- |
| `@mcp-apps-kit/core`             | Server-side framework              |
| `@mcp-apps-kit/ui`               | Client-side SDK (vanilla JS)       |
| `@mcp-apps-kit/ui-react`         | React bindings                     |
| `@mcp-apps-kit/ui-react-builder` | Build tool for React component UIs |
| `@mcp-apps-kit/create-app`       | CLI scaffolding tool               |
| `@mcp-apps-kit/testing`          | Testing utilities for MCP apps     |

## Compatibility

- **Node.js**: >= 18 (runtime packages), >= 20 (`@mcp-apps-kit/create-app` CLI and monorepo development)
- **React**: 18.x or 19.x (peer dependency)
- **Zod**: ^4.0.0 required

## Install

```bash
# Server framework
npm install @mcp-apps-kit/core zod

# React UI (includes @mcp-apps-kit/ui)
npm install @mcp-apps-kit/ui-react
```

See [Packages](#packages) for all available packages.

## Usage

### Server

```typescript
import { createApp, defineTool, defineUI } from "@mcp-apps-kit/core";
import { z } from "zod";

// Define a UI resource for the tool
const greetingUI = defineUI({
  name: "Greeting Widget",
  html: "./ui/dist/greeting.html",
  prefersBorder: true,
});

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
      ui: greetingUI,
      handler: async ({ name }) => ({
        message: `Hello, ${name}!`,
        timestamp: new Date().toISOString(),
      }),
    }),
  },
});

await app.start({ port: 3000 });
```

### React UI

Wrap your app with `AppsProvider` and use hooks to access tool results:

```tsx
// App.tsx
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
// GreetingWidget.tsx
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
    <div style={{ background: theme === "dark" ? "#1a1a1a" : "#fff" }}>
      <h2>{result.message}</h2>
      <p>Generated at: {new Date(result.timestamp).toLocaleString()}</p>
    </div>
  );
}
```

For complete examples including API versioning, React component UIs, and advanced patterns, see the [Examples](#examples) section.

### Workflow Engine

Compose multi-step workflows as MCP tools with parallel execution, conditional branching, and retry policies:

```typescript
import { createApp, workflow, toolStep, customStep } from "@mcp-apps-kit/core";
import { z } from "zod";

const orderWorkflow = workflow("process_order")
  .describe("Process a customer order end-to-end")
  .input({
    orderId: z.string(),
    customerId: z.string(),
  })
  .output({
    success: z.boolean(),
    receiptId: z.string().optional(),
  })
  // Sequential steps
  .step("validate", toolStep("validate_order"))
  .step("payment", toolStep("process_payment"), {
    retry: { maxAttempts: 3, delay: 1000, backoff: "exponential" },
  })
  // Parallel execution
  .parallel("notify", [toolStep("send_email"), toolStep("send_sms")])
  // Conditional branching
  .branch("shipping", {
    when: (ctx) => ctx.outputs.validate.isDigital,
    then: [customStep(async () => ({ delivered: true }))],
    else: [toolStep("create_shipment")],
  })
  .build();

const app = createApp({
  name: "order-service",
  version: "1.0.0",
  tools: {
    validate_order: defineTool({
      /* ... */
    }),
    process_payment: defineTool({
      /* ... */
    }),
    send_email: defineTool({
      /* ... */
    }),
    send_sms: defineTool({
      /* ... */
    }),
    create_shipment: defineTool({
      /* ... */
    }),
    // Register the workflow as a tool
    process_order: orderWorkflow,
  },
});
```

Features include:

- **Sequential steps** with `step()` for ordered execution
- **Parallel execution** with `parallel()` for concurrent operations
- **Conditional branching** with `branch()` for dynamic flow control
- **Retry policies** with exponential/linear backoff
- **Timeout handling** per step
- **External MCP calls** to other MCP servers with `externalStep()`
- **Production-ready** lifecycle management for servers and edge functions

## Deployment

### Express (default)

```typescript
await app.start({ port: 3000 });
```

### Custom Express

```typescript
import express from "express";
const expressApp = express();
expressApp.use("/mcp", app.handler());
expressApp.listen(3000);
```

### Stdio

```typescript
await app.start({ transport: "stdio" });
```

### Serverless

```typescript
export default {
  async fetch(request) {
    return app.handleRequest(request);
  },
};
```

## Platform Support

| Feature           | MCP Apps | ChatGPT Apps |
| ----------------- | -------- | ------------ |
| Tool Calling      | Yes      | Yes          |
| Structured Data   | Yes      | Yes          |
| OAuth 2.1 Auth    | Yes      | Yes          |
| Theme Support     | Yes      | Yes          |
| Display Modes     | Yes      | Yes          |
| Persisted State   | No       | Yes          |
| File Upload       | No       | Yes          |
| Tool Cancellation | Yes      | No           |
| Debug Logging     | Yes      | Yes          |

## Examples

Kanban demo repository (tool calling, React widgets, plugins, middleware, events):

```bash
git clone https://github.com/AndurilCode/kanban-mcp-example.git
cd kanban-mcp-example
npm install
npm run dev
```

Local examples:

- [examples/minimal](examples/minimal/) - minimal server with API versioning
- [examples/weather-app](examples/weather-app/) - weather tools with React UI (Open-Meteo API)
- [examples/restaurant-finder](examples/restaurant-finder/) - search functionality with UI

## API

📖 **[API Reference](https://andurilcode.github.io/mcp-apps-kit/)** - Full TypeDoc-generated documentation

Detailed package documentation:

- [packages/core/README.md](packages/core/README.md)
- [packages/ui/README.md](packages/ui/README.md)
- [packages/ui-react/README.md](packages/ui-react/README.md)
- [packages/ui-react-builder/README.md](packages/ui-react-builder/README.md)
- [packages/create-app/README.md](packages/create-app/README.md)
- [packages/testing/README.md](packages/testing/README.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines. Issues and pull requests are welcome.

## License

[MIT](LICENSE)
