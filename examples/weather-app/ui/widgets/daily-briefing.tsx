/**
 * Daily Briefing Widget
 *
 * React component for displaying daily weather briefing.
 * Built by vite plugin into self-contained HTML.
 */

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
  const data = (rawResult?.dailyBriefing ?? rawResult) as DailyBriefingResult | undefined;

  // Validate all required fields before rendering
  const isValidData = (d: unknown): d is DailyBriefingResult => {
    if (!d || typeof d !== "object") return false;
    const obj = d as Record<string, unknown>;
    if (!("briefing" in obj) || typeof obj.briefing !== "string") return false;
    if (!("location" in obj) || typeof obj.location !== "string") return false;
    if (!("generatedAt" in obj)) return false;
    // Validate generatedAt is a parsable date
    const date = new Date(obj.generatedAt as string | number);
    if (isNaN(date.getTime())) return false;
    return true;
  };

  if (!isValidData(data)) {
    return (
      <div className="weather-card waiting">
        <span className="waiting-icon animate-float">📋</span>
        <p>Waiting for briefing data...</p>
      </div>
    );
  }

  return (
    <div className="widget-container">
      <div className="weather-card">
        <div className="weather-header">
          <h2>Daily Briefing</h2>
          <span className="country">{data.location}</span>
        </div>

        <pre className="briefing-content">{data.briefing}</pre>

        {data.hasAlerts && (
          <div className="alert-banner">
            <span>⚠️</span>
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
/**
 * UI metadata for convention-based binding.
 * The html path is auto-inferred from the file name.
 */
import type { WidgetMetadata } from "@mcp-apps-kit/core";

export const ui: WidgetMetadata = {
  name: "Daily Briefing Widget",
  description:
    "Displays comprehensive daily weather briefing with current conditions, forecast, and alerts",
  prefersBorder: true,
};
