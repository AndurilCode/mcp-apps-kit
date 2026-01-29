# @mcp-apps-kit/inspector

[![npm](https://img.shields.io/npm/v/%40mcp-apps-kit%2Finspector)](https://www.npmjs.com/package/@mcp-apps-kit/inspector) [![node](https://img.shields.io/node/v/%40mcp-apps-kit%2Finspector)](https://www.npmjs.com/package/@mcp-apps-kit/inspector) [![license](https://img.shields.io/npm/l/%40mcp-apps-kit%2Finspector)](https://www.npmjs.com/package/@mcp-apps-kit/inspector)

MCP Inspector Server - Test and debug MCP servers through any MCP client.

A meta-MCP server that exposes `@mcp-apps-kit/testing` functionality as MCP tools, enabling interactive testing and debugging of MCP servers through any MCP client (Claude Desktop, Cursor, etc.) without requiring a browser-based inspector UI.

## Features

- **Test MCP servers from within Claude Desktop or Cursor** - No browser required
- **LLM-assisted debugging** - The AI can analyze tool outputs, suggest fixes, run tests
- **Integration testing** - Test MCP servers as part of development conversations
- **Full MCP feature support** - Tools, resources, prompts, and test suites
- **Call history tracking** - Track and analyze tool call patterns

## Installation

```bash
npm install @mcp-apps-kit/inspector
```

## Quick Start

### CLI Usage

```bash
# Start inspector server on default port 6274
npx @mcp-apps-kit/inspector

# Start on custom port
npx @mcp-apps-kit/inspector --port 3001

# With debug logging
npx @mcp-apps-kit/inspector --debug

# With custom history limit
npx @mcp-apps-kit/inspector --max-history 500
```

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcp-inspector": {
      "command": "npx",
      "args": ["@mcp-apps-kit/inspector"]
    }
  }
}
```

### Programmatic Usage

```typescript
import { createInspectorServer } from "@mcp-apps-kit/inspector";

const app = createInspectorServer({
  maxHistorySize: 1000,
  defaultTimeout: 30000,
  debug: false,
});

await app.start({ port: 6274 });
```

## Available Tools

### Connection Management

| Tool                    | Description                        |
| ----------------------- | ---------------------------------- |
| `connect_to_server`     | Connect to a target MCP server     |
| `disconnect`            | Disconnect from the current server |
| `get_connection_status` | Get current connection status      |

### Tool Operations

| Tool         | Description                            |
| ------------ | -------------------------------------- |
| `list_tools` | List all tools on the connected server |
| `call_tool`  | Call a tool with specified arguments   |

### Resource Operations

| Tool             | Description                                |
| ---------------- | ------------------------------------------ |
| `list_resources` | List all resources on the connected server |
| `read_resource`  | Read a resource by URI                     |

### Prompt Operations

| Tool           | Description                              |
| -------------- | ---------------------------------------- |
| `list_prompts` | List all prompts on the connected server |
| `get_prompt`   | Get a prompt with optional arguments     |

### History & Testing

| Tool               | Description                     |
| ------------------ | ------------------------------- |
| `get_call_history` | Get the history of tool calls   |
| `clear_history`    | Clear the call history          |
| `run_test_suite`   | Run a test suite against a tool |

## Usage Examples

### Connect and List Tools

```text
User: Connect to my server at http://localhost:3000/v1/mcp
```
