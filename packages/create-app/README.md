# @mcp-apps-kit/create-app

[![npm](https://img.shields.io/npm/v/%40mcp-apps-kit%2Fcreate-app)](https://www.npmjs.com/package/@mcp-apps-kit/create-app) [![node](https://img.shields.io/node/v/%40mcp-apps-kit%2Fcreate-app)](https://www.npmjs.com/package/@mcp-apps-kit/create-app) [![license](https://img.shields.io/npm/l/%40mcp-apps-kit%2Fcreate-app)](https://www.npmjs.com/package/@mcp-apps-kit/create-app)

CLI tool for scaffolding MCP applications.

Scaffolds a ready-to-run project with server and UI code so you can focus on tool definitions and widget UI.

## Table of Contents

- [Background](#background)
- [Features](#features)
- [Compatibility](#compatibility)
- [Install](#install)
- [Usage](#usage)
- [Examples](#examples)
- [API](#api)
- [Contributing](#contributing)
- [License](#license)

## Background

Starting a new MCP app requires wiring server tooling, UI code, and build scripts. This CLI creates a minimal, working project so you can iterate quickly.

## Features

- React and vanilla templates
- Optional Vercel deployment configuration
- Interactive prompts or non-interactive flags

## Compatibility

- Node.js: `>= 20`

## Install

Run without installing:

```bash
npx @mcp-apps-kit/create-app@latest
```

Or install globally:

```bash
npm install -g @mcp-apps-kit/create-app
create-mcp-apps-kit
```

## Usage

```bash
# Provide a name (otherwise it prompts)
npx @mcp-apps-kit/create-app@latest my-app

# Choose template
npx @mcp-apps-kit/create-app@latest my-app --template react
npx @mcp-apps-kit/create-app@latest my-app --template vanilla

# Pick output directory
npx @mcp-apps-kit/create-app@latest my-app --directory ./apps/my-app

# Skip install / git init
npx @mcp-apps-kit/create-app@latest my-app --skip-install
npx @mcp-apps-kit/create-app@latest my-app --skip-git

# Add Vercel configuration
npx @mcp-apps-kit/create-app@latest my-app --vercel
```

## Examples

- `../../examples/minimal`
- [kanban-mcp-example](https://github.com/AndurilCode/kanban-mcp-example)

## API

CLI entry point:

- `create-mcp-apps-kit [name]`

Options:

- `-t, --template <react|vanilla>`
- `-d, --directory <path>`
- `--skip-install`
- `--skip-git`
- `--vercel`

## Contributing

See `../../CONTRIBUTING.md` for development setup and guidelines. Issues and pull requests are welcome.

## License

MIT
