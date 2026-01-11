# @mcp-apps-kit/testing

Comprehensive testing library for MCP applications. Supports unit, integration, behavior, property, and LLM evaluation testing.

## Quick Commands

```bash
pnpm -C packages/testing test        # Run tests
pnpm -C packages/testing typecheck   # Type check only
pnpm -C packages/testing lint        # Lint only
```

## Key Exports

- `createTestEnvironment` - Full test setup with server and client
- `startTestServer` / `createTestClient` - Individual components
- `expectToolResult` - Fluent assertions for tool results
- `createMCPEval` / `describeEval` - LLM-based evaluation
- Framework adapters: `@mcp-apps-kit/testing/vitest`, `@mcp-apps-kit/testing/jest`

## Patterns

```typescript
const env = await createTestEnvironment({ app });
const result = await env.client.callTool("greet", { name: "Alice" });
expectToolResult(result).toMatchObject({ message: "Hello, Alice!" });
await env.cleanup();
```

## Dependencies

- @modelcontextprotocol/sdk
- Zod 4
- Optional: vitest, jest, fast-check, openai, @anthropic-ai/sdk

## Common Mistakes

- Forgetting `await env.cleanup()` (leaves server running)
- Not setting up vitest/jest matchers in setup file
- Missing optional peer deps for LLM eval features

---

## Learnings

<!-- MANDATORY: Document failures here to prevent repeated mistakes -->
<!-- Format: what went wrong → what to do instead -->

<!-- Example:
- Tests hung indefinitely → Server wasn't cleaned up from previous run, use port: 0 for random port
- Matcher not found error → Import setupVitestMatchers in setup file before tests run
-->
