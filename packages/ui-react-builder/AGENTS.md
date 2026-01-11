# @mcp-apps-kit/ui-react-builder

Build tool for React-based MCP application UIs. Bundles React components into self-contained HTML.

## Quick Commands

```bash
pnpm -C packages/ui-react-builder test        # Run tests
pnpm -C packages/ui-react-builder typecheck   # Type check only
pnpm -C packages/ui-react-builder lint        # Lint only
```

## Key Exports

- `defineReactUI` - Define UI with React component
- `buildReactUIs` / `buildReactUI` - Build to HTML
- `buildAndTransform` - Build and convert to core UIDefs in one step
- Vite plugin available via `@mcp-apps-kit/ui-react-builder/vite`

## Patterns

```typescript
const widgetUI = defineReactUI({
  component: MyWidget,
  name: "My Widget",
  prefersBorder: true,
});

const uis = await buildAndTransform({ "my-widget": widgetUI });
```

## Dependencies

- esbuild (bundling)
- @typescript-eslint/typescript-estree (AST parsing)
- Peer deps: @mcp-apps-kit/core, @mcp-apps-kit/ui-react, react, react-dom, vite (optional)

## Common Mistakes

- Forgetting to rebuild after component changes
- Not including component dependencies in build
- Missing vite peer dep when using vite plugin
