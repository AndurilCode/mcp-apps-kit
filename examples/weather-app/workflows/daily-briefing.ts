/**
 * Daily Weather Briefing Tool
 *
 * A workflow-based tool that combines current weather, 3-day forecast,
 * and alerts into a comprehensive morning weather briefing.
 *
 * Demonstrates how workflows are registered as tools in file-based apps.
 */

import { defineTool, defineUI } from "@mcp-apps-kit/core";
import { z } from "zod";
import { weatherService } from "../tools/_shared.js";

// UI for displaying the daily briefing
const dailyBriefingUI = defineUI({
  name: "Daily Briefing Widget",
  description:
    "Displays comprehensive daily weather briefing with current conditions, forecast, and alerts",
  html: "./ui/dist/index.html",
  prefersBorder: true,
});

export default defineTool({
  title: "Daily Weather Briefing",
  description:
    "Generate a comprehensive daily weather briefing combining current conditions, 3-day forecast, and any active alerts for a location.",
  input: z.object({
    location: z.string().describe("City or location for the weather briefing"),
  }),
  output: z.object({
    location: z.string(),
    briefing: z.string(),
    hasAlerts: z.boolean(),
    generatedAt: z.string(),
  }),
  visibility: "both",
  annotations: {
    readOnlyHint: true,
  },
  ui: dailyBriefingUI,
  handler: async ({ location }) => {
    // Fetch all weather data in parallel
    const [current, forecast, alerts] = await Promise.all([
      weatherService.getCurrentWeather(location),
      weatherService.getForecast(location, 3),
      weatherService.getAlerts(location),
    ]);

    // Format alerts section
    const alertsSection =
      alerts.alerts.length > 0
        ? `\n\n⚠️ ACTIVE ALERTS:\n${alerts.alerts.map((a) => `- ${a.headline}: ${a.description}`).join("\n")}`
        : "";

    // Format forecast section
    const forecastSection = forecast.daily
      .map(
        (day) =>
          `  ${day.date}: ${day.icon} ${day.temperatureMax}°/${day.temperatureMin}° - ${day.description}`
      )
      .join("\n");

    // Compose the full briefing
    const briefing = `
🌤️ WEATHER BRIEFING FOR ${current.location.name.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📍 Current Conditions (${current.timestamp})
   ${current.icon} ${current.temperature}°C (feels like ${current.feelsLike}°C)
   ${current.description}
   💨 Wind: ${current.windSpeed} km/h
   💧 Humidity: ${current.humidity}%

📅 3-Day Forecast:
${forecastSection}${alertsSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `.trim();

    return {
      location: current.location.name,
      briefing,
      hasAlerts: alerts.alerts.length > 0,
      generatedAt: new Date().toISOString(),
    };
  },
});
