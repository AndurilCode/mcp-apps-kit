/**
 * Current Weather Widget
 *
 * React component for displaying current weather conditions.
 * Built by vite plugin into self-contained HTML.
 */

import React from "react";
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
  const data = (rawResult?.get_current_weather ?? rawResult) as CurrentWeather | undefined;

  if (!data || !("temperature" in data)) {
    return (
      <div className="waiting">
        <span className="loading-icon">🌤️</span>
        <p>Waiting for weather data...</p>
      </div>
    );
  }

  const windDirections = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const windDir = windDirections[Math.round(data.windDirection / 45) % 8];

  return (
    <div className="container">
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

      <footer className="meta">Theme: {context.theme}</footer>
    </div>
  );
}

/**
 * UI metadata for convention-based binding.
 * Exported as plain object to avoid importing server-side code.
 */
export const ui = {
  name: "Current Weather Widget",
  description: "Displays current weather conditions with temperature, humidity, and wind",
  html: "./ui/dist/current-weather-widget.html",
  prefersBorder: true,
};
