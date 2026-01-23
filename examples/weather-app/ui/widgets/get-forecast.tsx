/**
 * Weather Forecast Widget
 *
 * React component for displaying multi-day weather forecast.
 * Built by vite plugin into self-contained HTML.
 */

import React from "react";
import {
  useToolResult,
  useHostContext,
  useDocumentTheme,
  useHostStyleVariables,
} from "@mcp-apps-kit/ui-react";
import type { WeatherForecast } from "../../services/weatherService.js";

export default function ForecastWidget() {
  const result = useToolResult();
  const context = useHostContext();

  useDocumentTheme("light", "dark");
  useHostStyleVariables();

  // Handle both wrapped and unwrapped result formats
  const rawResult = result as Record<string, unknown> | undefined;
  const data = (rawResult?.get_forecast ?? rawResult) as WeatherForecast | undefined;

  if (!data || !("daily" in data) || !Array.isArray(data.daily)) {
    return (
      <div className="weather-card flex flex-col items-center justify-center py-12 px-6 text-center">
        <span className="text-6xl mb-4 animate-float">📅</span>
        <p className="text-gray-500 dark:text-gray-400">Waiting for forecast data...</p>
      </div>
    );
  }

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
    <div className="widget-container">
      <div className="weather-card">
        <div className="flex items-baseline gap-2 mb-4">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {data.location.name} Forecast
          </h2>
          {data.location.country && (
            <span className="text-sm text-gray-400">{data.location.country}</span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {data.daily.map((day) => (
            <div
              key={day.date}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg"
            >
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {formatDate(day.date)}
              </span>
              <span className="text-2xl">{day.icon}</span>
              <div className="flex gap-2 font-medium">
                <span className="text-gray-900 dark:text-gray-100">
                  {Math.round(day.temperatureMax)}°
                </span>
                <span className="text-gray-400">{Math.round(day.temperatureMin)}°</span>
              </div>
              <span className="text-sm text-blue-500 min-w-[40px] text-right">
                {day.precipitationProbability > 0 && `${day.precipitationProbability}%`}
              </span>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 text-center mt-3">
          Generated: {new Date(data.generatedAt).toLocaleString()}
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
  name: "Weather Forecast Widget",
  description: "Displays multi-day weather forecast with daily temperatures and conditions",
  html: "./ui/dist/forecast-widget.html",
  prefersBorder: true,
};
