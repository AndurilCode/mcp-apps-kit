import { z } from "zod";
import { AppError, ErrorCode } from "@mcp-apps-kit/core";

export type FetchFn = typeof fetch;

export const weatherInputSchema = z
  .object({
    /**
     * Human-readable location name (e.g. "San Francisco").
     * If provided, we geocode to lat/lon.
     */
    location: z.string().min(1).optional(),
    /** Latitude in degrees (use with longitude). */
    latitude: z.number().min(-90).max(90).optional(),
    /** Longitude in degrees (use with latitude). */
    longitude: z.number().min(-180).max(180).optional(),
    /** Number of forecast days to return (1-7). */
    days: z.number().int().min(1).max(7).default(3),
  })
  .refine(
    (v) => {
      const hasName = typeof v.location === "string" && v.location.length > 0;
      const hasCoords = typeof v.latitude === "number" && typeof v.longitude === "number";
      return hasName || hasCoords;
    },
    {
      message: 'Provide either "location" or both "latitude" and "longitude".',
      path: ["location"],
    }
  );

export const weatherOutputSchema = z.object({
  source: z.literal("open-meteo"),
  location: z.object({
    name: z.string().optional(),
    latitude: z.number(),
    longitude: z.number(),
    timezone: z.string(),
  }),
  current: z.object({
    time: z.string(),
    temperatureC: z.number(),
    windSpeedKph: z.number().optional(),
    weatherCode: z.number().int().optional(),
  }),
  daily: z.array(
    z.object({
      date: z.string(),
      tempMinC: z.number(),
      tempMaxC: z.number(),
      weatherCode: z.number().int().optional(),
    })
  ),
});

export type WeatherInput = z.infer<typeof weatherInputSchema>;
export type WeatherOutput = z.infer<typeof weatherOutputSchema>;

const geocodingResponseSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        country: z.string().optional(),
        admin1: z.string().optional(),
        timezone: z.string().optional(),
      })
    )
    .optional(),
});

const forecastResponseSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
  current: z
    .object({
      time: z.string(),
      temperature_2m: z.number(),
      wind_speed_10m: z.number().optional(),
      weather_code: z.number().int().optional(),
    })
    .optional(),
  daily: z
    .object({
      time: z.array(z.string()),
      temperature_2m_min: z.array(z.number()),
      temperature_2m_max: z.array(z.number()),
      weather_code: z.array(z.number().int()).optional(),
    })
    .optional(),
});

async function fetchJson(fetchFn: FetchFn, url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchFn(url, {
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new AppError(
      ErrorCode.TOOL_EXECUTION_ERROR,
      "Failed to reach weather service.",
      { url },
      error instanceof Error ? error : undefined
    );
  }

  if (!res.ok) {
    throw new AppError(ErrorCode.TOOL_EXECUTION_ERROR, "Weather service returned an error.", {
      url,
      status: res.status,
    });
  }

  try {
    return (await res.json()) as unknown;
  } catch (error) {
    throw new AppError(
      ErrorCode.TOOL_EXECUTION_ERROR,
      "Weather service returned invalid JSON.",
      { url },
      error instanceof Error ? error : undefined
    );
  }
}

function formatResolvedName(place: { name: string; admin1?: string; country?: string }): string {
  const parts = [place.name, place.admin1, place.country].filter(
    (p): p is string => typeof p === "string" && p.length > 0
  );
  return parts.join(", ");
}

export async function getWeather(fetchFn: FetchFn, input: WeatherInput): Promise<WeatherOutput> {
  const days = input.days;
  let latitude: number;
  let longitude: number;
  let name: string | undefined;
  let timezone: string | undefined;

  if (input.location) {
    const q = encodeURIComponent(input.location);
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=1&language=en&format=json`;
    const geoRaw = await fetchJson(fetchFn, geoUrl);
    const geo = geocodingResponseSchema.safeParse(geoRaw);
    if (!geo.success) {
      throw new AppError(
        ErrorCode.TOOL_EXECUTION_ERROR,
        "Weather geocoding returned an unexpected shape."
      );
    }

    const first = geo.data.results?.[0];
    if (!first) {
      throw new AppError(ErrorCode.INVALID_INPUT, `Location not found: "${input.location}"`);
    }

    latitude = first.latitude;
    longitude = first.longitude;
    name = formatResolvedName(first);
    timezone = first.timezone;
  } else {
    if (typeof input.latitude !== "number" || typeof input.longitude !== "number") {
      // Should be prevented by schema refine, but keep runtime safety.
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        'Provide either "location" or both "latitude" and "longitude".'
      );
    }
    latitude = input.latitude;
    longitude = input.longitude;
  }

  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(String(latitude))}` +
    `&longitude=${encodeURIComponent(String(longitude))}` +
    `&current=temperature_2m,wind_speed_10m,weather_code` +
    `&daily=temperature_2m_min,temperature_2m_max,weather_code` +
    `&timezone=auto` +
    `&forecast_days=${encodeURIComponent(String(days))}`;

  const forecastRaw = await fetchJson(fetchFn, forecastUrl);
  const forecastParsed = forecastResponseSchema.safeParse(forecastRaw);
  if (!forecastParsed.success) {
    throw new AppError(
      ErrorCode.TOOL_EXECUTION_ERROR,
      "Weather forecast returned an unexpected shape."
    );
  }

  const forecast = forecastParsed.data;
  const current = forecast.current;
  const daily = forecast.daily;
  if (!current || !daily) {
    throw new AppError(
      ErrorCode.TOOL_EXECUTION_ERROR,
      "Weather forecast response was missing fields."
    );
  }

  const tz = timezone ?? forecast.timezone;

  const out: WeatherOutput = {
    source: "open-meteo",
    location: {
      name,
      latitude: forecast.latitude,
      longitude: forecast.longitude,
      timezone: tz,
    },
    current: {
      time: current.time,
      temperatureC: current.temperature_2m,
      windSpeedKph: current.wind_speed_10m,
      weatherCode: current.weather_code,
    },
    daily: daily.time.slice(0, days).map((date, i) => ({
      date,
      tempMinC: daily.temperature_2m_min[i] ?? Number.NaN,
      tempMaxC: daily.temperature_2m_max[i] ?? Number.NaN,
      weatherCode: daily.weather_code?.[i],
    })),
  };

  // Guard against weird array lengths
  for (const d of out.daily) {
    if (Number.isNaN(d.tempMinC) || Number.isNaN(d.tempMaxC)) {
      throw new AppError(
        ErrorCode.TOOL_EXECUTION_ERROR,
        "Weather forecast arrays were inconsistent."
      );
    }
  }

  return out;
}
