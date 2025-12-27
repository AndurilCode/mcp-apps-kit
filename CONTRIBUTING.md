# Contributing

Thanks for contributing! This repo is a PNPM + Nx monorepo.

## Prerequisites

- Node.js `>= 20`
- PNPM (this repo pins `pnpm@10.x` via `packageManager`)

## Setup

```bash
pnpm install
```

## Common commands

From the repo root:

```bash
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

## Examples

Run the minimal example (server + UI watcher):

```bash
pnpm -C examples/minimal dev
```

For a comprehensive demo, see the separate [kanban-mcp-example](https://github.com/AndurilCode/kanban-mcp-example) repository.

## Code style

- Formatting: `pnpm format:write`
- Keep public APIs backward compatible when possible; use semver for breaking changes.
