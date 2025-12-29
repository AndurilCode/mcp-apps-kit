# @mcp-apps-kit/ui-react-builder

[![npm](https://img.shields.io/npm/v/%40mcp-apps-kit%2Fui-react-builder)](https://www.npmjs.com/package/@mcp-apps-kit/ui-react-builder) [![node](https://img.shields.io/node/v/%40mcp-apps-kit%2Fui-react-builder)](https://www.npmjs.com/package/@mcp-apps-kit/ui-react-builder) [![license](https://img.shields.io/npm/l/%40mcp-apps-kit%2Fui-react-builder)](https://www.npmjs.com/package/@mcp-apps-kit/ui-react-builder)

Build tool for React-based MCP application UIs.

`@mcp-apps-kit/ui-react-builder` allows you to define UI resources using React components instead of pre-built HTML files. The framework handles bundling React, ReactDOM, and `@mcp-apps-kit/ui-react` into self-contained HTML that works with both MCP Apps (Claude Desktop) and ChatGPT.

## Table of Contents

- [Background](#background)
- [Features](#features)
- [Compatibility](#compatibility)
- [Install](#install)
- [Usage](#usage)
- [Vite Plugin](#vite-plugin)
- [API](#api)
- [Examples](#examples)
- [Contributing](#contributing)
- [License](#license)

## Background

Building interactive UI widgets for MCP applications traditionally requires manually bundling React components into self-contained HTML files. This package automates that process, letting you define UIs with React components directly in your tool definitions.

## Features

- `defineReactUI()` helper for type-safe React component definitions
- Vite plugin for automatic discovery and building of React UIs
- esbuild-powered bundling to self-contained HTML
- Auto-generated HTML paths from component names (kebab-case)
- Global CSS injection support
- Full compatibility with `defineTool()` from `@mcp-apps-kit/core`

## Compatibility

- Node.js: `>= 18`
- Peer dependencies:
  - `@mcp-apps-kit/core` `^0.2.0`
  - `@mcp-apps-kit/ui-react` `^0.2.0`
  - `react` and `react-dom` `^18 || ^19`
  - `vite` `^5 || ^6 || ^7` (optional, for Vite plugin)

## Install

```bash
npm install @mcp-apps-kit/ui-react-builder
```

## Usage

### Quick start

Define your React component:

```tsx
// src/ui/GreetingWidget.tsx
import { useToolResult, useHostContext } from "@mcp-apps-kit/ui-react";

export function GreetingWidget() {
  const result = useToolResult();
  const { theme } = useHostContext();

  return (
    <div data-theme={theme}>
      <h1>{result?.greet?.message}</h1>
    </div>
  );
}
```

Use `defineReactUI` in your tool definition:

```ts
// src/index.ts
import { createApp, defineTool } from "@mcp-apps-kit/core";
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { GreetingWidget } from "./ui/GreetingWidget";
import { z } from "zod";

const app = createApp({
  name: "my-app",
  version: "1.0.0",
  tools: {
    greet: defineTool({
      description: "Greet someone",
      input: z.object({ name: z.string() }),
      output: z.object({ message: z.string() }),
      ui: defineReactUI({
        component: GreetingWidget,
        name: "Greeting Widget",
        prefersBorder: true,
      }),
      handler: async ({ name }) => ({
        message: `Hello, ${name}!`,
      }),
    }),
  },
});
```

## Vite Plugin

The Vite plugin automatically discovers `defineReactUI` calls and builds them into self-contained HTML files.

### Configuration

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { mcpReactUI } from "@mcp-apps-kit/ui-react-builder/vite";

export default defineConfig({
  plugins: [
    mcpReactUI({
      // Server entry point to scan for defineReactUI calls
      serverEntry: "./src/index.ts",
      // Output directory for built HTML files
      outDir: "./src/ui/dist",
      // Optional: Global CSS to include in all UIs
      globalCss: "./src/ui/styles.css",
    }),
  ],
});
```

### How it works

1. The plugin scans your `serverEntry` file for `defineReactUI` calls
2. It resolves component imports to their source files
3. Each component is bundled with React, ReactDOM, and `@mcp-apps-kit/ui-react`
4. Self-contained HTML files are written to `outDir`

### Supported patterns

The plugin discovers `defineReactUI` calls using static analysis. For reliable detection:

- **Import components directly** from their source files:
  ```ts
  import { MyWidget } from "./ui/MyWidget"; // ✓ Works
  import { MyWidget } from "./ui"; // ✗ Barrel imports not supported
  ```
- **Use string literals** for the `name` property:
  ```ts
  name: "My Widget"; // ✓ Works
  name: `My ${type}`; // ✗ Template literals not supported
  ```
- **Reference components by identifier**:
  ```ts
  component: MyWidget; // ✓ Works
  component: widgets.MyWidget; // ✗ Property access not supported
  ```

If you need patterns not supported by auto-discovery, use `defineUI({ html: "..." })` with manual Vite bundling.

### Build commands

```json
{
  "scripts": {
    "dev": "concurrently \"pnpm dev:server\" \"pnpm dev:ui\"",
    "dev:server": "tsx watch src/index.ts",
    "dev:ui": "vite build --watch",
    "build": "pnpm build:ui && tsc",
    "build:ui": "vite build"
  }
}
```

## API

### Definition Helpers

| Export          | Description                                    |
| --------------- | ---------------------------------------------- |
| `defineReactUI` | Define a UI using a React component            |
| `isReactUIDef`  | Type guard to check if a value is a ReactUIDef |

### Types

| Type           | Description                             |
| -------------- | --------------------------------------- |
| `ReactUIInput` | Input type for `defineReactUI()`        |
| `ReactUIDef`   | Output type (extends `UIDef` from core) |
| `BuildOptions` | Options for the build process           |
| `BuildResult`  | Result of building React UIs            |

### Build Functions

| Export          | Description                      |
| --------------- | -------------------------------- |
| `buildReactUIs` | Build multiple React UIs to HTML |
| `buildReactUI`  | Build a single React UI to HTML  |

### Transform Utilities

| Export                     | Description                            |
| -------------------------- | -------------------------------------- |
| `transformToCoreDefs`      | Convert ReactUIDefs to standard UIDefs |
| `transformSingleToCoreDef` | Convert a single ReactUIDef to UIDef   |
| `extractReactUIs`          | Separate React UIs from standard UIs   |
| `buildAndTransform`        | Build and transform in one step        |

### HTML Utilities

| Export               | Description                            |
| -------------------- | -------------------------------------- |
| `generateHTML`       | Generate HTML document from bundled JS |
| `generateEntryPoint` | Generate React entry point code        |

### Vite Plugin

```ts
import { mcpReactUI } from "@mcp-apps-kit/ui-react-builder/vite";
```

| Option        | Type      | Default        | Description                     |
| ------------- | --------- | -------------- | ------------------------------- |
| `serverEntry` | `string`  | (required)     | Server entry point to scan      |
| `outDir`      | `string`  | `"./dist/ui"`  | Output directory for HTML files |
| `minify`      | `boolean` | `true` in prod | Minify output JavaScript        |
| `globalCss`   | `string`  | -              | Path to global CSS file         |

## Examples

- `../../examples/minimal` - Simple hello world with React UI

## Contributing

See `../../CONTRIBUTING.md` for development setup and guidelines. Issues and pull requests are welcome.

## License

MIT
