/**
 * Weather Alerts Widget
 *
 * React component for displaying weather alerts.
 * Built by vite plugin into self-contained HTML.
 */

import React from "react";
import {
  useToolResult,
  useHostContext,
  useDocumentTheme,
  useHostStyleVariables,
} from "@mcp-apps-kit/ui-react";
import type { WeatherAlertsResponse } from "../../services/weatherService.js";

export default function AlertsWidget() {
  const result = useToolResult();
  const context = useHostContext();

  useDocumentTheme("light", "dark");
  useHostStyleVariables();

  // Handle both wrapped and unwrapped result formats
  const rawResult = result as Record<string, unknown> | undefined;
  const data = (rawResult?.get_weather_alerts ?? rawResult) as WeatherAlertsResponse | undefined;

  if (!data || !("alerts" in data) || !Array.isArray(data.alerts)) {
    return (
      <div className="weather-card flex flex-col items-center justify-center py-12 px-6 text-center">
        <span className="text-6xl mb-4 animate-float">⚠️</span>
        <p className="text-gray-500 dark:text-gray-400">Waiting for alerts data...</p>
      </div>
    );
  }

  const severityColors: Record<string, string> = {
    minor: "border-l-yellow-400",
    moderate: "border-l-orange-500",
    severe: "border-l-red-500",
    extreme: "border-l-purple-600",
  };

  const typeColors: Record<string, string> = {
    warning: "bg-red-500",
    watch: "bg-yellow-500",
    advisory: "bg-blue-500",
  };

  return (
    <div className="widget-container">
      <div className="weather-card">
        <div className="flex items-baseline gap-2 mb-4">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {data.location.name} Alerts
          </h2>
          {data.location.country && (
            <span className="text-sm text-gray-400">{data.location.country}</span>
          )}
        </div>

        {data.alerts.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <span className="text-5xl text-green-500 mb-2">✓</span>
            <p className="text-gray-500 dark:text-gray-400">No active weather alerts</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {data.alerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-4 bg-gray-100 dark:bg-gray-700 rounded-lg border-l-4 ${severityColors[alert.severity] || "border-l-gray-400"}`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded text-white ${typeColors[alert.type] || "bg-gray-500"}`}
                  >
                    {alert.type.toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-400 capitalize">{alert.severity}</span>
                </div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  {alert.headline}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{alert.description}</p>
                <p className="text-xs text-gray-400">
                  {new Date(alert.startTime).toLocaleString()} -{" "}
                  {new Date(alert.endTime).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-400 text-center mt-3">
          Last checked: {new Date(data.lastChecked).toLocaleString()}
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
  name: "Weather Alerts Widget",
  description: "Displays active weather alerts and warnings with severity levels",
  html: "./ui/dist/alerts-widget.html",
  prefersBorder: true,
};
