# @mcp-apps-kit/create-app

CLI tool for scaffolding MCP applications. Creates new projects with React or vanilla JS templates.

## Quick Commands

```bash
pnpm -C packages/create-app test        # Run tests
pnpm -C packages/create-app typecheck   # Type check only
pnpm -C packages/create-app lint        # Lint only
```

## Key Exports

- `scaffoldProject` - Programmatic project creation
- CLI binary: `create-mcp-apps-kit`

## Templates

- `react` - React + Vite + @mcp-apps-kit/ui-react
- `vanilla` - Vanilla JS + Vite + @mcp-apps-kit/ui

Both include:

- Server with example tool
- UI with theming
- Integration tests
- Optional Vercel deployment config

## Dependencies

- commander (CLI framework)
- @inquirer/prompts (interactive prompts)
- figlet, chalk (CLI styling)

## Common Mistakes

- Running in non-empty directory (fails)
- Fetches latest package versions from npm at runtime
- Generated projects use npm (not pnpm) to avoid workspace conflicts

---

## Learnings

<!-- MANDATORY: Document failures here to prevent repeated mistakes -->
<!-- Format: what went wrong → what to do instead -->

<!-- Example:
- Template file had wrong path → Use path.join() not string concatenation for cross-platform
- npm install failed in generated project → Check if package versions are valid on npm registry
-->
