# @mcp-apps-kit/core

Server-side framework for MCP applications. Handles tool definitions, UI resources, adapters, middleware, and Express server setup.

## Quick Commands

```bash
pnpm -C packages/core test        # Run tests
pnpm -C packages/core typecheck   # Type check only
pnpm -C packages/core lint        # Lint only
```

## Key Exports

- `createApp` - Main entry point for creating an MCP app
- `defineTool` - Type-safe tool definition helper
- `defineUI` - UI resource definition helper
- `createPlugin` - Plugin system for extending apps

## Patterns

Use `defineTool` and `defineUI` for type inference instead of inline objects.

Middleware is Koa-style: always `await next()` or the chain breaks.

All exports go through `src/index.ts` - no barrel files in subdirectories.

## Dependencies

- Express 5 (async error handling differs from v4)
- Zod 4 (breaking changes from v3)
- @modelcontextprotocol/sdk

## Common Mistakes

- Forgetting to `await next()` in middleware
- Using Zod 3 APIs that changed in v4 (check migration guide)
- Adding exports outside `index.ts`
