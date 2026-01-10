/**
 * Weather App - UI Component
 *
 * Displays weather data from the MCP server tools.
 * Handles three different result types: current weather, forecast, and alerts.
 */

import {
  useAppsClient,
  useToolResult,
  useHostContext,
  useDocumentTheme,
  useHostStyleVariables,
} from "@mcp-apps-kit/ui-react";
import type { AppTools } from "../../server/index.js";
import type {
  CurrentWeather,
  WeatherForecast,
  WeatherAlertsResponse,
} from "../../server/services/weatherService.js";

// Component for displaying current weather
function CurrentWeatherDisplay({ data }: { data: CurrentWeather }) {
  const windDirections = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const windDir = windDirections[Math.round(data.windDirection / 45) % 8];

  return (
    <div className="weather-card current-weather">
      <div className="weather-header">
        <h2>{data.location.name}</h2>
        {data.location.country && <span className="country">{data.location.country}</span>}
      </div>

      <div className="weather-main">
        <span className="weather-icon">{data.icon}</span>
        <div className="temperature">
          <span className="temp-value">{Math.round(data.temperature)}°C</span>
          <span className="temp-feels">Feels like {Math.round(data.feelsLike)}°C</span>
        </div>
      </div>

      <p className="weather-description">{data.description}</p>

      <div className="weather-details">
        <div className="detail">
          <span className="detail-icon">💧</span>
          <span className="detail-label">Humidity</span>
          <span className="detail-value">{data.humidity}%</span>
        </div>
        <div className="detail">
          <span className="detail-icon">💨</span>
          <span className="detail-label">Wind</span>
          <span className="detail-value">
            {Math.round(data.windSpeed)} km/h {windDir}
          </span>
        </div>
      </div>

      <p className="timestamp">Updated: {new Date(data.timestamp).toLocaleString()}</p>
    </div>
  );
}

// Component for displaying forecast
function ForecastDisplay({ data }: { data: WeatherForecast }) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";

    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  return (
    <div className="weather-card forecast">
      <div className="weather-header">
        <h2>{data.location.name} Forecast</h2>
        {data.location.country && <span className="country">{data.location.country}</span>}
      </div>

      <div className="forecast-list">
        {data.daily.map((day) => (
          <div key={day.date} className="forecast-day">
            <span className="forecast-date">{formatDate(day.date)}</span>
            <span className="forecast-icon">{day.icon}</span>
            <div className="forecast-temps">
              <span className="temp-high">{Math.round(day.temperatureMax)}°</span>
              <span className="temp-low">{Math.round(day.temperatureMin)}°</span>
            </div>
            <span className="forecast-precip">
              {day.precipitationProbability > 0 && `${day.precipitationProbability}%`}
            </span>
          </div>
        ))}
      </div>

      <p className="timestamp">Generated: {new Date(data.generatedAt).toLocaleString()}</p>
    </div>
  );
}

// Component for displaying alerts
function AlertsDisplay({ data }: { data: WeatherAlertsResponse }) {
  const severityColors: Record<string, string> = {
    minor: "#ffc107",
    moderate: "#fd7e14",
    severe: "#dc3545",
    extreme: "#6f42c1",
  };

  return (
    <div className="weather-card alerts">
      <div className="weather-header">
        <h2>{data.location.name} Alerts</h2>
        {data.location.country && <span className="country">{data.location.country}</span>}
      </div>

      {data.alerts.length === 0 ? (
        <div className="no-alerts">
          <span className="check-icon">✓</span>
          <p>No active weather alerts</p>
        </div>
      ) : (
        <div className="alerts-list">
          {data.alerts.map((alert) => (
            <div
              key={alert.id}
              className={`alert-item alert-${alert.severity}`}
              style={{ borderLeftColor: severityColors[alert.severity] }}
            >
              <div className="alert-header">
                <span className={`alert-type alert-type-${alert.type}`}>
                  {alert.type.toUpperCase()}
                </span>
                <span className="alert-severity">{alert.severity}</span>
              </div>
              <h3 className="alert-headline">{alert.headline}</h3>
              <p className="alert-description">{alert.description}</p>
              <p className="alert-times">
                {new Date(alert.startTime).toLocaleString()} -{" "}
                {new Date(alert.endTime).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}

      <p className="timestamp">Last checked: {new Date(data.lastChecked).toLocaleString()}</p>
    </div>
  );
}

// Determine which type of result we have
function isCurrentWeather(data: unknown): data is CurrentWeather {
  return !!data && typeof data === "object" && "temperature" in data && "humidity" in data;
}

function isForecast(data: unknown): data is WeatherForecast {
  return (
    !!data &&
    typeof data === "object" &&
    "daily" in data &&
    Array.isArray((data as WeatherForecast).daily)
  );
}

function isAlerts(data: unknown): data is WeatherAlertsResponse {
  return (
    !!data &&
    typeof data === "object" &&
    "alerts" in data &&
    Array.isArray((data as WeatherAlertsResponse).alerts)
  );
}

export function App() {
  const client = useAppsClient<AppTools>();
  const result = useToolResult<AppTools>();
  const context = useHostContext();

  // Apply theme and host styles
  useDocumentTheme("light", "dark");
  useHostStyleVariables();

  // Extract the actual data from the result
  // Handle both wrapped ({ toolName: data }) and unwrapped (data) formats
  const rawResult =
    result?.getCurrentWeather ?? result?.getForecast ?? result?.getWeatherAlerts ?? result;

  // Determine what type of data we have
  let content: React.ReactNode;

  if (!rawResult) {
    content = (
      <div className="waiting">
        <span className="loading-icon">🌤️</span>
        <p>Waiting for weather data...</p>
        <p className="hint">Ask the AI to check the weather for a location!</p>
      </div>
    );
  } else if (isCurrentWeather(rawResult)) {
    content = <CurrentWeatherDisplay data={rawResult} />;
  } else if (isForecast(rawResult)) {
    content = <ForecastDisplay data={rawResult} />;
  } else if (isAlerts(rawResult)) {
    content = <AlertsDisplay data={rawResult} />;
  } else {
    content = (
      <div className="error">
        <p>Unable to display weather data</p>
      </div>
    );
  }

  return (
    <div className="container">
      {content}

      <div className="actions">
        <button
          className="button"
          onClick={() => client.sendFollowUpMessage("What's the current weather?")}
        >
          Current Weather
        </button>
        <button
          className="button"
          onClick={() => client.sendFollowUpMessage("Show me the 7-day forecast")}
        >
          Forecast
        </button>
        <button
          className="button"
          onClick={() => client.sendFollowUpMessage("Are there any weather alerts?")}
        >
          Alerts
        </button>
      </div>

      <footer className="meta">
        Theme: {context.theme} | Locale: {context.locale}
      </footer>
    </div>
  );
}
