# Weather App Example

An MCP application demonstrating **file-based development** with @mcp-apps-kit. Uses the [Open-Meteo API](https://open-meteo.com/) for real weather data (free, no API key required) with mock data fallback.

## File-Based Development

This example showcases the file-based convention pattern where tools are discovered from the filesystem:

- **Tools** are defined in individual files in `tools/`
- **UIs** are colocated with their tools using `export const ui = ...`
- **Manifest** is auto-generated from file structure via `@mcp-apps-kit/codegen`

## Tools

| Tool                  | File                           | Description                                                               |
| --------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| `get_current_weather` | `tools/get-current-weather.ts` | Returns current temperature, humidity, wind, and conditions               |
| `get_forecast`        | `tools/get-forecast.ts`        | Returns daily forecast with high/low temps, precipitation, sunrise/sunset |
| `get_weather_alerts`  | `tools/get-weather-alerts.ts`  | Returns active weather warnings, watches, and advisories                  |
| `daily_briefing`      | `tools/daily-briefing.ts`      | Generates comprehensive morning weather briefing                          |

## Project Structure

```
weather-app/
├── mcp.config.ts              # App configuration
├── tools/
│   ├── _shared.ts             # Shared schemas and services (not a tool)
│   ├── get-current-weather.ts # → get_current_weather tool + UI
│   ├── get-forecast.ts        # → get_forecast tool + UI
│   └── get-weather-alerts.ts  # → get_weather_alerts tool + UI
├── workflows/
│   └── daily-briefing.ts      # → daily_briefing tool (workflow)
├── __generated__/             # Auto-generated (gitignored)
│   └── app-manifest.ts        # Typed tool imports
├── server/
│   ├── index.ts               # Entry point using createFileBasedApp
│   └── services/
│       └── weatherService.ts  # Open-Meteo API integration
├── ui/
│   └── src/                   # React UI components
├── scripts/
│   └── generate.ts            # Manifest generator script
└── tests/
```

### Workflows Directory

The `workflows/` directory is for organizing complex, multi-step tools separately from simple tools. At codegen time, workflows are merged into the `tools` export (since workflows become tools at runtime). The generated manifest also exports a `workflows` object for documentation purposes.

## Naming Convention

Files are automatically converted to tool names:

- `get-current-weather.ts` → `get_current_weather`
- `daily-briefing.ts` → `daily_briefing`
- Files starting with `_` are ignored (e.g., `_shared.ts`)

## Development

```bash
# Install dependencies (from monorepo root)
pnpm install

# Generate manifest (run after adding/removing tools)
pnpm -C examples/weather-app generate

# Run development server
pnpm -C examples/weather-app dev
```

## Build

```bash
pnpm -C examples/weather-app build
```

This will:

1. Generate the manifest from `tools/`
2. Build the UI components
3. Compile TypeScript

## Testing

```bash
# Run tests
pnpm -C examples/weather-app test

# Run tests in watch mode
pnpm -C examples/weather-app test:watch
```

### Mock Mode

Set `USE_MOCK_WEATHER=true` to use mock data instead of the real API:

```bash
USE_MOCK_WEATHER=true pnpm -C examples/weather-app dev
```

## Connecting to an MCP Apps Host

Configure your MCP Apps-compatible host to connect to the server:

**HTTP mode (default):**

- Endpoint: `http://localhost:3005/mcp`

**Stdio mode (for hosts that support it):**

```bash
npx tsx examples/weather-app/server/index.ts
```

## API Reference

### Open-Meteo

This example uses the [Open-Meteo API](https://open-meteo.com/), a free and open-source weather API that doesn't require authentication.

- **Geocoding**: Converts city names to coordinates
- **Weather**: Current conditions and forecasts
- **Limits**: No rate limits for reasonable usage

## License

MIT
