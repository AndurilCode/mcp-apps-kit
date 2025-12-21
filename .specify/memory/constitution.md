<!--
  Sync Impact Report
  ==================
  Version change: N/A → 1.0.0 (initial ratification)

  Modified principles: N/A (initial version)

  Added sections:
  - Core Principles (5 principles)
    - I. Developer Experience First
    - II. Protocol Abstraction
    - III. Test-First Development (NON-NEGOTIABLE)
    - IV. Type Safety & Validation
    - V. Monorepo Integrity
  - Technology Stack (new section)
  - Quality Gates (new section)
  - Governance

  Removed sections: N/A (initial version)

  Templates requiring updates:
  - .specify/templates/plan-template.md: ✅ compatible (Constitution Check section exists)
  - .specify/templates/spec-template.md: ✅ compatible (Requirements section aligns with principles)
  - .specify/templates/tasks-template.md: ✅ compatible (Test phases and parallel structure preserved)

  Follow-up TODOs: None
-->

# Apps Builder SDK Constitution

## Core Principles

### I. Developer Experience First

Every API decision MUST prioritize developer ergonomics over internal implementation convenience.

- The `createApp()` entry point MUST be the single, intuitive starting point for all MCP app development
- Tool definitions MUST use Zod schemas that provide full TypeScript inference without manual type annotations
- Error messages MUST be actionable and include guidance for resolution
- Documentation MUST include working code examples for every public API

**Rationale**: The SDK exists to shield developers from MCP/OpenAI protocol complexity. If a developer needs to understand the underlying protocols to use the SDK effectively, we have failed.

### II. Protocol Abstraction

The SDK MUST completely abstract MCP Apps and OpenAI Apps SDK protocol differences from consuming developers.

- Platform-specific metadata generation (e.g., `_meta.ui` vs `_meta["openai/..."]`) MUST be fully automated
- UI code written against the SDK MUST work identically on Claude Desktop and ChatGPT without conditional logic
- Transport differences (stdio, HTTP, serverless) MUST be handled by the framework, not user code
- Breaking protocol changes in upstream SDKs MUST be absorbed by the framework without breaking user code

**Rationale**: "Write once, run anywhere" is the core value proposition. Any protocol leak into user code defeats the purpose.

### III. Test-First Development (NON-NEGOTIABLE)

All feature development MUST follow TDD discipline with measurable coverage requirements.

- Tests MUST be written before implementation code
- Red-Green-Refactor cycle MUST be strictly enforced
- Minimum 80% code coverage for all packages
- Contract tests MUST exist for every public API surface
- Integration tests MUST cover cross-platform behavior (both Claude Desktop and ChatGPT scenarios)

**Rationale**: An SDK used by external developers MUST be rock-solid. Bugs in the SDK multiply across all consuming applications.

### IV. Type Safety & Validation

Runtime behavior MUST match compile-time type guarantees.

- All tool inputs and outputs MUST be validated with Zod schemas at runtime
- TypeScript strict mode MUST be enabled across all packages
- No `any` types except in explicitly typed escape hatches with documented justification
- Generated types (e.g., `AppTools`) MUST provide full autocomplete for tool names, inputs, and outputs
- ESLint and Prettier MUST enforce consistent code style with zero tolerance for warnings in CI

**Rationale**: Type safety is a key differentiator. Developers choose TypeScript SDKs for confidence; we MUST deliver on that promise.

### V. Monorepo Integrity

The NX monorepo structure MUST maintain clear package boundaries while enabling efficient development.

- Each package (`@apps-builder/core`, `@apps-builder/ui`, `@apps-builder/ui-react`, `@apps-builder/create-app`) MUST be independently publishable
- Internal dependencies MUST use workspace protocols, never version ranges
- Shared code MUST live in explicitly designated internal packages, not duplicated
- The published npm package MUST be a single cohesive bundle with all necessary dependencies properly declared
- Build cache MUST be leveraged for all commands (build, test, lint)

**Rationale**: Monorepo benefits (unified tooling, atomic commits) MUST NOT come at the cost of package quality or publish complexity.

## Technology Stack

The following technology choices are binding for this project:

| Concern | Choice | Version Constraint |
|---------|--------|-------------------|
| Runtime | Node.js | >= 18.0.0 |
| Language | TypeScript | >= 5.0.0 (strict mode) |
| Schema Validation | Zod | Latest stable |
| MCP Integration | @modelcontextprotocol/sdk | Latest stable |
| Build System | NX | Latest stable |
| Package Manager | pnpm | >= 8.0.0 |
| Test Framework | Vitest | Latest stable |
| Linting | ESLint + Prettier | Latest stable |

**Dependency Update Policy**: Dependencies MUST be updated to latest stable versions at least monthly. Security updates MUST be applied within 48 hours of disclosure.

## Quality Gates

All code contributions MUST pass these gates before merge:

| Gate | Requirement | Enforcement |
|------|-------------|-------------|
| Type Check | `tsc --noEmit` passes | CI blocking |
| Lint | Zero ESLint errors or warnings | CI blocking |
| Format | Prettier check passes | CI blocking |
| Unit Tests | All pass, >= 80% coverage | CI blocking |
| Integration Tests | All cross-platform tests pass | CI blocking |
| Build | All packages build successfully | CI blocking |
| Bundle Size | Core package < 50KB gzipped | CI warning |

## Governance

This constitution supersedes all other development practices for the Apps Builder SDK project.

**Amendment Process**:
1. Propose amendment via pull request to `.specify/memory/constitution.md`
2. Document rationale and impact assessment
3. All active maintainers MUST approve
4. Version bump follows semantic versioning (see below)
5. Dependent templates MUST be updated in the same PR

**Version Policy**:
- MAJOR: Principle removal, redefinition, or governance change that invalidates prior compliant code
- MINOR: New principle addition or significant clarification that expands requirements
- PATCH: Typo fixes, wording improvements, non-semantic clarifications

**Compliance Review**: Every pull request MUST include a self-assessment against relevant principles. Reviewers MUST verify compliance before approval.

**Version**: 1.0.0 | **Ratified**: 2025-12-21 | **Last Amended**: 2025-12-21
