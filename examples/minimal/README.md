# Minimal Example with Versioning

A simple example demonstrating @mcp-apps-kit/core versioning support - exposing multiple API versions from a single application.

## Features

- **API Versioning**: Two API versions exposed at different routes
  - `v1`: Simple greet tool (name only)
  - `v2`: Enhanced greet tool (name + optional surname)
- **Shared Configuration**: CORS, debug settings shared across versions
- **Type-Safe Tools**: Full TypeScript support for each version's tools
- **React UI Widgets**: Version-specific UI components

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

## API Endpoints

Once running, the server exposes:

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `POST /v1/mcp` | MCP v1 API (name only) |
| `POST /v2/mcp` | MCP v2 API (name + surname) |

## Testing the API

```bash
# v1: Greet with name only
curl -X POST http://localhost:3000/v1/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"greet","arguments":{"name":"World"}},"id":1}'

# v2: Greet with name and surname
curl -X POST http://localhost:3000/v2/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"greet","arguments":{"name":"John","surname":"Doe"}},"id":1}'
```

## Connecting to Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "minimal-app-v1": {
      "url": "http://localhost:3000/v1/mcp"
    },
    "minimal-app-v2": {
      "url": "http://localhost:3000/v2/mcp"
    }
  }
}
```

## Project Structure

```
minimal/
  src/
    index.ts                  # Server with versioned app setup
    ui/
      GreetingWidgetV1.tsx    # V1 UI widget (name only)
      GreetingWidgetV2.tsx    # V2 UI widget (name + surname)
      styles.css              # Shared styles
      dist/                   # Built UI HTML files
  package.json
  tsconfig.json
  vite.config.ts
```

## Tools

### V1: `greet`

Greet someone by name.

**Input:**
- `name` (string): Name to greet

**Output:**
- `message` (string): Greeting message
- `timestamp` (string): ISO timestamp

### V2: `greet`

Greet someone by name and optional surname.

**Input:**
- `name` (string): First name to greet
- `surname` (string, optional): Surname

**Output:**
- `message` (string): Greeting message
- `fullName` (string): The full name used in greeting
- `timestamp` (string): ISO timestamp

## Versioning Configuration

The app uses the `createApp` versioning feature:

```typescript
const app = createApp({
  name: "minimal-app",

  // Shared config across all versions
  config: {
    cors: { origin: true },
    debug: { logTool: true, level: "info" },
  },

  // Version-specific tools and config
  versions: {
    v1: {
      version: "1.0.0",
      tools: { greet: greetToolV1 },
    },
    v2: {
      version: "2.0.0",
      tools: { greet: greetToolV2 },
    },
  },
});

// Access version info programmatically
console.log(app.getVersions()); // ["v1", "v2"]
const v2App = app.getVersion("v2");
```
