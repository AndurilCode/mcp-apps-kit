# @mcp-apps-kit/codegen

[![npm](https://img.shields.io/npm/v/%40mcp-apps-kit%2Fcodegen)](https://www.npmjs.com/package/@mcp-apps-kit/codegen) [![node](https://img.shields.io/node/v/%40mcp-apps-kit%2Fcodegen)](https://www.npmjs.com/package/@mcp-apps-kit/codegen) [![license](https://img.shields.io/npm/l/%40mcp-apps-kit%2Fcodegen)](https://www.npmjs.com/package/@mcp-apps-kit/codegen)

Code generation for file-based MCP application development.

Discovers tool, workflow, and UI definitions from conventional file locations and generates a typed manifest for use with `createFileBasedApp`. Includes a Vite plugin for seamless integration and CLI tools for standalone usage.

## Table of Contents

- [Background](#background)
- [Features](#features)
- [Compatibility](#compatibility)
- [Install](#install)
- [Usage](#usage)
- [Configuration](#configuration)
- [File Structure](#file-structure)
- [CLI Commands](#cli-commands)
- [API Versioning](#api-versioning)
- [Middleware & Event Handlers](#middleware--event-handlers)
- [API](#api)
- [Examples](#examples)
- [Contributing](#contributing)
- [License](#license)

## Background

Building MCP applications typically requires manually wiring together tool definitions, UI resources, and workflows. This package automates that process by scanning conventional directories and generating a typed manifest that can be imported directly into your app. The result is a file-based development experience where adding a new tool is as simple as creating a new file.

## Features

- **Vite Plugin**: Integrate codegen into your Vite build pipeline with HMR support
- **CLI Tools**: Generate manifests and start servers without Vite
- **File-Based Discovery**: Scan `tools/`, `workflows/`, `ui/`, and more for definitions
- **Typed Manifests**: Generate TypeScript with full type inference
- **API Versioning**: Support multiple API versions from a single codebase
- **Hot Reload**: Watch mode with automatic regeneration and tool hot-swapping
- **Middleware Support**: File-based middleware with configurable ordering
- **Event Handlers**: File-based event handler discovery

## Compatibility

- Node.js: `>= 20`
- Vite: `^5.0.0 || ^6.0.0 || ^7.0.0` (optional peer dependency)
- @mcp-apps-kit/core: `>= 0.5.0` (peer dependency)

## Install

```bash
npm install @mcp-apps-kit/codegen
```

## Usage

### With Vite (Recommended)

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { mcpAppsPlugin } from "@mcp-apps-kit/codegen";

export default defineConfig({
  plugins: [
    mcpAppsPlugin({
      configPath: "./mcp.config.ts",
      outDir: "__generated__",
      watch: true,
    }),
  ],
});
```

```ts
// mcp.config.ts
import { defineConfig } from "@mcp-apps-kit/codegen";

export default defineConfig({
  name: "my-app",
  version: "1.0.0",
  config: {
    protocol: "mcp",
    cors: { origin: true },
  },
});
```

### Standalone CLI

Generate the manifest without Vite:

```bash
npx @mcp-apps-kit/codegen
# or
mcp-codegen
```

Generate and start the server:

```bash
mcp-serve --port 3000 --watch
```

### Using the Generated Manifest

```ts
// server.ts
import { createFileBasedApp } from "@mcp-apps-kit/core";
import config from "./mcp.config";
import { tools, workflows } from "./__generated__/app-manifest";

const app = createFileBasedApp({
  ...config,
  tools,
});

await app.start({ port: 3000 });
```

## Configuration

Create `mcp.config.ts` in your project root:

```ts
import { defineConfig } from "@mcp-apps-kit/codegen";

export default defineConfig({
  // Required
  name: "my-app",
  version: "1.0.0",

  // Optional: Override default directories
  directories: {
    tools: "tools", // Default: "tools"
    workflows: "workflows", // Default: "workflows"
    ui: "ui", // Default: "ui"
    uiWidgets: "ui/widgets", // Default: undefined (disabled)
    middleware: "middleware", // Default: undefined (disabled)
    handlers: "handlers", // Default: undefined (disabled)
  },

  // Optional: Global config passed to createFileBasedApp
  config: {
    protocol: "mcp",
    cors: { origin: true },
    debug: { level: "info" },
  },

  // Optional: Plugins
  plugins: [],

  // Optional: App icon
  icon: "https://example.com/icon.png",
});
```

## File Structure

Place your definitions in conventional directories:

```
my-app/
├── mcp.config.ts
├── tools/
│   ├── greet.ts              # → tool: greet
│   ├── get-weather.ts        # → tool: get_weather
│   └── users/
│       └── create.ts         # → tool: users_create
├── workflows/
│   └── onboarding.ts         # → workflow: onboarding
├── ui/
│   ├── widgets/              # Convention-based UI widgets
│   │   └── get-weather.tsx   # Auto-binds to get_weather tool
│   └── dashboard.html        # Static UI resource
├── middleware/
│   └── logging.ts            # → middleware
├── handlers/
│   └── app-lifecycle.ts      # → event handler
└── __generated__/
    └── app-manifest.ts       # Generated manifest
```

Files prefixed with `_` (e.g., `_shared.ts`) are excluded from discovery.

### Tool Files

Use the fluent `tool` builder API:

```ts
// tools/get-current-weather.ts
import { tool } from "@mcp-apps-kit/core";
import { z } from "zod";

export default tool
  .describe("Get current weather conditions for a location")
  .input({
    location: z.string().describe("City name or address"),
  })
  .output({
    temperature: z.number(),
    humidity: z.number(),
  })
  .readOnly()
  .handle(async ({ location }) => {
    return { temperature: 22, humidity: 65 };
  });
// Note: .build() is optional - codegen auto-builds
```

Or use `defineTool` for the object syntax:

```ts
// tools/greet.ts
import { defineTool } from "@mcp-apps-kit/core";
import { z } from "zod";

export default defineTool({
  description: "Greet a user",
  input: z.object({ name: z.string() }),
  output: z.object({ message: z.string() }),
  handler: async ({ name }) => ({
    message: `Hello, ${name}!`,
  }),
});
```

### UI Widgets (Convention-Based)

When `uiWidgets` is configured, widget files are automatically bound to tools by matching filenames. Export a `ui` constant with widget metadata:

```tsx
// ui/widgets/get-current-weather.tsx
import { useToolResult, useHostContext } from "@mcp-apps-kit/ui-react";
import type { WidgetMetadata } from "@mcp-apps-kit/core";

// Widget metadata - html path is auto-inferred from filename
export const ui: WidgetMetadata = {
  name: "Current Weather Widget",
  description: "Displays weather conditions",
  prefersBorder: true,
};

export default function CurrentWeatherWidget() {
  const result = useToolResult();
  const context = useHostContext();
  // ... render widget
}
```

### Colocated UI (Tool Files)

Tools can also export a `ui` named export for colocated UI:

```ts
// tools/search.ts
import { defineTool, defineUI } from "@mcp-apps-kit/core";
import { z } from "zod";

export const ui = defineUI({
  name: "Search Results",
  html: "./dist/search-widget.html",
});

export default defineTool({
  description: "Search items",
  input: z.object({ query: z.string() }),
  handler: async ({ query }) => ({ results: [] }),
  ui,
});
```

## CLI Commands

### mcp-codegen

Generate the manifest from `mcp.config.ts`:

```bash
mcp-codegen
```

### mcp-serve

Generate manifest and start the MCP server:

```bash
mcp-serve [options]

Options:
  -p, --port <number>   Port to listen on (default: 3000 or PORT env)
  -w, --watch           Enable hot reload on file changes
  -c, --config <path>   Path to config file (default: ./mcp.config.ts)
```

## API Versioning

Support multiple API versions with versioned configuration:

```ts
// mcp.config.ts
import { defineConfig } from "@mcp-apps-kit/codegen";

export default defineConfig({
  name: "my-api",
  config: {
    cors: { origin: true },
  },
  versions: {
    v1: {
      version: "1.0.0",
      // Uses default: versions/v1/tools, versions/v1/workflows, etc.
    },
    v2: {
      version: "2.0.0",
      directories: {
        root: "versions/v2",
      },
      config: {
        debug: { level: "debug" },
      },
    },
  },
});
```

Directory structure for versioned apps:

```
my-api/
├── mcp.config.ts
├── versions/
│   ├── v1/
│   │   ├── tools/
│   │   └── workflows/
│   └── v2/
│       ├── tools/
│       └── workflows/
└── __generated__/
    ├── v1-manifest.ts
    ├── v2-manifest.ts
    └── versions-manifest.ts
```

Each version is exposed at its dedicated route:

- v1: `http://localhost:3000/v1/mcp`
- v2: `http://localhost:3000/v2/mcp`

## Middleware & Event Handlers

### File-Based Middleware

Use `defineMiddleware` for simple middleware:

```ts
// middleware/logging.ts
import { defineMiddleware } from "@mcp-apps-kit/codegen";

export default defineMiddleware({
  before: async (context) => {
    context.state.set("startTime", Date.now());
    console.log(`Tool called: ${context.toolName}`);
  },
  after: async (context) => {
    const startTime = context.state.get("startTime") as number;
    const duration = Date.now() - startTime;
    console.log(`Tool completed: ${context.toolName} (${duration}ms)`);
  },
});
```

Use `defineOrderedMiddleware` when you need explicit ordering:

```ts
// middleware/auth.ts
import { defineOrderedMiddleware } from "@mcp-apps-kit/codegen";

export default defineOrderedMiddleware({
  order: 10, // Lower numbers run first (default: 100)
  before: async (context) => {
    if (!context.metadata.subject) {
      throw new Error("Authentication required");
    }
  },
});
```

### File-Based Event Handlers

```ts
// handlers/app-lifecycle.ts
import { defineHandler, Events } from "@mcp-apps-kit/codegen";

export default defineHandler({
  event: Events.APP_START,
  handler: async (payload) => {
    console.log(`Server started on port ${payload.port}`);
  },
});
```

```ts
// handlers/tool-metrics.ts
import { defineHandler, Events } from "@mcp-apps-kit/codegen";

export default defineHandler({
  event: Events.TOOL_SUCCESS,
  handler: async (payload) => {
    analytics.track("tool_success", {
      tool: payload.toolName,
      duration: payload.duration,
    });
  },
});
```

Available events: `APP_INIT`, `APP_START`, `APP_SHUTDOWN`, `TOOL_CALLED`, `TOOL_SUCCESS`, `TOOL_ERROR`, `ERROR`

## API

### Vite Plugin

- `mcpAppsPlugin(options?)` - Vite plugin for manifest generation
  - `options.configPath` - Path to config file (default: `"./mcp.config.ts"`)
  - `options.outDir` - Output directory (default: `"__generated__"`)
  - `options.watch` - Enable file watching (default: `true`)

### Configuration

- `defineConfig(config)` - Type-safe configuration helper

### Manifest Generation

- `generateManifest(options)` - Generate manifest for single-version config
- `generateVersionedManifests(config, projectRoot, outDir, logger)` - Generate manifests for versioned config
- `runCodegen(options?)` - Run the full codegen pipeline

### App Creation

- `defineApp(options)` - Create and optionally auto-start a file-based app

### Middleware Helpers

- `defineMiddleware(definition)` - Define middleware with before/after hooks (re-exported from core)
- `defineOrderedMiddleware(definition)` - Define middleware with explicit `order` property for sorting
- `defineHandler(definition)` - Define an event handler with `{ event, handler }` object
- `Events` - Event name constants (`APP_START`, `TOOL_CALLED`, etc.)

### Naming Utilities

- `pathToIdentifier(path)` - Convert file path to snake_case identifier
- `shouldSkipFile(filename)` - Check if file should be excluded
- `findNameCollisions(files)` - Detect duplicate identifiers

### Key Types

- `FileBasedConfig` - Single-version configuration
- `VersionedFileBasedConfig` - Multi-version configuration
- `DirectoriesConfig` - Directory path overrides
- `McpAppsPluginOptions` - Vite plugin options
- `DiscoveredFile` - Discovered file metadata
- `ManifestResult` - Generation result with code and diagnostics

## Examples

- `../../examples/weather-app` - Full example demonstrating file-based development with tools, workflows, middleware, handlers, and UI widgets

## Contributing

See `../../CONTRIBUTING.md` for development setup and guidelines. Issues and pull requests are welcome.

## License

MIT
