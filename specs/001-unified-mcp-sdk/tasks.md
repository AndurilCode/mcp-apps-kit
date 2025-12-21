# Tasks: Unified MCP Apps Builder SDK

**Input**: Design documents from `/specs/001-unified-mcp-sdk/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED per Constitution Principle III (Test-First Development, 80% coverage minimum)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md structure:
- **Core package**: `packages/core/src/`
- **UI package**: `packages/ui/src/`
- **React package**: `packages/ui-react/src/`
- **CLI package**: `packages/create-app/src/`
- **Tests**: `packages/*/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: NX monorepo initialization and basic structure

- [ ] T001 Initialize NX monorepo with pnpm workspace at repository root
- [ ] T002 Create base TypeScript configuration in `tsconfig.base.json` (strict mode)
- [ ] T003 [P] Configure NX workspace in `nx.json` with build/test/lint caching
- [ ] T004 [P] Configure pnpm workspace in `pnpm-workspace.yaml`
- [ ] T005 [P] Configure ESLint in `eslint.config.js` (flat config, zero warnings policy)
- [ ] T006 [P] Configure Prettier in `prettier.config.js`
- [ ] T007 [P] Configure Vitest in `vitest.config.ts` (80% coverage threshold)
- [ ] T008 Create `@apps-builder/core` package scaffold in `packages/core/`
- [ ] T009 [P] Create `@apps-builder/ui` package scaffold in `packages/ui/`
- [ ] T010 [P] Create `@apps-builder/ui-react` package scaffold in `packages/ui-react/`
- [ ] T011 [P] Create `@apps-builder/create-app` package scaffold in `packages/create-app/`
- [ ] T012 Install shared dependencies: zod, @modelcontextprotocol/sdk, zod-to-json-schema

**Checkpoint**: NX monorepo structure ready, all packages scaffolded with tsconfig

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T013 Define base type exports in `packages/core/src/types/tools.ts` (ToolDef, ToolDefs, Visibility)
- [ ] T014 [P] Define UI types in `packages/core/src/types/ui.ts` (UIDef, UIDefs, CSPConfig)
- [ ] T015 [P] Define config types in `packages/core/src/types/config.ts` (AppConfig, AuthConfig, CORSConfig)
- [ ] T016 [P] Define client types in `packages/ui/src/types.ts` (HostContext, AppsClient, ToolResult)
- [ ] T017 Implement zodToJsonSchema utility in `packages/core/src/utils/schema.ts`
- [ ] T018 [P] Implement AppError class in `packages/core/src/utils/errors.ts`
- [ ] T019 Define ProtocolAdapter interface in `packages/ui/src/adapters/types.ts`
- [ ] T020 Create package index exports in `packages/core/src/index.ts`
- [ ] T021 [P] Create package index exports in `packages/ui/src/index.ts`

**Checkpoint**: Foundation ready - all base types defined, user story implementation can now begin

---

## Phase 3: User Story 1 - Define Tools with Type-Safe Schemas (Priority: P1) 🎯 MVP

**Goal**: Developers can define MCP tools using Zod schemas with full TypeScript type inference

**Independent Test**: Create a minimal app with one tool and verify TypeScript correctly infers input/output types

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T022 [P] [US1] Contract test for createApp basic structure in `packages/core/tests/contract/createApp.test.ts`
- [ ] T023 [P] [US1] Unit test for type inference utilities in `packages/core/tests/unit/types.test.ts`
- [ ] T024 [P] [US1] Unit test for zodToJsonSchema in `packages/core/tests/unit/schema.test.ts`

### Implementation for User Story 1

- [ ] T025 [P] [US1] Implement InferToolInputs<T> type utility in `packages/core/src/types/tools.ts`
- [ ] T026 [P] [US1] Implement InferToolOutputs<T> type utility in `packages/core/src/types/tools.ts`
- [ ] T027 [US1] Implement createApp() function signature in `packages/core/src/createApp.ts`
- [ ] T028 [US1] Implement tool registration with Zod schema validation in `packages/core/src/createApp.ts`
- [ ] T029 [US1] Implement defineTool() helper function in `packages/core/src/createApp.ts`
- [ ] T030 [US1] Implement defineUI() helper function in `packages/core/src/createApp.ts`
- [ ] T031 [US1] Add runtime Zod validation for tool inputs in `packages/core/src/createApp.ts`
- [ ] T032 [US1] Add user-friendly Zod validation error formatting in `packages/core/src/utils/errors.ts`

**Checkpoint**: Tool definitions with full type inference working - verify with TypeScript compiler

---

## Phase 4: User Story 2 - Start Server with Single Entry Point (Priority: P1) 🎯 MVP

**Goal**: Developers can start an MCP server with `app.start()` using minimal boilerplate

**Independent Test**: Create an app, call `app.start({ port: 3000 })`, verify server responds to MCP protocol requests

### Tests for User Story 2

- [ ] T033 [P] [US2] Integration test for app.start() HTTP in `packages/core/tests/integration/server.test.ts`
- [ ] T034 [P] [US2] Unit test for Express handler in `packages/core/tests/unit/express.test.ts`
- [ ] T035 [P] [US2] Unit test for stdio transport in `packages/core/tests/unit/stdio.test.ts`

### Implementation for User Story 2

- [ ] T036 [P] [US2] Implement MCP server wrapper in `packages/core/src/server.ts`
- [ ] T037 [US2] Implement app.start() with HTTP transport in `packages/core/src/server/express.ts`
- [ ] T038 [US2] Implement app.start() with stdio transport in `packages/core/src/server/stdio.ts`
- [ ] T039 [US2] Implement app.getServer() method in `packages/core/src/createApp.ts`
- [ ] T040 [US2] Wire createApp() to return full App instance in `packages/core/src/createApp.ts`
- [ ] T041 [US2] Add CORS configuration support in `packages/core/src/server/express.ts`
- [ ] T042 [US2] Add error handler middleware for tool errors in `packages/core/src/server/express.ts`

**Checkpoint**: `createApp().start()` works - minimal MCP server running on HTTP and stdio

---

## Phase 5: User Story 3 - Platform-Agnostic UI Client (Priority: P2)

**Goal**: UI code uses unified client SDK that auto-detects host platform (Claude Desktop vs ChatGPT)

**Independent Test**: Load same UI code in MCP Apps host (simulated) and ChatGPT host (simulated), verify identical behavior

### Tests for User Story 3

- [ ] T043 [P] [US3] Unit test for protocol detection in `packages/ui/tests/unit/detection.test.ts`
- [ ] T044 [P] [US3] Unit test for MCP adapter in `packages/ui/tests/unit/mcp-adapter.test.ts`
- [ ] T045 [P] [US3] Unit test for OpenAI adapter in `packages/ui/tests/unit/openai-adapter.test.ts`
- [ ] T046 [P] [US3] Unit test for Mock adapter in `packages/ui/tests/unit/mock-adapter.test.ts`
- [ ] T047 [P] [US3] Contract test for createClient in `packages/ui/tests/contract/client.test.ts`

### Implementation for User Story 3

- [ ] T048 [P] [US3] Implement protocol detection in `packages/ui/src/detection.ts`
- [ ] T049 [US3] Implement MCP Apps adapter in `packages/ui/src/adapters/mcp.ts`
- [ ] T050 [US3] Implement ChatGPT Apps adapter in `packages/ui/src/adapters/openai.ts`
- [ ] T051 [US3] Implement Mock adapter for development in `packages/ui/src/adapters/mock.ts`
- [ ] T052 [US3] Implement unified AppsClient class in `packages/ui/src/client.ts`
- [ ] T053 [US3] Implement createClient() factory function in `packages/ui/src/client.ts`
- [ ] T054 [US3] Implement callTool() with type-safe generics in `packages/ui/src/client.ts`
- [ ] T055 [US3] Implement sendMessage() and sendFollowUpMessage() in `packages/ui/src/client.ts`
- [ ] T056 [US3] Implement openLink() and requestDisplayMode() in `packages/ui/src/client.ts`
- [ ] T057 [US3] Implement getState()/setState() with silent no-op on MCP Apps in `packages/ui/src/client.ts`
- [ ] T058 [US3] Implement event subscriptions (onToolResult, onHostContextChange, etc.) in `packages/ui/src/client.ts`
- [ ] T059 [US3] Implement hostContext property accessor in `packages/ui/src/client.ts`

**Checkpoint**: UI client SDK working - createClient() auto-detects platform and provides unified API

---

## Phase 6: User Story 4 - React Hooks for UI Development (Priority: P2)

**Goal**: React developers can use hooks like useAppsClient(), useToolResult(), useHostContext()

**Independent Test**: Render React component using hooks, verify re-renders on tool results and context changes

### Tests for User Story 4

- [ ] T060 [P] [US4] Unit test for AppsProvider in `packages/ui-react/tests/unit/context.test.tsx`
- [ ] T061 [P] [US4] Unit test for useAppsClient hook in `packages/ui-react/tests/unit/hooks.test.tsx`
- [ ] T062 [P] [US4] Unit test for useToolResult hook in `packages/ui-react/tests/unit/hooks.test.tsx`
- [ ] T063 [P] [US4] Unit test for useHostContext hook in `packages/ui-react/tests/unit/hooks.test.tsx`
- [ ] T064 [P] [US4] Unit test for useWidgetState hook in `packages/ui-react/tests/unit/hooks.test.tsx`

### Implementation for User Story 4

- [ ] T065 [US4] Implement AppsContext and AppsProvider in `packages/ui-react/src/context.tsx`
- [ ] T066 [US4] Implement useAppsClient<T>() hook in `packages/ui-react/src/hooks.ts`
- [ ] T067 [US4] Implement useToolResult<T>() hook in `packages/ui-react/src/hooks.ts`
- [ ] T068 [US4] Implement useToolInput() hook in `packages/ui-react/src/hooks.ts`
- [ ] T069 [US4] Implement useHostContext() hook in `packages/ui-react/src/hooks.ts`
- [ ] T070 [US4] Implement useWidgetState<S>() hook (session-scoped ChatGPT, no-op MCP) in `packages/ui-react/src/hooks.ts`
- [ ] T071 [US4] Implement useHostStyleVariables() hook in `packages/ui-react/src/hooks.ts`
- [ ] T072 [US4] Implement useDocumentTheme() hook in `packages/ui-react/src/hooks.ts`
- [ ] T073 [US4] Create package index exports in `packages/ui-react/src/index.ts`

**Checkpoint**: React bindings working - hooks provide reactive access to client, results, and context

---

## Phase 7: User Story 5 - Protocol Metadata Abstraction (Priority: P2)

**Goal**: Tool and UI definitions auto-generate correct protocol-specific metadata for both platforms

**Independent Test**: Define tool with `ui: "widget"`, verify server generates correct metadata for MCP Apps and ChatGPT

### Tests for User Story 5

- [ ] T074 [P] [US5] Unit test for MCP metadata generation in `packages/core/tests/unit/mcp-adapter.test.ts`
- [ ] T075 [P] [US5] Unit test for OpenAI metadata generation in `packages/core/tests/unit/openai-adapter.test.ts`
- [ ] T076 [P] [US5] Unit test for visibility mapping in `packages/core/tests/unit/metadata.test.ts`

### Implementation for User Story 5

- [ ] T077 [P] [US5] Implement metadata mapping utilities in `packages/core/src/utils/metadata.ts`
- [ ] T078 [US5] Implement MCP Apps protocol adapter in `packages/core/src/adapters/mcp.ts`
- [ ] T079 [US5] Implement ChatGPT Apps protocol adapter in `packages/core/src/adapters/openai.ts`
- [ ] T080 [US5] Implement visibility mapping (model/app/both → protocol-specific) in `packages/core/src/utils/metadata.ts`
- [ ] T081 [US5] Implement tool metadata generation with UI bindings in `packages/core/src/adapters/mcp.ts`
- [ ] T082 [US5] Implement tool metadata generation with UI bindings in `packages/core/src/adapters/openai.ts`
- [ ] T083 [US5] Wire protocol adapters to createApp() in `packages/core/src/createApp.ts`

**Checkpoint**: Protocol abstraction complete - metadata auto-generated for both platforms

---

## Phase 8: User Story 6 - UI Resource Registration with CSP (Priority: P3)

**Goal**: Developers can define UI resources with CSP configuration for external API access

**Independent Test**: Define UI resource with `csp.connectDomains`, verify correct CSP metadata for both protocols

### Tests for User Story 6

- [ ] T084 [P] [US6] Unit test for CSP metadata generation in `packages/core/tests/unit/csp.test.ts`
- [ ] T085 [P] [US6] Unit test for HTML resource loading in `packages/core/tests/unit/resources.test.ts`

### Implementation for User Story 6

- [ ] T086 [US6] Implement CSP mapping for MCP Apps in `packages/core/src/adapters/mcp.ts`
- [ ] T087 [US6] Implement CSP mapping for ChatGPT Apps in `packages/core/src/adapters/openai.ts`
- [ ] T088 [US6] Implement UI resource registration with file path resolution in `packages/core/src/createApp.ts`
- [ ] T089 [US6] Implement inline HTML string support for UI resources in `packages/core/src/createApp.ts`
- [ ] T090 [US6] Implement prefersBorder and domain metadata in `packages/core/src/adapters/mcp.ts`
- [ ] T091 [US6] Implement prefersBorder and domain metadata in `packages/core/src/adapters/openai.ts`

**Checkpoint**: CSP and UI resources working - widgets can safely connect to external APIs

---

## Phase 9: User Story 7 - Flexible Deployment Options (Priority: P3)

**Goal**: Developers can deploy using Express middleware, raw MCP server, or serverless handlers

**Independent Test**: Use app.handler() with custom Express app, verify MCP requests handled correctly

### Tests for User Story 7

- [ ] T092 [P] [US7] Integration test for app.handler() in `packages/core/tests/integration/middleware.test.ts`
- [ ] T093 [P] [US7] Integration test for app.handleRequest() in `packages/core/tests/integration/serverless.test.ts`

### Implementation for User Story 7

- [ ] T094 [US7] Implement app.handler() Express middleware in `packages/core/src/server/express.ts`
- [ ] T095 [US7] Implement app.handleRequest() serverless handler in `packages/core/src/server/serverless.ts`
- [ ] T096 [US7] Ensure stateless request handling for serverless in `packages/core/src/server/serverless.ts`
- [ ] T097 [US7] Add deployment documentation examples in `docs/DEPLOYMENT.md`

**Checkpoint**: All deployment options working - Express, middleware, serverless

---

## Phase 10: User Story 8 - CLI Project Scaffolding (Priority: P4)

**Goal**: Developers can run CLI command to scaffold new project with correct structure

**Independent Test**: Run `npx @apps-builder/create-app my-app`, verify working project generated

### Tests for User Story 8

- [ ] T098 [P] [US8] Unit test for CLI argument parsing in `packages/create-app/tests/unit/cli.test.ts`
- [ ] T099 [P] [US8] Integration test for project generation in `packages/create-app/tests/integration/scaffold.test.ts`

### Implementation for User Story 8

- [ ] T100 [US8] Implement CLI entry point with argument parsing in `packages/create-app/src/cli.ts`
- [ ] T101 [US8] Create vanilla JS template in `packages/create-app/src/templates/vanilla/`
- [ ] T102 [US8] Create React template in `packages/create-app/src/templates/react/`
- [ ] T103 [US8] Implement interactive template selection in `packages/create-app/src/cli.ts`
- [ ] T104 [US8] Implement project scaffolding logic in `packages/create-app/src/index.ts`
- [ ] T105 [US8] Generate TypeScript configuration for scaffolded projects in `packages/create-app/src/templates/`
- [ ] T106 [US8] Add package.json bin entry for `create-app` command in `packages/create-app/package.json`

**Checkpoint**: CLI working - `npx @apps-builder/create-app` scaffolds working projects

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T107 [P] Create minimal example in `examples/minimal/`
- [ ] T108 [P] Create restaurant-finder example in `examples/restaurant-finder/`
- [ ] T109 [P] Update API documentation in `docs/API-REFERENCE.md`
- [ ] T110 [P] Create migration guide in `docs/MIGRATION.md`
- [ ] T111 Run bundle size validation (< 50KB gzipped for ui package)
- [ ] T112 Run full test suite with coverage report (80% minimum)
- [ ] T113 Run ESLint and Prettier validation (zero warnings)
- [ ] T114 Validate quickstart.md instructions work end-to-end
- [ ] T115 Security review: validate CSP handling and error exposure
- [ ] T116 Performance validation: verify < 5ms handler overhead

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-10)**: All depend on Foundational phase completion
  - US1 + US2 are MVP (P1) - implement first
  - US3, US4, US5 are P2 - implement after MVP
  - US6, US7 are P3 - implement after P2
  - US8 is P4 - implement last
- **Polish (Phase 11)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Foundational only - No dependencies on other stories
- **User Story 2 (P1)**: Foundational + US1 (needs createApp basics)
- **User Story 3 (P2)**: Foundational only - Independent of server stories
- **User Story 4 (P2)**: Foundational + US3 (needs UI client)
- **User Story 5 (P2)**: Foundational + US1 + US2 (needs createApp and server)
- **User Story 6 (P3)**: US5 (extends metadata generation)
- **User Story 7 (P3)**: US2 (extends server capabilities)
- **User Story 8 (P4)**: All packages must be publishable (US1-US6)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Types before implementation
- Core logic before integrations
- Unit tests run continuously during implementation

### Parallel Opportunities

**Setup Phase (can run in parallel)**:
- T003, T004, T005, T006, T007 (config files)
- T009, T010, T011 (package scaffolds)

**Foundational Phase (can run in parallel)**:
- T014, T015, T016 (type definitions)
- T017, T018 (utilities)
- T020, T021 (exports)

**User Stories (can run in parallel after dependencies met)**:
- US3 + US5 can run in parallel after US1+US2
- US4 depends on US3 (sequential)
- US6 + US7 can run in parallel after dependencies

---

## Parallel Example: User Story 1 Tests

```bash
# Launch all tests for User Story 1 together:
Task: "Contract test for createApp in packages/core/tests/contract/createApp.test.ts"
Task: "Unit test for type inference in packages/core/tests/unit/types.test.ts"
Task: "Unit test for zodToJsonSchema in packages/core/tests/unit/schema.test.ts"

# Then launch type utilities in parallel:
Task: "Implement InferToolInputs<T> in packages/core/src/types/tools.ts"
Task: "Implement InferToolOutputs<T> in packages/core/src/types/tools.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (type-safe tool definitions)
4. Complete Phase 4: User Story 2 (server with app.start())
5. **STOP and VALIDATE**: Test MVP independently - create app, define tool, start server
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add US1 + US2 → Test independently → Deploy/Demo (MVP!)
3. Add US3 → Test independently → UI client working
4. Add US4 → Test independently → React hooks working
5. Add US5 → Test independently → Protocol abstraction complete
6. Add US6 + US7 → Test independently → Full server capabilities
7. Add US8 → Test independently → CLI scaffolding working
8. Polish phase → Production ready

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 + 2 (core package - MVP)
   - Developer B: User Story 3 (ui package - can start after types ready)
3. After MVP:
   - Developer A: User Story 5 + 6 + 7 (server extensions)
   - Developer B: User Story 4 (React bindings)
4. Finally: User Story 8 (CLI)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- TDD required: verify tests fail before implementing (Constitution Principle III)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- 80% test coverage required (Constitution quality gate)
- Zero ESLint warnings required (Constitution quality gate)
