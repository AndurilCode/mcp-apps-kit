/**
 * Weather App - MCP Server
 *
 * Demonstrates weather-related tools using Open-Meteo API (free, no API key required)
 * with mock data fallback for testing and offline usage.
 */

import { createApp, defineTool, defineUI, type ClientToolsFromCore } from "@mcp-apps-kit/core";
import { z } from "zod";
import {
  WeatherService,
  type CurrentWeather,
  type WeatherForecast,
  type WeatherAlertsResponse,
} from "./services/weatherService.js";

// Initialize weather service (uses real API by default, falls back to mock)
const weatherService = new WeatherService({
  useMock: process.env.USE_MOCK_WEATHER === "true",
});

// Define UIs for weather widgets
const currentWeatherUI = defineUI({
  name: "Current Weather Widget",
  description: "Displays current weather conditions",
  html: "./ui/dist/index.html",
  prefersBorder: true,
});

const forecastUI = defineUI({
  name: "Weather Forecast Widget",
  description: "Displays weather forecast",
  html: "./ui/dist/index.html",
  prefersBorder: true,
});

const alertsUI = defineUI({
  name: "Weather Alerts Widget",
  description: "Displays weather alerts and warnings",
  html: "./ui/dist/index.html",
  prefersBorder: true,
});

// Schema definitions
const currentWeatherOutputSchema = z.object({
  location: z.object({
    name: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    country: z.string().optional(),
    timezone: z.string().optional(),
  }),
  temperature: z.number().describe("Temperature in Celsius"),
  feelsLike: z.number().describe("Feels like temperature in Celsius"),
  humidity: z.number().describe("Relative humidity percentage"),
  windSpeed: z.number().describe("Wind speed in km/h"),
  windDirection: z.number().describe("Wind direction in degrees"),
  weatherCode: z.number(),
  description: z.string(),
  icon: z.string(),
  isDay: z.boolean(),
  timestamp: z.string(),
});

const dailyForecastSchema = z.object({
  date: z.string(),
  temperatureMax: z.number(),
  temperatureMin: z.number(),
  weatherCode: z.number(),
  description: z.string(),
  icon: z.string(),
  precipitationProbability: z.number(),
  windSpeedMax: z.number(),
  sunrise: z.string(),
  sunset: z.string(),
});

const forecastOutputSchema = z.object({
  location: z.object({
    name: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    country: z.string().optional(),
    timezone: z.string().optional(),
  }),
  daily: z.array(dailyForecastSchema),
  generatedAt: z.string(),
});

const alertSchema = z.object({
  id: z.string(),
  type: z.enum(["warning", "watch", "advisory"]),
  severity: z.enum(["minor", "moderate", "severe", "extreme"]),
  headline: z.string(),
  description: z.string(),
  startTime: z.string(),
  endTime: z.string(),
});

const alertsOutputSchema = z.object({
  location: z.object({
    name: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    country: z.string().optional(),
    timezone: z.string().optional(),
  }),
  alerts: z.array(alertSchema),
  lastChecked: z.string(),
});

// Create the MCP App
const app = createApp({
  name: "weather-app",
  version: "0.1.0",

  config: {
    protocol: "mcp",
  },

  tools: {
    getCurrentWeather: defineTool({
      title: "Get Current Weather",
      description:
        "Get the current weather conditions for a specified location. Returns temperature, humidity, wind, and conditions.",
      input: z.object({
        location: z
          .string()
          .describe(
            "City name, address, or location to get weather for (e.g., 'New York', 'Tokyo', 'London, UK')"
          ),
      }),
      output: currentWeatherOutputSchema,
      visibility: "both",
      annotations: {
        readOnlyHint: true,
      },
      handler: async ({ location }): Promise<CurrentWeather> => {
        return await weatherService.getCurrentWeather(location);
      },
      ui: currentWeatherUI,
    }),

    getForecast: defineTool({
      title: "Get Weather Forecast",
      description:
        "Get a multi-day weather forecast for a specified location. Returns daily forecasts with temperatures, precipitation, and conditions.",
      input: z.object({
        location: z.string().describe("City name, address, or location to get forecast for"),
        days: z
          .number()
          .min(1)
          .max(16)
          .default(7)
          .describe("Number of days to forecast (1-16, default: 7)"),
      }),
      output: forecastOutputSchema,
      visibility: "both",
      annotations: {
        readOnlyHint: true,
      },
      handler: async ({ location, days }): Promise<WeatherForecast> => {
        return await weatherService.getForecast(location, days);
      },
      ui: forecastUI,
    }),

    getWeatherAlerts: defineTool({
      title: "Get Weather Alerts",
      description:
        "Get active weather alerts and warnings for a specified location. Returns any watches, warnings, or advisories in effect.",
      input: z.object({
        location: z.string().describe("City name, address, or location to check for alerts"),
      }),
      output: alertsOutputSchema,
      visibility: "both",
      annotations: {
        readOnlyHint: true,
      },
      handler: async ({ location }): Promise<WeatherAlertsResponse> => {
        return await weatherService.getAlerts(location);
      },
      ui: alertsUI,
    }),
  },
});

// Export types for UI components
export type AppToolsDef = {
  getCurrentWeather: typeof app.tools.getCurrentWeather;
  getForecast: typeof app.tools.getForecast;
  getWeatherAlerts: typeof app.tools.getWeatherAlerts;
};
export type AppTools = ClientToolsFromCore<AppToolsDef>;

// Start server (skip in test environment)
if (process.env.NODE_ENV !== "test") {
  const port = parseInt(process.env.PORT || "3005", 10);
  await app.start({ port });
  console.log(`Weather App MCP server running on http://localhost:${port}`);
}

// Export app for testing
export { app };
