# mcp-apps-kit Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-12-21

## Active Technologies

- TypeScript >= 5.0.0 (strict mode) + Zod (schema validation), @modelcontextprotocol/sdk (MCP server), Express (HTTP server) (001-unified-mcp-sdk)

## Project Structure

This is a pnpm monorepo with Nx for orchestration:

```text
packages/
├── core/           # @mcp-apps-kit/core - Server-side framework
├── ui/             # @mcp-apps-kit/ui - Client SDK (vanilla JS)
├── ui-react/       # @mcp-apps-kit/ui-react - React bindings
└── create-app/     # @mcp-apps-kit/create-app - CLI scaffolder

examples/
├── minimal/        # Simple hello-world example
├── kanban/         # Full-featured kanban board
└── restaurant-finder/

docs/               # Design docs, API reference, protocol comparison
```

Each package has its own `src/` and `tests/` directories.

## Commands

```bash
pnpm install        # Install dependencies
pnpm build          # Build all packages
pnpm test           # Run all tests
pnpm lint           # Lint all packages
pnpm typecheck      # Type-check all packages
pnpm format:write   # Format code with Prettier
```

Run commands for a specific package:

```bash
pnpm -C packages/core test
pnpm -C examples/kanban dev
```

## Code Style

TypeScript >= 5.0.0 (strict mode): Follow standard conventions

## Recent Changes

- 001-unified-mcp-sdk: Added TypeScript >= 5.0.0 (strict mode) + Zod (schema validation), @modelcontextprotocol/sdk (MCP server), Express (HTTP server)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
