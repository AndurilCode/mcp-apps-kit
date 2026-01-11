# MCP AppsKit

pnpm monorepo + Nx. Dual-protocol framework: MCP Apps + ChatGPT from single codebase.

## Before Finishing Any Task

```bash
pnpm build && pnpm test && pnpm lint && pnpm typecheck
```

All four must pass. No exceptions. Broken builds block the whole team.

## Quick Commands

```bash
pnpm -C packages/core test     # Test single package (faster iteration)
pnpm -C examples/minimal dev   # Run example with hot reload
pnpm release:version:patch     # Also: minor, major
```

## What Makes This Codebase Different

- **Zod 4** (not 3) - Breaking changes from v3, check migration if something looks wrong
- **Express 5** (not 4) - Async error handling works differently
- **Strict TS** - No `any`. Use `unknown` + narrowing. We've had production bugs from implicit any
- **60% test coverage** - CI fails below this. Tests mirror source in `tests/`

## Patterns to Follow

Use `defineTool` and `defineUI` (or `defineReactUI` for React components) - they provide type inference. See `examples/minimal/src/index.ts` for usage.

Middleware is Koa-style: always `await next()` or the chain breaks.

Exports only through `index.ts` - keeps the public API clean and refactoring safe.

## Common Mistakes

- Forgetting `export type` for type-only exports (causes runtime imports of types)
- Creating circular deps between packages (Nx will catch this but it's annoying)
- Committing without running the full check suite (CI will fail, wastes time)

## Project Map

```text
packages/core            → Server framework (createApp, adapters, middleware)
packages/ui              → Client SDK (vanilla JS, protocol detection)
packages/ui-react        → React hooks (useAppsClient, useToolResult, useHostContext...)
packages/ui-react-builder → React UI builder (defineReactUI, vite plugin)
packages/testing         → Test utilities (mocks, matchers for vitest/jest)
packages/create-app      → CLI scaffolder
examples/                → Working examples to test against
```

Each package README has the detailed API. Don't duplicate here.

## External Docs

- [MCP Spec](https://modelcontextprotocol.io/specification/2025-11-25) - Protocol details, message formats
- [OpenAI Apps SDK](https://developers.openai.com/apps-sdk) - ChatGPT integration specifics

---

## Learnings

<!-- Add specific lessons learned during development. Format: what happened → what to do instead -->

<!-- Example:
- Forgot to rebuild ui package before testing ui-react → Always `pnpm build` from root, not package
- Type error was hidden because of `any` in test mock → Use proper typed mocks from vitest
-->
