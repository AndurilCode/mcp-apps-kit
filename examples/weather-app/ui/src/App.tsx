/**
 * @mcp-apps-kit/example-weather-app - UI Component
 */

import {
  useAppsClient,
  useToolResult,
  useHostContext,
  useDocumentTheme,
  useHostStyleVariables,
} from "@mcp-apps-kit/ui-react";
import { useMemo, useState } from "react";

type WeatherOutput = {
  source: "open-meteo";
  location: {
    name?: string;
    latitude: number;
    longitude: number;
    timezone: string;
  };
  current: {
    time: string;
    temperatureC: number;
    windSpeedKph?: number;
    weatherCode?: number;
  };
  daily: Array<{
    date: string;
    tempMinC: number;
    tempMaxC: number;
    weatherCode?: number;
  }>;
};

type GetWeatherInput = {
  location?: string;
  latitude?: number;
  longitude?: number;
  days?: number;
};

type AppToolDefs = {
  get_weather: {
    input: GetWeatherInput;
    output: WeatherOutput;
  };
};

export function App() {
  const client = useAppsClient<AppToolDefs>();
  const result = useToolResult<AppToolDefs>();
  const context = useHostContext();
  const [query, setQuery] = useState("San Francisco");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Apply theme and host styles
  useDocumentTheme("light", "dark");
  useHostStyleVariables();

  const output = useMemo(() => {
    // Handle both wrapped ({ get_weather: {...} }) and unwrapped ({...}) result formats
    const rawResult = result?.get_weather ?? result;
    if (!rawResult || typeof rawResult !== "object") return undefined;
    if ("current" in rawResult && "daily" in rawResult && "location" in rawResult) {
      return rawResult as WeatherOutput;
    }
    return undefined;
  }, [result]);

  return (
    <div className="container">
      <header className="header">
        <h1 className="title">Weather</h1>
        <p className="subtitle">Powered by Open-Meteo (no API key)</p>
      </header>

      <div className="controls">
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="City (e.g. Tokyo)"
          aria-label="City"
        />
        <button
          className="button"
          disabled={isLoading || query.trim().length === 0}
          onClick={async () => {
            setError(null);
            setIsLoading(true);
            try {
              await client.callTool("get_weather", { location: query.trim(), days: 3 });
            } catch (e) {
              const message = e instanceof Error ? e.message : String(e);
              setError(message);
            } finally {
              setIsLoading(false);
            }
          }}
        >
          {isLoading ? "Loading..." : "Get forecast"}
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {output ? (
        <div className="card">
          <div className="location">
            <div className="locationName">{output.location.name ?? query}</div>
            <div className="locationMeta">
              {output.location.latitude.toFixed(3)}, {output.location.longitude.toFixed(3)} ·{" "}
              {output.location.timezone}
            </div>
          </div>

          <div className="current">
            <div className="temp">{Math.round(output.current.temperatureC)}°C</div>
            <div className="currentMeta">
              <span>As of {new Date(output.current.time).toLocaleString()}</span>
              {typeof output.current.windSpeedKph === "number" ? (
                <span> · Wind {Math.round(output.current.windSpeedKph)} km/h</span>
              ) : null}
            </div>
          </div>

          <div className="forecast">
            {output.daily.map((d) => (
              <div className="day" key={d.date}>
                <div className="dayDate">{d.date}</div>
                <div className="dayTemps">
                  <span className="min">{Math.round(d.tempMinC)}°</span>
                  <span className="sep">/</span>
                  <span className="max">{Math.round(d.tempMaxC)}°</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="waiting">Enter a city and request a forecast.</p>
      )}

      <footer className="meta">
        Theme: {context.theme} | Locale: {context.locale}
      </footer>
    </div>
  );
}
