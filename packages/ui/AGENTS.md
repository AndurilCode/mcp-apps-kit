# @mcp-apps-kit/ui

Client-side SDK for MCP applications (vanilla JavaScript). Auto-detects host platform (MCP Apps vs ChatGPT) and provides unified API.

## Quick Commands

```bash
pnpm -C packages/ui test        # Run tests
pnpm -C packages/ui typecheck   # Type check only
pnpm -C packages/ui lint        # Lint only
```

## Key Exports

- `createClient` - Main entry point, auto-detects platform
- `detectProtocol` - Manual platform detection
- `McpAdapter` / `OpenAIAdapter` / `MockAdapter` - Protocol adapters
- Theme/style utilities: `applyDocumentTheme`, `applyHostStyleVariables`

## Patterns

```typescript
const client = await createClient<typeof app.tools>();
const result = await client.callTool("greet", { name: "Alice" });
```

Subscribe to events with `onHostContextChange`, `onToolResult`.

## Dependencies

- @modelcontextprotocol/ext-apps

## Common Mistakes

- Forgetting to await `createClient()` (it's async)
- Not handling both MCP and OpenAI response formats
- Missing type parameter for typed tool calls
