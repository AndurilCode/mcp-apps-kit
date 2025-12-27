# MCP AppsKit Development Guidelines

A TypeScript framework for building interactive MCP applications that work with both **MCP Apps (Claude Desktop)** and **ChatGPT (OpenAI Apps SDK)** from a single codebase.

## Project Structure

This is a **pnpm monorepo** with **Nx** for orchestration:

```text
packages/
├── core/           # @mcp-apps-kit/core - Server framework (createApp, adapters, middleware, plugins, events)
├── ui/             # @mcp-apps-kit/ui - Client SDK (vanilla JS, protocol detection, adapters)
├── ui-react/       # @mcp-apps-kit/ui-react - React bindings (context, hooks)
└── create-app/     # @mcp-apps-kit/create-app - CLI scaffolder

examples/
├── minimal/        # Simple hello-world example
└── restaurant-finder/

# Full-featured kanban example: https://github.com/AndurilCode/kanban-mcp-example
```

Each package has its own README with detailed API documentation.

## Commands

```bash
# Root commands
pnpm install && pnpm build && pnpm test && pnpm lint && pnpm typecheck

# Package-specific
pnpm -C packages/core test        # Test single package
pnpm -C examples/minimal dev      # Run minimal example with hot reload

# Release
pnpm release:version:patch|minor|major
```

## Key Dependencies

| Package                             | Purpose                       |
| ----------------------------------- | ----------------------------- |
| `@modelcontextprotocol/sdk` ^1.25.1 | MCP protocol                  |
| `express` ^5.1.0                    | HTTP server                   |
| `zod` ^4.0.0                        | Schema validation             |
| `typescript` ^5.9.3                 | Strict mode enabled           |
| `vitest` ^4.0.16                    | Testing (80% coverage target) |

## Code Conventions

- **Strict TypeScript**: No `any` types, use `unknown` and narrow
- **No unused variables**: Remove or prefix with `_`
- **Public API**: Exports only in `index.ts`
- **Tests**: Mirror source in `tests/` (unit/, integration/, contract/)

## Tool Definition Pattern

Always use `defineTool` for type inference:

```typescript
import { defineTool } from "@mcp-apps-kit/core";
import { z } from "zod";

const tool = defineTool({
  title: "My Tool",
  description: "Tool description",
  input: z.object({ name: z.string() }),
  output: z.object({ message: z.string() }),
  ui: "widget-id", // Optional: links to UI resource
  visibility: "both", // "model", "app", or "both"
  handler: async (input) => ({ message: `Hello, ${input.name}!` }),
});
```

## Middleware Pattern

Koa-style with `async/await`:

```typescript
app.use(async (context, next) => {
  console.log("Before:", context.toolName);
  await next(); // Must call next()
  console.log("After:", context.toolName);
});
```

## Error Handling

```typescript
import { AppError, ErrorCode } from "@mcp-apps-kit/core";
throw new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "Invalid input" });
```

## Plugin System

```typescript
const plugin: Plugin = {
  name: "my-plugin",
  onInit: (app) => {},
  onStart: (app) => {},
  onShutdown: (app) => {},
  beforeToolCall: (context) => {},
  afterToolCall: (context, result) => {},
  onToolError: (context, error) => {},
};
```

## Event System

```typescript
app.events.on("app:init", () => {});
app.events.on("tool:call", ({ toolName, input }) => {});
app.events.once("app:start", ({ port }) => {});
```

## UI React Hooks

| Hook             | Purpose                             |
| ---------------- | ----------------------------------- |
| `useAppsClient`  | Client instance for tool calls      |
| `useToolResult`  | Current tool result data            |
| `useToolInput`   | Tool input parameters               |
| `useHostContext` | Host info (theme, viewport, locale) |
| `useWidgetState` | Persisted state across reloads      |
| `useDisplayMode` | Fullscreen/panel mode control       |
| `useFileUpload`  | File upload functionality           |
| `useModal`       | Modal dialog management             |

Other hooks: `useSafeAreaInsets`, `useHostStyleVariables`, `useDocumentTheme`, `useOnToolCancelled`, `useOnTeardown`, `useIntrinsicHeight`, `useView`

## Deployment Options

```typescript
// Express server (default)
await app.start({ port: 3000 });

// Custom Express middleware
expressApp.use("/mcp", app.handler());

// Stdio for CLI tools
await app.getServer().connect(new StdioTransport());

// Serverless
export default {
  async fetch(request) {
    return app.handleRequest(request);
  },
};
```

## Protocol Abstraction

The framework auto-generates platform-specific metadata:

```typescript
// Your definition
tools: { my_tool: { ui: "widget", visibility: "both" } }

// MCP Apps: _meta.ui.resourceUri + visibility
// ChatGPT: _meta["openai/outputTemplate"] + ["openai/visibility"]
```

## HTTP Endpoints

| Endpoint  | Purpose                                       |
| --------- | --------------------------------------------- |
| `/health` | Health check                                  |
| `/mcp`    | MCP protocol (configurable via `serverRoute`) |

## Compatibility

- **Node.js**: >= 20
- **React**: 18.x or 19.x (peer dependency)
- **Zod**: ^4.0.0 required

## Important Notes

- Run full checks before PR: `pnpm build && pnpm test && pnpm lint && pnpm typecheck`
- Keep packages independent - avoid circular dependencies
- Use `export type` for type-only exports
- Maintain 80% minimum test coverage
- Never commit secrets - use environment variables

## External Documentation

- [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP Apps Extension](https://blog.modelcontextprotocol.io/posts/2025-11-21-mcp-apps/)
- [OpenAI Apps SDK](https://developers.openai.com/apps-sdk)
