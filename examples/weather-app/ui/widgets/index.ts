/**
 * Weather App UI Widgets - Build Entry Point
 *
 * This file imports all widget components for the vite plugin to discover
 * and build into self-contained HTML files.
 *
 * Each widget file exports:
 * - default: React component (used here for building)
 * - ui: defineUI config (used by codegen for convention-based binding)
 */

import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";

// Import components from widget files
import CurrentWeatherWidget from "./get-current-weather";
import ForecastWidget from "./get-forecast";
import AlertsWidget from "./get-weather-alerts";
import DailyBriefingWidget from "./daily-briefing";

// Define React UIs for vite plugin to build
export const currentWeatherUI = defineReactUI({
  component: CurrentWeatherWidget,
  name: "Current Weather Widget",
  description: "Displays current weather conditions with temperature, humidity, and wind",
  prefersBorder: true,
});

export const forecastUI = defineReactUI({
  component: ForecastWidget,
  name: "Weather Forecast Widget",
  description: "Displays multi-day weather forecast with daily temperatures and conditions",
  prefersBorder: true,
});

export const alertsUI = defineReactUI({
  component: AlertsWidget,
  name: "Weather Alerts Widget",
  description: "Displays active weather alerts and warnings with severity levels",
  prefersBorder: true,
});

export const dailyBriefingUI = defineReactUI({
  component: DailyBriefingWidget,
  name: "Daily Briefing Widget",
  description:
    "Displays comprehensive daily weather briefing with current conditions, forecast, and alerts",
  prefersBorder: true,
});
