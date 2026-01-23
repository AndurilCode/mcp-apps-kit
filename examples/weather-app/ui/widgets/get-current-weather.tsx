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
      <div className="weather-card flex flex-col items-center justify-center py-12 px-6 text-center">
        <span className="text-6xl mb-4 animate-float">🌤️</span>
        <p className="text-gray-500 dark:text-gray-400">Waiting for weather data...</p>
      </div>
    );
  }

  const windDirections = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const windDir = windDirections[Math.round(data.windDirection / 45) % 8];

  return (
    <div className="widget-container">
      <div className="weather-card">
        <div className="flex items-baseline gap-2 mb-4">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {data.location.name}
          </h2>
          {data.location.country && (
            <span className="text-sm text-gray-400">{data.location.country}</span>
          )}
        </div>

        <div className="flex items-center gap-4 mb-3">
          <span className="text-6xl leading-none">{data.icon}</span>
          <div className="flex flex-col">
            <span className="text-5xl font-bold leading-none text-gray-900 dark:text-gray-100">
              {Math.round(data.temperature)}°C
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Feels like {Math.round(data.feelsLike)}°C
            </span>
          </div>
        </div>

        <p className="text-lg text-gray-500 dark:text-gray-400 mb-4">{data.description}</p>

        <div className="grid grid-cols-2 gap-3 p-4 bg-gray-100 dark:bg-gray-700 rounded-xl mb-3">
          <div className="detail-box">
            <span className="text-2xl mb-1">💧</span>
            <span className="detail-label">Humidity</span>
            <span className="detail-value">{data.humidity}%</span>
          </div>
          <div className="detail-box">
            <span className="text-2xl mb-1">💨</span>
            <span className="detail-label">Wind</span>
            <span className="detail-value">
              {Math.round(data.windSpeed)} km/h {windDir}
            </span>
          </div>
        </div>

        <p className="text-xs text-gray-400 text-center mt-3">
          Updated: {new Date(data.timestamp).toLocaleString()}
        </p>
      </div>

      <footer className="text-center text-xs text-gray-400 pt-4 mt-2 border-t border-gray-200 dark:border-gray-700">
        Theme: {context.theme}
      </footer>
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
