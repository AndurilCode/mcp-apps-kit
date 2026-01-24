/**
 * Daily Weather Briefing Tool
 *
 * A workflow-based tool that combines current weather, 3-day forecast,
 * and alerts into a comprehensive morning weather briefing.
 *
 * Demonstrates the new ergonomic fluent builder API for workflows.
 */

import { tool } from "@mcp-apps-kit/core";
import { z } from "zod";
import { weatherService } from "../tools/_shared.js";

// Using tool.describe() - name "dailyBriefing" is inferred from filename
export default tool
  .describe(
    "Generate a comprehensive daily weather briefing combining current conditions, 3-day forecast, and any active alerts for a location."
  )
  .title("Daily Weather Briefing")
  .input({
    location: z.string().describe("City or location for the weather briefing"),
  })
  .output(
    z.object({
      location: z.string(),
      briefing: z.string(),
      hasAlerts: z.boolean(),
      generatedAt: z.string(),
    })
  )
  .visibility("both")
  .readOnly()
  .handle(async ({ location }) => {
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
  });
// Note: .build() is now optional - codegen will auto-build using ensureBuilt()
