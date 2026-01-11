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

Exports are centralized through `src/index.ts`, which re-exports from barrel files (`index.ts`) in subdirectories: `adapters/`, `debug/`, `events/`, `middleware/`, `plugins/`, `server/`, and `server/oauth/`. Subdirectory barrel files are local re-exports only - all public API goes through the root `src/index.ts`.

## Dependencies

- Express 5 (async error handling differs from v4)
- Zod 4 (breaking changes from v3)
- @modelcontextprotocol/sdk

## Common Mistakes

- Forgetting to `await next()` in middleware
- Using Zod 3 APIs that changed in v4 (check migration guide)
- Adding exports outside `index.ts`

---

## Learnings

<!-- MANDATORY: Document failures here to prevent repeated mistakes -->
<!-- Format: what went wrong → what to do instead -->

<!-- Example:
- Type error in handler because input wasn't validated → Always use Zod schema, never trust raw input
- Middleware chain broke silently → Add logging middleware first to debug chain issues
-->
