/**
 * Get Weather Forecast Tool
 *
 * Returns multi-day weather forecast for a specified location.
 */

import { defineTool } from "@mcp-apps-kit/core";
import { z } from "zod";
import { weatherService, forecastOutputSchema } from "./_shared.js";
import type { WeatherForecast } from "../services/weatherService.js";

export default defineTool({
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
});
