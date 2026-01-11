# @mcp-apps-kit/ui-react

React bindings for MCP applications. Provides hooks and context for building UIs.

## Quick Commands

```bash
pnpm -C packages/ui-react test        # Run tests
pnpm -C packages/ui-react typecheck   # Type check only
pnpm -C packages/ui-react lint        # Lint only
```

## Key Exports

- `AppsProvider` - Context provider (wrap your app)
- `useAppsClient` - Get client instance
- `useToolResult` - Get current tool result
- `useHostContext` - Get host context (theme, locale, etc.)
- `useDocumentTheme` / `useHostStyleVariables` - Auto-apply theming

## Patterns

```tsx
<AppsProvider>
  <App />
</AppsProvider>

function App() {
  const result = useToolResult<ToolOutputs>();
  useDocumentTheme("light", "dark");
  // ...
}
```

## Dependencies

- @mcp-apps-kit/ui (re-exports many types)
- React 18 or 19

## Common Mistakes

- Forgetting `AppsProvider` wrapper
- Not typing `useToolResult<T>()` generic
- Using hooks outside provider context

---

## Learnings

<!-- MANDATORY: Document failures here to prevent repeated mistakes -->
<!-- Format: what went wrong → what to do instead -->

<!-- Example:
- Hook returned undefined unexpectedly → Ensure component is wrapped in AppsProvider
- Re-renders caused infinite loop → Check useEffect dependencies, avoid object literals in deps
-->
