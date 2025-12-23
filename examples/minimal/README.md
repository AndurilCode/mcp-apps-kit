# Minimal Example

A simple "hello world" example demonstrating basic @apps-builder/core usage.

## Features

- Single tool definition with Zod schema validation
- Simple UI widget showing greeting messages
- Basic server setup

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Or start production server
pnpm build
pnpm start
```

## Connecting to Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "minimal-app": {
      "command": "npx",
      "args": ["tsx", "path/to/examples/minimal/src/index.ts"]
    }
  }
}
```

## Project Structure

```
minimal/
  src/
    index.ts       # Server with tool definition
    ui/
      index.html   # Widget HTML entry
      main.ts      # Widget TypeScript
  package.json
  tsconfig.json
  vite.config.ts
```

## Tool

### `greet`

Greet someone by name.

**Input:**
- `name` (string): Name to greet

**Output:**
- `message` (string): Greeting message
- `timestamp` (string): ISO timestamp
