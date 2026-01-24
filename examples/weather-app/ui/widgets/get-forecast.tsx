/**
 * Weather Forecast Widget
 *
 * React component for displaying multi-day weather forecast.
 * Built by vite plugin into self-contained HTML.
 */

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
  const data = (rawResult?.getForecast ?? rawResult) as WeatherForecast | undefined;

  if (!data || !("daily" in data) || !Array.isArray(data.daily)) {
    return (
      <div className="weather-card waiting">
        <span className="waiting-icon animate-float">📅</span>
        <p>Waiting for forecast data...</p>
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
  name: "Weather Forecast Widget",
  description: "Displays multi-day weather forecast with daily temperatures and conditions",
  prefersBorder: true,
};
