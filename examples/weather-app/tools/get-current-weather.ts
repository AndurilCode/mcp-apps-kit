/**
 * Get Current Weather Tool
 *
 * Returns current weather conditions for a specified location.
 */

import { defineTool } from "@mcp-apps-kit/core";
import { z } from "zod";
import { weatherService, currentWeatherOutputSchema } from "./_shared.js";
import type { CurrentWeather } from "../services/weatherService.js";

export default defineTool({
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
});
