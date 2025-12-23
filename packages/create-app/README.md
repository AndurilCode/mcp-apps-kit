# @mcp-apps-kit/create-app

[![npm](https://img.shields.io/npm/v/%40mcp-apps-kit%2Fcreate-app)](https://www.npmjs.com/package/@mcp-apps-kit/create-app) [![node](https://img.shields.io/node/v/%40mcp-apps-kit%2Fcreate-app)](https://www.npmjs.com/package/@mcp-apps-kit/create-app) [![license](https://img.shields.io/npm/l/%40mcp-apps-kit%2Fcreate-app)](https://www.npmjs.com/package/@mcp-apps-kit/create-app)

CLI scaffolder for starting a new MCP app project using MCP Apps Kit.

It generates a ready-to-run project with server + UI code, so you can focus on tool definitions and your widget UI.

## Use

You can run it without installing:

```bash
npx create-mcp-apps-kit@latest
```

Or install globally:

```bash
npm install -g @mcp-apps-kit/create-app
create-mcp-apps-kit
```

## Options

```bash
# Provide a name (otherwise it prompts)
npx create-mcp-apps-kit@latest my-app

# Choose template
npx create-mcp-apps-kit@latest my-app --template react
npx create-mcp-apps-kit@latest my-app --template vanilla

# Pick output directory
npx create-mcp-apps-kit@latest my-app --directory ./apps/my-app

# Skip install / git init
npx create-mcp-apps-kit@latest my-app --skip-install
npx create-mcp-apps-kit@latest my-app --skip-git
```

Templates:
- `react`: React + TypeScript UI with hooks
- `vanilla`: Vanilla TypeScript UI

## After scaffolding

```bash
cd my-app
pnpm dev
```

## Documentation & examples

- Project overview: ../../README.md
- API reference: ../../docs/API-REFERENCE.md
- Example projects (if you prefer copying instead of scaffolding):
  - ../../examples/minimal
  - ../../examples/kanban

## License

MIT
