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
  const data = (rawResult?.getWeatherAlerts ?? rawResult) as WeatherAlertsResponse | undefined;

  // Validate all required fields including location before rendering
  const isValidAlertsData = (d: unknown): d is WeatherAlertsResponse => {
    if (!d || typeof d !== "object") return false;
    const obj = d as Record<string, unknown>;
    if (!("alerts" in obj) || !Array.isArray(obj.alerts)) return false;
    if (!("location" in obj) || typeof obj.location !== "object" || obj.location === null)
      return false;
    const loc = obj.location as Record<string, unknown>;
    if (!("name" in loc) || typeof loc.name !== "string") return false;
    return true;
  };

  if (!isValidAlertsData(data)) {
    return (
      <div className="weather-card waiting">
        <span className="waiting-icon animate-float">⚠️</span>
        <p>Waiting for alerts data...</p>
      </div>
    );
  }

  return (
    <div className="widget-container">
      <div className="weather-card">
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
                className="alert-item"
                style={{
                  borderLeftColor:
                    {
                      minor: "#ffc107",
                      moderate: "#fd7e14",
                      severe: "#dc3545",
                      extreme: "#6f42c1",
                    }[alert.severity] || "#ffc107",
                }}
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

      <footer className="meta">Theme: {context.theme}</footer>
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
