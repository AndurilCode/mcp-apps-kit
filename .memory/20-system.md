# System Architecture

## Monorepo layout
- `packages/core`: server framework (createApp, adapters, middleware, plugins, events)
- `packages/ui`: client SDK (protocol detection, adapters)
- `packages/ui-react`: React bindings (context, hooks)
- `packages/ui-react-builder`: UI build tooling
- `packages/create-app`: CLI scaffolder for new apps/examples
- `packages/testing`: shared helpers for tests
- `examples/*`: runnable demos

## Key runtime paths
- HTTP server: Express handler mounted (default `/mcp`), plus `/health`
- Stdio: `@modelcontextprotocol/sdk` transport

