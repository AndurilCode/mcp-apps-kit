# @mcp-apps-kit/example-weather-app

A weather demo MCP app built with @mcp-apps-kit.

It exposes a `get_weather` tool that returns current conditions + a short forecast, powered by [Open-Meteo](https://open-meteo.com/) (no API key required).

## Development

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
```

## Testing

```bash
pnpm test
```

> Tests are deterministic and mock the Open‑Meteo network calls.

## Connecting to an MCP Apps Host

Configure your MCP Apps-compatible host to connect to the server:

**HTTP mode (default):**

- Endpoint: `http://localhost:3000/mcp`

**Stdio mode (for hosts that support it):**

```bash
npx tsx path/to/@mcp-apps-kit/example-weather-app/server/index.ts
```
