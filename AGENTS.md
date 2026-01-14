## @Context (Mission)

Maintain a strict TypeScript, ESM-first SDK monorepo where public APIs are exported intentionally and repo-wide build/test/lint/typecheck stay deterministic via Nx.

## @Stack (Technical DNA)

- **Language/Runtime**: TypeScript 5.9 (strict), Node.js (repo dev `>=20`, package runtime `>=18`), ESM (`"type": "module"`)
- **Monorepo**: pnpm workspace (`pnpm@10.19.0`), Nx task runner
- **Build**: tsup (CJS+ESM+`d.ts`), esbuild (via tsup), Vite (examples + React test plugin)
- **Validation**: Zod 4 (used by runtime packages)
- **Testing**: Vitest (root defaults node; `ui-react` uses jsdom + Vite React plugin)
- **Lint/Format**: ESLint v9 flat config + type-aware `@typescript-eslint`; Prettier v3
- **Git hooks**: Husky + lint-staged (Prettier on staged files)

## @Knowledge Graph (Context Links)

- Monorepo commands + pinned toolchain: ./package.json
- Nx target defaults/caching/inputs: ./nx.json
- TypeScript strict baseline + workspace path aliases: ./tsconfig.base.json
- Lint rules (notably: `no-explicit-any`, `no-floating-promises`): ./eslint.config.js
- Formatting rules: ./prettier.config.js
- Root Vitest defaults (node env, coverage thresholds, excludes): ./vitest.config.ts
- `ui-react` Vitest overrides (jsdom + Vite React plugin): ./packages/ui-react/vitest.config.ts
- TypeDoc entrypoints (what is considered public API): ./typedoc.json
- Package-specific modification rules (read before editing that package):
  - core: ./packages/core/AGENTS.md
  - ui: ./packages/ui/AGENTS.md
  - ui-react: ./packages/ui-react/AGENTS.md
  - ui-react-builder: ./packages/ui-react-builder/AGENTS.md
  - create-app: ./packages/create-app/AGENTS.md
  - testing: ./packages/testing/AGENTS.md

## @Map (File Structure)

- `packages/*/src/`: publishable library source. Put public exports behind the package entrypoint (`src/index.ts`).
- `packages/*/tests/`: package tests. Keep new tests here (not at repo root).
- `examples/*/`: consumer apps to reproduce/validate behavior end-to-end. Keep product code out of examples.
- `docs/`: shared docs and TypeDoc inputs. `docs/api/` is generated output (do not hand-edit).

## @Workflow (The "How-To") - Always run all of them

- Build all: `pnpm build`
- Test all: `pnpm test`
- Lint all: `pnpm lint`
- Typecheck all: `pnpm typecheck`
- Format check / write: `pnpm format` / `pnpm format:write`
- Scope to one package: `pnpm -C packages/<name> test` (or `pnpm nx run <project>:<target>`)

## @Rules (Dos & Don'ts)

- **NEVER** add runtime dependencies to the repo root; add them to the owning package and keep peer deps accurate.
- **NEVER** introduce `any` outside tests; use `unknown` + narrowing/validation.
- **NEVER** add/modify public API via deep imports; route all public exports through `packages/*/src/index.ts`.
- **NEVER** use CommonJS (`require`, `module.exports`); keep ESM imports/exports everywhere.
- **NEVER** break middleware chains in `core`; always `await next()` (see `packages/core/AGENTS.md`).

## @Memory (Self-Correction)

If you encounter repeated errors (e.g., failed commands, hallucinated imports) or discover a new best practice, YOU MUST UPDATE THIS FILE. Add the specific failure case and resolution to @Rules to prevent future errors.
