# Implementation Plan: Unified MCP Apps Builder SDK

**Branch**: `001-unified-mcp-sdk` | **Date**: 2025-12-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-unified-mcp-sdk/spec.md`

## Summary

Build a TypeScript SDK that enables developers to create interactive MCP applications for both Claude Desktop and ChatGPT from a single codebase. The SDK provides a unified `createApp()` entry point with Zod-based type-safe tool definitions, automatic protocol metadata generation, and platform-agnostic UI client libraries with React bindings.

## Technical Context

**Language/Version**: TypeScript >= 5.0.0 (strict mode)
**Primary Dependencies**: Zod (schema validation), @modelcontextprotocol/sdk (MCP server), Express (HTTP server)
**Storage**: N/A (stateless SDK; state management delegated to host platforms)
**Testing**: Vitest (unit + integration)
**Target Platform**: Node.js >= 18.0.0 (server), Modern browsers ES2020+ (client)
**Project Type**: NX monorepo with 4 publishable packages
**Performance Goals**: < 5ms handler overhead, < 50KB gzipped client bundle
**Constraints**: Must work identically on Claude Desktop and ChatGPT without conditional code
**Scale/Scope**: 4 packages, ~33 functional requirements, targeting external developer adoption

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Developer Experience First | ✅ PASS | `createApp()` single entry point; Zod schemas for type inference; actionable error messages required |
| II. Protocol Abstraction | ✅ PASS | Automatic metadata generation; UI code works identically on both platforms; transport differences handled by framework |
| III. Test-First Development | ✅ PASS | Vitest configured; 80% coverage gate; TDD workflow enforced |
| IV. Type Safety & Validation | ✅ PASS | TypeScript strict mode; Zod runtime validation; zero `any` policy; ESLint + Prettier required |
| V. Monorepo Integrity | ✅ PASS | NX monorepo; 4 independently publishable packages; workspace protocols for dependencies |

**Quality Gates Compliance**:
- Type Check: `tsc --noEmit` in CI
- Lint: ESLint zero warnings
- Format: Prettier check
- Unit Tests: 80% coverage minimum
- Integration Tests: Cross-platform (MCP Apps + ChatGPT)
- Build: All packages must build
- Bundle Size: Core package < 50KB gzipped (warning gate)

## Project Structure

### Documentation (this feature)

```text
specs/001-unified-mcp-sdk/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/
├── core/                           # @apps-builder/core - Server-side framework
│   ├── src/
│   │   ├── index.ts                # Public exports
│   │   ├── createApp.ts            # Main entry point
│   │   ├── server.ts               # MCP server wrapper
│   │   ├── types/
│   │   │   ├── tools.ts            # Tool definition types (ToolDef, ToolDefs)
│   │   │   ├── ui.ts               # UI resource types (UIDef, CSPConfig)
│   │   │   └── config.ts           # AppConfig, AuthConfig types
│   │   ├── adapters/
│   │   │   ├── mcp.ts              # MCP Apps protocol adapter
│   │   │   └── openai.ts           # ChatGPT Apps protocol adapter
│   │   ├── server/
│   │   │   ├── express.ts          # Express server integration
│   │   │   └── serverless.ts       # Serverless handler
│   │   └── utils/
│   │       ├── schema.ts           # zodToJsonSchema converter
│   │       └── metadata.ts         # Protocol metadata mapping
│   ├── package.json
│   └── tsconfig.json
│
├── ui/                             # @apps-builder/ui - Client-side SDK (vanilla JS)
│   ├── src/
│   │   ├── index.ts                # Public exports
│   │   ├── client.ts               # Unified AppsClient
│   │   ├── adapters/
│   │   │   ├── mcp.ts              # MCP Apps UI adapter
│   │   │   ├── openai.ts           # ChatGPT Apps UI adapter
│   │   │   └── mock.ts             # Mock adapter for development
│   │   ├── detection.ts            # Protocol auto-detection
│   │   └── types.ts                # HostContext, AppsClient interface
│   ├── package.json
│   └── tsconfig.json
│
├── ui-react/                       # @apps-builder/ui-react - React bindings
│   ├── src/
│   │   ├── index.ts                # Public exports
│   │   ├── context.tsx             # AppsContext, AppsProvider
│   │   ├── hooks.ts                # useAppsClient, useToolResult, useHostContext, etc.
│   │   └── components.tsx          # Utility components
│   ├── package.json
│   └── tsconfig.json
│
└── create-app/                     # @apps-builder/create-app - CLI scaffolding
    ├── src/
    │   ├── index.ts                # CLI entry point
    │   ├── cli.ts                  # Command parsing
    │   └── templates/              # Project templates
    │       ├── react/              # React template
    │       └── vanilla/            # Vanilla JS template
    ├── package.json
    └── tsconfig.json

examples/
├── restaurant-finder/              # Full example app
├── data-dashboard/                 # Dashboard example
└── minimal/                        # Minimal example

nx.json                             # NX configuration
pnpm-workspace.yaml                 # PNPM workspace config
tsconfig.base.json                  # Base TypeScript config
vitest.config.ts                    # Vitest configuration
eslint.config.js                    # ESLint flat config
prettier.config.js                  # Prettier configuration
```

**Structure Decision**: NX monorepo with 4 packages under `packages/`. This follows the Constitution's Monorepo Integrity principle and matches the existing docs/DESIGN.md structure. Each package is independently publishable under the `@apps-builder` npm scope.

## Complexity Tracking

> No constitution violations. The 4-package structure is justified by clear separation of concerns:
> - `core`: Server-side only (Node.js)
> - `ui`: Client-side vanilla JS (browser)
> - `ui-react`: React-specific bindings (React peer dependency)
> - `create-app`: CLI tool (Node.js binary)
