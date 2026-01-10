/**
 * Weather Service - Uses Open-Meteo API (free, no API key required)
 * Falls back to mock data if API is unavailable
 */

import { randomUUID } from "crypto";
import { z } from "zod";

// Weather code descriptions from Open-Meteo
const WEATHER_CODES: Record<number, { description: string; icon: string }> = {
  0: { description: "Clear sky", icon: "☀️" },
  1: { description: "Mainly clear", icon: "🌤️" },
  2: { description: "Partly cloudy", icon: "⛅" },
  3: { description: "Overcast", icon: "☁️" },
  45: { description: "Fog", icon: "🌫️" },
  48: { description: "Depositing rime fog", icon: "🌫️" },
  51: { description: "Light drizzle", icon: "🌧️" },
  53: { description: "Moderate drizzle", icon: "🌧️" },
  55: { description: "Dense drizzle", icon: "🌧️" },
  61: { description: "Slight rain", icon: "🌧️" },
  63: { description: "Moderate rain", icon: "🌧️" },
  65: { description: "Heavy rain", icon: "🌧️" },
  66: { description: "Light freezing rain", icon: "🌨️" },
  67: { description: "Heavy freezing rain", icon: "🌨️" },
  71: { description: "Slight snow", icon: "❄️" },
  73: { description: "Moderate snow", icon: "❄️" },
  75: { description: "Heavy snow", icon: "❄️" },
  77: { description: "Snow grains", icon: "❄️" },
  80: { description: "Slight rain showers", icon: "🌦️" },
  81: { description: "Moderate rain showers", icon: "🌦️" },
  82: { description: "Violent rain showers", icon: "🌦️" },
  85: { description: "Slight snow showers", icon: "🌨️" },
  86: { description: "Heavy snow showers", icon: "🌨️" },
  95: { description: "Thunderstorm", icon: "⛈️" },
  96: { description: "Thunderstorm with slight hail", icon: "⛈️" },
  99: { description: "Thunderstorm with heavy hail", icon: "⛈️" },
};

// Zod schemas for API response validation
const GeocodingResultSchema = z.object({
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  country: z.string().optional(),
  timezone: z.string().optional(),
});

const GeocodingResponseSchema = z.object({
  results: z.array(GeocodingResultSchema).optional(),
});

const CurrentWeatherApiSchema = z.object({
  current: z.object({
    time: z.string(),
    temperature_2m: z.number(),
    relative_humidity_2m: z.number(),
    apparent_temperature: z.number(),
    weather_code: z.number(),
    wind_speed_10m: z.number(),
    wind_direction_10m: z.number(),
    is_day: z.number(),
  }),
});

const ForecastApiSchema = z.object({
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(z.number()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    precipitation_probability_max: z.array(z.number()),
    wind_speed_10m_max: z.array(z.number()),
    sunrise: z.array(z.string()),
    sunset: z.array(z.string()),
  }),
});

export interface Location {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  timezone?: string;
}

export interface CurrentWeather {
  location: Location;
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  weatherCode: number;
  description: string;
  icon: string;
  isDay: boolean;
  timestamp: string;
}

export interface DailyForecast {
  date: string;
  temperatureMax: number;
  temperatureMin: number;
  weatherCode: number;
  description: string;
  icon: string;
  precipitationProbability: number;
  windSpeedMax: number;
  sunrise: string;
  sunset: string;
}

export interface WeatherForecast {
  location: Location;
  daily: DailyForecast[];
  generatedAt: string;
}

export interface WeatherAlert {
  id: string;
  type: "warning" | "watch" | "advisory";
  severity: "minor" | "moderate" | "severe" | "extreme";
  headline: string;
  description: string;
  startTime: string;
  endTime: string;
}

export interface WeatherAlertsResponse {
  location: Location;
  alerts: WeatherAlert[];
  lastChecked: string;
}

/**
 * Geocode a location query to coordinates using Open-Meteo Geocoding API
 */
async function geocodeLocation(query: string): Promise<Location | null> {
  try {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", query);
    url.searchParams.set("count", "1");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");

    const response = await fetch(url.toString());

    if (!response.ok) {
      return null;
    }

    const rawData: unknown = await response.json();
    const parseResult = GeocodingResponseSchema.safeParse(rawData);

    if (!parseResult.success || !parseResult.data.results?.length) {
      return null;
    }

    const result = parseResult.data.results[0];
    return {
      name: result.name,
      latitude: result.latitude,
      longitude: result.longitude,
      country: result.country,
      timezone: result.timezone,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch current weather from Open-Meteo API
 */
async function fetchCurrentWeather(location: Location): Promise<CurrentWeather | null> {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(location.latitude));
    url.searchParams.set("longitude", String(location.longitude));
    url.searchParams.set(
      "current",
      "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,is_day"
    );
    url.searchParams.set("timezone", "auto");

    const response = await fetch(url.toString());

    if (!response.ok) {
      return null;
    }

    const rawData: unknown = await response.json();
    const parseResult = CurrentWeatherApiSchema.safeParse(rawData);

    if (!parseResult.success) {
      return null;
    }

    const { current } = parseResult.data;
    const weatherInfo = WEATHER_CODES[current.weather_code] || {
      description: "Unknown",
      icon: "❓",
    };

    return {
      location,
      temperature: current.temperature_2m,
      feelsLike: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      windSpeed: current.wind_speed_10m,
      windDirection: current.wind_direction_10m,
      weatherCode: current.weather_code,
      description: weatherInfo.description,
      icon: weatherInfo.icon,
      isDay: current.is_day === 1,
      timestamp: current.time,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch forecast from Open-Meteo API
 */
async function fetchForecast(location: Location, days: number): Promise<WeatherForecast | null> {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(location.latitude));
    url.searchParams.set("longitude", String(location.longitude));
    url.searchParams.set(
      "daily",
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset"
    );
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("forecast_days", String(days));

    const response = await fetch(url.toString());

    if (!response.ok) {
      return null;
    }

    const rawData: unknown = await response.json();
    const parseResult = ForecastApiSchema.safeParse(rawData);

    if (!parseResult.success) {
      return null;
    }

    const { daily } = parseResult.data;
    const forecasts: DailyForecast[] = daily.time.map((date, i) => {
      const weatherInfo = WEATHER_CODES[daily.weather_code[i]] || {
        description: "Unknown",
        icon: "❓",
      };

      return {
        date,
        temperatureMax: daily.temperature_2m_max[i],
        temperatureMin: daily.temperature_2m_min[i],
        weatherCode: daily.weather_code[i],
        description: weatherInfo.description,
        icon: weatherInfo.icon,
        precipitationProbability: daily.precipitation_probability_max[i],
        windSpeedMax: daily.wind_speed_10m_max[i],
        sunrise: daily.sunrise[i],
        sunset: daily.sunset[i],
      };
    });

    return {
      location,
      daily: forecasts,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// Mock location lookup table for varied coordinates
const MOCK_LOCATIONS: Record<string, { lat: number; lon: number; country: string; tz: string }> = {
  "new york": { lat: 40.7128, lon: -74.006, country: "United States", tz: "America/New_York" },
  london: { lat: 51.5074, lon: -0.1278, country: "United Kingdom", tz: "Europe/London" },
  tokyo: { lat: 35.6762, lon: 139.6503, country: "Japan", tz: "Asia/Tokyo" },
  paris: { lat: 48.8566, lon: 2.3522, country: "France", tz: "Europe/Paris" },
  sydney: { lat: -33.8688, lon: 151.2093, country: "Australia", tz: "Australia/Sydney" },
  berlin: { lat: 52.52, lon: 13.405, country: "Germany", tz: "Europe/Berlin" },
  chicago: { lat: 41.8781, lon: -87.6298, country: "United States", tz: "America/Chicago" },
  miami: { lat: 25.7617, lon: -80.1918, country: "United States", tz: "America/New_York" },
  seattle: { lat: 47.6062, lon: -122.3321, country: "United States", tz: "America/Los_Angeles" },
  madrid: { lat: 40.4168, lon: -3.7038, country: "Spain", tz: "Europe/Madrid" },
  rome: { lat: 41.9028, lon: 12.4964, country: "Italy", tz: "Europe/Rome" },
};

/**
 * Generate a hash code from a string for consistent mock data
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Generate mock location with varied coordinates based on query
 */
function generateMockLocation(query: string): Location {
  const normalizedQuery = query.toLowerCase().trim();

  // Check lookup table first
  const knownLocation = MOCK_LOCATIONS[normalizedQuery];
  if (knownLocation) {
    return {
      name: query,
      latitude: knownLocation.lat,
      longitude: knownLocation.lon,
      country: knownLocation.country,
      timezone: knownLocation.tz,
    };
  }

  // Generate varied coordinates based on location name hash
  const hash = hashCode(normalizedQuery);
  const latRange = 140; // -70 to 70
  const lonRange = 360; // -180 to 180

  return {
    name: query,
    latitude: (hash % latRange) - 70 + (hash % 100) / 100,
    longitude: ((hash >> 8) % lonRange) - 180 + ((hash >> 4) % 100) / 100,
    country: "Unknown",
    timezone: "UTC",
  };
}

/**
 * Generate mock current weather data
 */
function generateMockCurrentWeather(location: Location): CurrentWeather {
  const codes = [0, 1, 2, 3, 61, 80];
  const weatherCode = codes[Math.floor(Math.random() * codes.length)];
  const weatherInfo = WEATHER_CODES[weatherCode];

  return {
    location,
    temperature: Math.round((Math.random() * 30 + 5) * 10) / 10,
    feelsLike: Math.round((Math.random() * 30 + 5) * 10) / 10,
    humidity: Math.floor(Math.random() * 60 + 30),
    windSpeed: Math.round(Math.random() * 20 * 10) / 10,
    windDirection: Math.floor(Math.random() * 360),
    weatherCode,
    description: weatherInfo.description,
    icon: weatherInfo.icon,
    isDay: new Date().getHours() >= 6 && new Date().getHours() < 20,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate mock forecast data
 */
function generateMockForecast(location: Location, days: number): WeatherForecast {
  const forecasts: DailyForecast[] = [];
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);

    const codes = [0, 1, 2, 3, 61, 80];
    const weatherCode = codes[Math.floor(Math.random() * codes.length)];
    const weatherInfo = WEATHER_CODES[weatherCode];

    const tempMax = Math.round((Math.random() * 15 + 15) * 10) / 10;
    const tempMin = Math.round((tempMax - Math.random() * 10 - 5) * 10) / 10;

    forecasts.push({
      date: date.toISOString().split("T")[0],
      temperatureMax: tempMax,
      temperatureMin: tempMin,
      weatherCode,
      description: weatherInfo.description,
      icon: weatherInfo.icon,
      precipitationProbability: Math.floor(Math.random() * 100),
      windSpeedMax: Math.round(Math.random() * 30 * 10) / 10,
      sunrise: `${date.toISOString().split("T")[0]}T06:30:00`,
      sunset: `${date.toISOString().split("T")[0]}T19:30:00`,
    });
  }

  return {
    location,
    daily: forecasts,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate mock weather alerts
 */
function generateMockAlerts(location: Location): WeatherAlertsResponse {
  // Randomly generate 0-2 alerts for demo purposes
  const alertCount = Math.floor(Math.random() * 3);
  const alerts: WeatherAlert[] = [];

  const alertTypes: Array<{
    type: WeatherAlert["type"];
    severity: WeatherAlert["severity"];
    headline: string;
  }> = [
    { type: "warning", severity: "moderate", headline: "Wind Advisory" },
    { type: "watch", severity: "minor", headline: "Frost Watch" },
    { type: "advisory", severity: "minor", headline: "Dense Fog Advisory" },
    { type: "warning", severity: "severe", headline: "Thunderstorm Warning" },
  ];

  for (let i = 0; i < alertCount; i++) {
    const alertInfo = alertTypes[Math.floor(Math.random() * alertTypes.length)];
    const now = new Date();
    const endTime = new Date(now);
    endTime.setHours(endTime.getHours() + Math.floor(Math.random() * 24) + 6);

    alerts.push({
      id: randomUUID(),
      type: alertInfo.type,
      severity: alertInfo.severity,
      headline: alertInfo.headline,
      description: `${alertInfo.headline} in effect for ${location.name}. Take appropriate precautions.`,
      startTime: now.toISOString(),
      endTime: endTime.toISOString(),
    });
  }

  return {
    location,
    alerts,
    lastChecked: new Date().toISOString(),
  };
}

/** Weather Service Configuration */
export interface WeatherServiceConfig {
  useMock?: boolean;
}

/**
 * Weather Service class providing weather data from Open-Meteo API
 * with automatic fallback to mock data on failure
 */
export class WeatherService {
  private useMock: boolean;

  constructor(config: WeatherServiceConfig = {}) {
    this.useMock = config.useMock ?? false;
  }

  /**
   * Get current weather for a location
   * @param locationQuery - City name, address, or location query
   * @throws Error if location query is empty
   */
  async getCurrentWeather(locationQuery: string): Promise<CurrentWeather> {
    const trimmedQuery = locationQuery?.trim();
    if (!trimmedQuery) {
      throw new Error("Location query cannot be empty");
    }

    if (this.useMock) {
      const location = generateMockLocation(trimmedQuery);
      return generateMockCurrentWeather(location);
    }

    // Try to geocode the location
    const location = await geocodeLocation(trimmedQuery);

    if (!location) {
      // Fallback to mock if geocoding fails
      const mockLocation = generateMockLocation(trimmedQuery);
      return generateMockCurrentWeather(mockLocation);
    }

    // Try to fetch real weather data
    const weather = await fetchCurrentWeather(location);

    if (!weather) {
      // Fallback to mock if API fails
      return generateMockCurrentWeather(location);
    }

    return weather;
  }

  /**
   * Get weather forecast for a location
   * @param locationQuery - City name, address, or location query
   * @param days - Number of days to forecast (1-16)
   * @throws Error if location query is empty
   */
  async getForecast(locationQuery: string, days: number = 7): Promise<WeatherForecast> {
    const trimmedQuery = locationQuery?.trim();
    if (!trimmedQuery) {
      throw new Error("Location query cannot be empty");
    }

    const safeDays = Math.min(Math.max(days, 1), 16); // Open-Meteo supports up to 16 days

    if (this.useMock) {
      const location = generateMockLocation(trimmedQuery);
      return generateMockForecast(location, safeDays);
    }

    // Try to geocode the location
    const location = await geocodeLocation(trimmedQuery);

    if (!location) {
      const mockLocation = generateMockLocation(trimmedQuery);
      return generateMockForecast(mockLocation, safeDays);
    }

    // Try to fetch real forecast data
    const forecast = await fetchForecast(location, safeDays);

    if (!forecast) {
      return generateMockForecast(location, safeDays);
    }

    return forecast;
  }

  /**
   * Get weather alerts for a location
   * @param locationQuery - City name, address, or location query
   * @throws Error if location query is empty
   */
  async getAlerts(locationQuery: string): Promise<WeatherAlertsResponse> {
    const trimmedQuery = locationQuery?.trim();
    if (!trimmedQuery) {
      throw new Error("Location query cannot be empty");
    }

    // Open-Meteo doesn't provide alerts, so we always use mock data
    // In a real app, you'd integrate with a service like NWS or weather.gov
    if (this.useMock) {
      const location = generateMockLocation(trimmedQuery);
      return generateMockAlerts(location);
    }

    const location = await geocodeLocation(trimmedQuery);
    const resolvedLocation = location || generateMockLocation(trimmedQuery);

    return generateMockAlerts(resolvedLocation);
  }
}

/** Default weather service instance */
export const weatherService = new WeatherService();

/** Mock weather service for testing */
export const mockWeatherService = new WeatherService({ useMock: true });
