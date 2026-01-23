/**
 * Daily Briefing Widget
 *
 * React component for displaying daily weather briefing.
 * Built by vite plugin into self-contained HTML.
 */

import React from "react";
import {
  useToolResult,
  useHostContext,
  useDocumentTheme,
  useHostStyleVariables,
} from "@mcp-apps-kit/ui-react";

interface DailyBriefingResult {
  location: string;
  briefing: string;
  hasAlerts: boolean;
  generatedAt: string;
}

export default function DailyBriefingWidget() {
  const result = useToolResult();
  const context = useHostContext();

  useDocumentTheme("light", "dark");
  useHostStyleVariables();

  // Handle both wrapped and unwrapped result formats
  const rawResult = result as Record<string, unknown> | undefined;
  const data = (rawResult?.daily_briefing ?? rawResult) as DailyBriefingResult | undefined;

  if (!data || !("briefing" in data) || typeof data.briefing !== "string") {
    return (
      <div className="waiting">
        <span className="loading-icon">📋</span>
        <p>Waiting for briefing data...</p>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="weather-card daily-briefing">
        <div className="weather-header">
          <h2>Daily Briefing</h2>
          <span className="country">{data.location}</span>
        </div>

        <pre className="briefing-content">{data.briefing}</pre>

        {data.hasAlerts && (
          <div className="briefing-alert-indicator">
            <span className="alert-icon">⚠️</span>
            <span>Active weather alerts in this area</span>
          </div>
        )}

        <p className="timestamp">Generated: {new Date(data.generatedAt).toLocaleString()}</p>
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
  name: "Daily Briefing Widget",
  description:
    "Displays comprehensive daily weather briefing with current conditions, forecast, and alerts",
  html: "./ui/dist/daily-briefing-widget.html",
  prefersBorder: true,
};
