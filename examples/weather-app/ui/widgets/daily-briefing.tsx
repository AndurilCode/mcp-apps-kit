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
      <div className="weather-card flex flex-col items-center justify-center py-12 px-6 text-center">
        <span className="text-6xl mb-4 animate-float">📋</span>
        <p className="text-gray-500 dark:text-gray-400">Waiting for briefing data...</p>
      </div>
    );
  }

  return (
    <div className="widget-container">
      <div className="weather-card">
        <div className="flex items-baseline gap-2 mb-4">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Daily Briefing
          </h2>
          <span className="text-sm text-gray-400">{data.location}</span>
        </div>

        <pre className="font-sans text-sm leading-relaxed text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 p-4 rounded-lg whitespace-pre-wrap break-words overflow-x-auto">
          {data.briefing}
        </pre>

        {data.hasAlerts && (
          <div className="flex items-center gap-2 p-3 mt-3 bg-red-500/10 rounded-lg text-red-500 text-sm font-medium">
            <span className="text-xl">⚠️</span>
            <span>Active weather alerts in this area</span>
          </div>
        )}

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
  name: "Daily Briefing Widget",
  description:
    "Displays comprehensive daily weather briefing with current conditions, forecast, and alerts",
  html: "./ui/dist/daily-briefing-widget.html",
  prefersBorder: true,
};
