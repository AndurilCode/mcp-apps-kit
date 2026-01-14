# Minimal Example with Versioning

A simple example demonstrating @mcp-apps-kit/core versioning support - exposing multiple API versions from a single application.

## Features

- **API Versioning**: Multiple API versions exposed at different routes
  - `v1`: Simple greet tool (name only)
  - `v2`: Enhanced greet tool (name + optional surname)
  - `v3`: Echo tool (demonstrates inline schema syntax - PRD-002)
  - `v4`: Stats & math tools (demonstrates output type inference - PRD-004)
- **Shared Configuration**: CORS, debug settings shared across versions
- **Type-Safe Tools**: Full TypeScript support for each version's tools
- **React UI Widgets**: Version-specific UI components
- **Output Type Inference**: Automatic type inference from handler returns (v4)

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

| Endpoint       | Description                             |
| -------------- | --------------------------------------- |
| `GET /health`  | Health check                            |
| `POST /v1/mcp` | MCP v1 API (name only)                  |
| `POST /v2/mcp` | MCP v2 API (name + surname)             |
| `POST /v3/mcp` | MCP v3 API (inline schema syntax demo)  |
| `POST /v4/mcp` | MCP v4 API (output type inference demo) |

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

## Connecting to an MCP Apps Host

Configure your MCP Apps-compatible host to connect to one or both API versions:

- **v1 endpoint**: `http://localhost:3000/v1/mcp`
- **v2 endpoint**: `http://localhost:3000/v2/mcp`

## Testing

Run all tests:

```bash
pnpm test
```

### LLM Evaluation Tests

The project includes LLM-based evaluation tests that use OpenAI to assess the quality of tool responses. To run these tests:

1. Copy `.env.example` to `.env`:

   ```bash
   cp .env.example .env
   ```

2. Add your OpenAI API key to `.env`:

   ```
   OPENAI_API_KEY=sk-your-actual-api-key
   ```

3. Run the tests:
   ```bash
   pnpm test -- eval.test.ts
   ```

> **Note**: Without the `OPENAI_API_KEY` environment variable, the eval tests will be automatically skipped.

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
  tests/
    eval.test.ts              # LLM evaluation tests
    greet-v1.test.ts          # V1 tool tests
    greet-v2.test.ts          # V2 tool tests
    integration.test.ts       # Integration tests
    ...
  .env.example                # Environment variables template
  package.json
  tsconfig.json
  vite.config.ts
  vitest.config.ts
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

### V3: `echo`

Echo back a message with metadata (demonstrates inline schema syntax).

**Input:**

- `message` (string): Message to echo back
- `uppercase` (boolean, optional): Convert to uppercase

**Output:**

- `echo` (string): The echoed message
- `length` (number): Length of the message
- `timestamp` (string): ISO timestamp

### V4: `getStats` & `quickMath`

Demonstrates **output type inference** (PRD-004) - no output schemas needed!

#### `getStats`

Get server statistics (no output schema - types inferred from handler).

**Input:**

- `includeMemory` (boolean, optional): Include memory usage stats

**Output (inferred):**

- `uptime` (number): Server uptime in seconds
- `timestamp` (string): ISO timestamp
- `memory` (optional object): Memory usage stats if requested
  - `used` (number): Heap used
  - `total` (number): Heap total

#### `quickMath`

Perform quick math operations (fluent builder with inferred output).

**Input:**

- `a` (number): First number
- `b` (number): Second number
- `operation` (enum): Operation - "add", "subtract", "multiply", or "divide"

**Output (inferred):**

- `result` (number): Calculation result
- `expression` (string): The calculation as a string
- `isValid` (boolean): Whether the result is valid (false for NaN)

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
    v3: {
      version: "3.0.0",
      tools: { echo: echoToolV3 },
    },
    v4: {
      version: "4.0.0",
      tools: { getStats: inferredToolV4, quickMath: quickMathV4 },
      // v4 demonstrates output type inference - no output schemas!
    },
  },
});

// Access version info programmatically
console.log(app.getVersions()); // ["v1", "v2"]
const v2App = app.getVersion("v2");
```
