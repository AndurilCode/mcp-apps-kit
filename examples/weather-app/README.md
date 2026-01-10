# Weather App Example

An MCP application demonstrating weather tools built with @mcp-apps-kit. Uses the [Open-Meteo API](https://open-meteo.com/) for real weather data (free, no API key required) with mock data fallback.

## Features

- **getCurrentWeather**: Get current weather conditions for any location
- **getForecast**: Get up to 16-day weather forecast
- **getWeatherAlerts**: Get weather alerts and warnings (mock data)

## Tools

| Tool                | Description                                                               |
| ------------------- | ------------------------------------------------------------------------- |
| `getCurrentWeather` | Returns current temperature, humidity, wind, and conditions               |
| `getForecast`       | Returns daily forecast with high/low temps, precipitation, sunrise/sunset |
| `getWeatherAlerts`  | Returns active weather warnings, watches, and advisories                  |

## Development

```bash
# Install dependencies (from monorepo root)
pnpm install

# Run development server
pnpm -C examples/weather-app dev
```

## Build

```bash
pnpm -C examples/weather-app build
```

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

## Project Structure

```
weather-app/
├── server/
│   ├── index.ts              # App entry point with tool definitions
│   └── services/
│       └── weatherService.ts # Open-Meteo API integration
├── ui/
│   ├── src/
│   │   ├── App.tsx          # React UI components
│   │   └── styles.css       # Styling
│   └── vite.config.ts
└── tests/
    ├── integration/
    │   └── server.test.ts    # Integration tests
    └── unit/
        └── weatherService.test.ts # Unit tests
```

## API Reference

### Open-Meteo

This example uses the [Open-Meteo API](https://open-meteo.com/), a free and open-source weather API that doesn't require authentication.

- **Geocoding**: Converts city names to coordinates
- **Weather**: Current conditions and forecasts
- **Limits**: No rate limits for reasonable usage

## License

MIT
