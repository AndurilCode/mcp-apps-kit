## @Context (Mission)

Build a **single TypeScript codebase** that runs interactive apps on **MCP Apps and ChatGPT** via a shared tool + UI model. Optimize for **strict type-safety**, **clean public APIs**, and **backwards-compatible changes** across packages.

## @Stack (Technical DNA)

- **Monorepo**: pnpm workspaces + Nx (`nx run-many`)
- **Language**: TypeScript (strict, `noImplicitAny`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`)
- **Runtime**: Node.js >= 20 (repo development + CI; don’t change without updating engines/tooling)
- **Schema/validation**: Zod **v4** (not v3)
- **Server**: Express **v5** (not v4) via `@mcp-apps-kit/core`
- **Testing**: Vitest; repo-level coverage thresholds enforced (50% lines/functions/branches/statements)
- **Lint/format**: ESLint (flat config) + Prettier; pre-commit runs `lint-staged`
- **Build**: tsup per package; TypeDoc for docs (`pnpm docs`)

## @Knowledge Graph (Context Links)

- [Quickstart patterns (defineTool/defineUI, middleware, OAuth)]: ./docs/quickstart.md
- [Core server framework API + exports contract]: ./packages/core/README.md
- [Client SDK (protocol detection/adapters) API]: ./packages/ui/README.md
- [React hooks/provider API]: ./packages/ui-react/README.md
- [React UI builder + Vite plugin API]: ./packages/ui-react-builder/README.md
- [Testing utilities + eval/property patterns]: ./packages/testing/README.md
- [CLI scaffolder templates + constraints]: ./packages/create-app/README.md
- [Package-specific agent notes (where present)]: ./packages/*/AGENTS.md
- [Tooling scripts + pinned versions]: ./package.json
- [ESLint rules (strictness + exceptions in tests)]: ./eslint.config.js
- [TypeScript base config + path aliases]: ./tsconfig.base.json
- [Vitest coverage thresholds + include/exclude]: ./vitest.config.ts
- [Contribution setup (pnpm/node requirements)]: ./CONTRIBUTING.md

## @Map (File Structure)

- `packages/core/`: **server framework** (createApp, adapters, middleware, plugins, OAuth). Public API is re-exported from `src/index.ts`.
- `packages/ui/`: **client SDK** (protocol detection, adapters, theming helpers). Must support both MCP Apps + ChatGPT host shapes.
- `packages/ui-react/`: **React bindings** (provider + hooks). Hooks must be usable without host-specific branching in app code.
- `packages/ui-react-builder/`: **build tooling** to bundle React components into self-contained HTML; includes optional Vite plugin.
- `packages/testing/`: **test utilities** (test server/client, matchers, property/behavior/LLM eval helpers). Clean up servers in tests.
- `packages/create-app/`: **CLI scaffolder** (templates + integration tests). Generated projects intentionally avoid pnpm workspace coupling.
- `examples/`: reference integrations; use for manual smoke checks (don’t copy docs into core packages).

## @Workflow (How To Work Here)

- Build: `pnpm build`
- Test: `pnpm test` (or faster: `pnpm -C packages/<pkg> test`)
- Lint: `pnpm lint`
- Format: `pnpm format` (check) / `pnpm format:write` (fix)
- Type-check: `pnpm typecheck`
- Run example: `pnpm -C examples/minimal dev`

## @Rules (Dos & Don’ts)

- **ALWAYS** run `pnpm build && pnpm test && pnpm lint && pnpm typecheck` before finishing any task (repo policy; broken builds block everyone).
- **NEVER** use Zod v3 or Express v4 assumptions; this repo is **Zod 4** + **Express 5**.
- **NEVER** introduce `any` in production code; use `unknown` + narrowing (ESLint enforces `@typescript-eslint/no-explicit-any`).
- **NEVER** bypass the export contract: public APIs must flow through each package’s `src/index.ts` (avoid deep imports across packages).
- **ALWAYS** `await next()` in Koa-style middleware; failing to do so silently breaks the middleware chain.
- **ALWAYS** add/adjust tests under the owning package’s `tests/` when changing behavior; coverage thresholds are enforced at the repo level.
- **AVOID** cross-package circular dependencies; prefer moving shared types/utilities “down” (or into a dedicated package) instead of importing “up”.

## @Memory (Self-Correction Loop)

If you encounter repeated errors (for example, failing commands, misused scripts, incorrect imports, or configuration pitfalls) or discover a new best practice while working in this repository, you MUST update this file. Add the specific failure case and its correct resolution to **@Rules** or **@Workflow** so future agents do not repeat the same mistake.
