# Product Definition

## Target users
- Developers building MCP tools with optional UI widgets.
- Teams shipping the same app to both MCP Apps and ChatGPT Apps SDK.

## Core user needs
- Define tools with strong typing (Zod schemas).
- Attach UI resources to tools (colocated UI pattern).
- Run server via HTTP (Express) or stdio transport.
- Verify behavior with a shared testing library.

## UX principles for examples
- Minimal setup, clear README, runnable commands.
- Small, real API integration (or mock if key missing).
- Deterministic tests (no network calls in CI).

