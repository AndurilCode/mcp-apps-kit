/**
 * Current Weather Widget
 *
 * React component for displaying current weather conditions.
 * Built by vite plugin into self-contained HTML.
 */

import {
  useToolResult,
  useHostContext,
  useDocumentTheme,
  useHostStyleVariables,
} from "@mcp-apps-kit/ui-react";
import type { CurrentWeather } from "../../services/weatherService.js";

export default function CurrentWeatherWidget() {
  const result = useToolResult();
  const context = useHostContext();

  useDocumentTheme("light", "dark");
  useHostStyleVariables();

  // Handle both wrapped and unwrapped result formats
  const rawResult = result as Record<string, unknown> | undefined;
  const data = (rawResult?.getCurrentWeather ?? rawResult) as CurrentWeather | undefined;

  // Validate all required fields before rendering
  const isValidWeatherData = (d: unknown): d is CurrentWeather => {
    if (!d || typeof d !== "object") return false;
    const obj = d as Record<string, unknown>;
    if (!("temperature" in obj) || typeof obj.temperature !== "number") return false;
    if (!("location" in obj) || typeof obj.location !== "object" || obj.location === null)
      return false;
    if (!("windDirection" in obj) || typeof obj.windDirection !== "number") return false;
    if (!("windSpeed" in obj) || typeof obj.windSpeed !== "number") return false;
    return true;
  };

  if (!isValidWeatherData(data)) {
    return (
      <div className="weather-card waiting">
        <span className="waiting-icon animate-float">🌤️</span>
        <p>Waiting for weather data...</p>
      </div>
    );
  }

  const windDirections = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  // Normalize windDirection to [0, 360) to handle negative or >= 360 values
  const normalizedAngle = ((data.windDirection % 360) + 360) % 360;
  const windDir = windDirections[Math.round(normalizedAngle / 45) % 8];

  return (
    <div className="widget-container">
      <div className="weather-card">
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
          <div className="detail-box">
            <span className="detail-icon">💧</span>
            <span className="detail-label">Humidity</span>
            <span className="detail-value">{data.humidity}%</span>
          </div>
          <div className="detail-box">
            <span className="detail-icon">💨</span>
            <span className="detail-label">Wind</span>
            <span className="detail-value">
              {Math.round(data.windSpeed)} km/h {windDir}
            </span>
          </div>
        </div>

        <p className="timestamp">Updated: {new Date(data.timestamp).toLocaleString()}</p>
      </div>

      <footer className="meta">Theme: {context.theme}</footer>
    </div>
  );
}

/**
 * UI metadata for convention-based binding.
 * The html path is auto-inferred from the file name.
 */
import type { WidgetMetadata } from "@mcp-apps-kit/core";

export const ui: WidgetMetadata = {
  name: "Current Weather Widget",
  description: "Displays current weather conditions with temperature, humidity, and wind",
  prefersBorder: true,
};
