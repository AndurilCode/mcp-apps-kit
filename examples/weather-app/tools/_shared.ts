/**
 * Shared utilities and services for weather tools
 *
 * Files prefixed with _ are not scanned as tools.
 */

import { z } from "zod";
import { WeatherService } from "../services/weatherService.js";

// Initialize weather service (uses real API by default, falls back to mock)
export const weatherService = new WeatherService({
  useMock: process.env.USE_MOCK_WEATHER === "true",
});

// =============================================================================
// SHARED SCHEMAS
// =============================================================================

export const locationSchema = z.object({
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  country: z.string().optional(),
  timezone: z.string().optional(),
});

export const currentWeatherOutputSchema = z.object({
  location: locationSchema,
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

export const dailyForecastSchema = z.object({
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

export const forecastOutputSchema = z.object({
  location: locationSchema,
  daily: z.array(dailyForecastSchema),
  generatedAt: z.string(),
});

export const alertSchema = z.object({
  id: z.string(),
  type: z.enum(["warning", "watch", "advisory"]),
  severity: z.enum(["minor", "moderate", "severe", "extreme"]),
  headline: z.string(),
  description: z.string(),
  startTime: z.string(),
  endTime: z.string(),
});

export const alertsOutputSchema = z.object({
  location: locationSchema,
  alerts: z.array(alertSchema),
  lastChecked: z.string(),
});
