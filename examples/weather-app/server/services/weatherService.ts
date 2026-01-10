/**
 * Weather Service - Uses Open-Meteo API (free, no API key required)
 * Falls back to mock data if API is unavailable
 */

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

// Geocoding using Open-Meteo Geocoding API
async function geocodeLocation(query: string): Promise<Location | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      results?: Array<{
        name: string;
        latitude: number;
        longitude: number;
        country?: string;
        timezone?: string;
      }>;
    };

    if (!data.results || data.results.length === 0) {
      return null;
    }

    const result = data.results[0];
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

// Get current weather from Open-Meteo
async function fetchCurrentWeather(location: Location): Promise<CurrentWeather | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,is_day&timezone=auto`;
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      current: {
        time: string;
        temperature_2m: number;
        relative_humidity_2m: number;
        apparent_temperature: number;
        weather_code: number;
        wind_speed_10m: number;
        wind_direction_10m: number;
        is_day: number;
      };
    };

    const { current } = data;
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

// Get forecast from Open-Meteo
async function fetchForecast(location: Location, days: number): Promise<WeatherForecast | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset&timezone=auto&forecast_days=${days}`;
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      daily: {
        time: string[];
        weather_code: number[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_probability_max: number[];
        wind_speed_10m_max: number[];
        sunrise: string[];
        sunset: string[];
      };
    };

    const { daily } = data;
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

// Mock data generators for fallback/testing
function generateMockLocation(query: string): Location {
  return {
    name: query,
    latitude: 40.7128,
    longitude: -74.006,
    country: "United States",
    timezone: "America/New_York",
  };
}

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
      id: `alert-${Date.now()}-${i}`,
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

// Weather Service Configuration
export interface WeatherServiceConfig {
  useMock?: boolean;
}

// Main Weather Service class
export class WeatherService {
  private useMock: boolean;

  constructor(config: WeatherServiceConfig = {}) {
    this.useMock = config.useMock ?? false;
  }

  async getCurrentWeather(locationQuery: string): Promise<CurrentWeather> {
    if (this.useMock) {
      const location = generateMockLocation(locationQuery);
      return generateMockCurrentWeather(location);
    }

    // Try to geocode the location
    const location = await geocodeLocation(locationQuery);

    if (!location) {
      // Fallback to mock if geocoding fails
      const mockLocation = generateMockLocation(locationQuery);
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

  async getForecast(locationQuery: string, days: number = 7): Promise<WeatherForecast> {
    const safeDays = Math.min(Math.max(days, 1), 16); // Open-Meteo supports up to 16 days

    if (this.useMock) {
      const location = generateMockLocation(locationQuery);
      return generateMockForecast(location, safeDays);
    }

    // Try to geocode the location
    const location = await geocodeLocation(locationQuery);

    if (!location) {
      const mockLocation = generateMockLocation(locationQuery);
      return generateMockForecast(mockLocation, safeDays);
    }

    // Try to fetch real forecast data
    const forecast = await fetchForecast(location, safeDays);

    if (!forecast) {
      return generateMockForecast(location, safeDays);
    }

    return forecast;
  }

  async getAlerts(locationQuery: string): Promise<WeatherAlertsResponse> {
    // Open-Meteo doesn't provide alerts, so we always use mock data
    // In a real app, you'd integrate with a service like NWS or weather.gov
    if (this.useMock) {
      const location = generateMockLocation(locationQuery);
      return generateMockAlerts(location);
    }

    const location = await geocodeLocation(locationQuery);
    const resolvedLocation = location || generateMockLocation(locationQuery);

    return generateMockAlerts(resolvedLocation);
  }
}

// Export a default instance
export const weatherService = new WeatherService();

// Export mock service for testing
export const mockWeatherService = new WeatherService({ useMock: true });
