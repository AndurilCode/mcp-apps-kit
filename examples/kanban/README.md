# Kanban Board Example

A simple Kanban board application built with `@apps-builder/core`, demonstrating:

- Type-safe tool definitions with Zod schemas
- UI resource binding for rich visualizations
- Protocol-agnostic design (works with MCP and OpenAI)
- In-memory data store with CRUD operations

## Quick Start

```bash
# Install dependencies
pnpm install

# Start the server
pnpm start

# Or with hot-reload during development
pnpm dev
```

The server will start at `http://localhost:3000`.

## Available Tools

| Tool | Description |
|------|-------------|
| `listTasks` | List all tasks, optionally filtered by status |
| `createTask` | Create a new task |
| `moveTask` | Move a task to a different column |
| `updateTask` | Update a task's title or description |
| `deleteTask` | Delete a task from the board |
| `getBoardSummary` | Get an overview of the board |

## Example Usage

### List All Tasks

```json
{
  "tool": "listTasks",
  "arguments": {}
}
```

### Create a Task

```json
{
  "tool": "createTask",
  "arguments": {
    "title": "Implement feature X",
    "description": "Add the new feature to the dashboard",
    "status": "todo"
  }
}
```

### Move a Task

```json
{
  "tool": "moveTask",
  "arguments": {
    "taskId": "task-123",
    "newStatus": "in_progress"
  }
}
```

## Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kanban": {
      "command": "npx",
      "args": ["tsx", "/path/to/examples/kanban/src/index.ts"]
    }
  }
}
```

## Project Structure

```
kanban/
├── src/
│   ├── index.ts        # Main app with tool definitions
│   └── ui/
│       └── board.html  # Kanban board widget
├── package.json
├── tsconfig.json
└── README.md
```

## Switching Protocols

The example uses MCP protocol by default. To switch to OpenAI protocol for ChatGPT compatibility:

```typescript
// In src/index.ts
config: {
  protocol: "openai",  // Change from "mcp" to "openai"
}
```

This will change:
- Metadata format from camelCase to snake_case
- MIME type from `text/html;profile=mcp-app` to `text/html;profile=chatgpt-widget`
- Visibility annotations from `readOnlyHint` to `invokableByAI`

## Features Demonstrated

1. **Type-Safe Schemas**: All inputs and outputs are validated with Zod
2. **UI Binding**: Tools reference the `kanban-board` UI resource for visualization
3. **ChatGPT Messages**: `invokingMessage` and `invokedMessage` for loading states
4. **CORS Configuration**: Enabled for browser-based clients
5. **Health Check**: Available at `/health` endpoint
