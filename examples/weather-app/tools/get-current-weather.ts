/**
 * Get Current Weather Tool
 *
 * Returns current weather conditions for a specified location.
 * Demonstrates the new ergonomic fluent builder API.
 */

import { tool } from "@mcp-apps-kit/core";
import { z } from "zod";
import { weatherService, currentWeatherOutputSchema } from "./_shared.js";

// Using tool.describe() - name "getCurrentWeather" is inferred from filename
export default tool
  .describe(
    "Get the current weather conditions for a specified location. Returns temperature, humidity, wind, and conditions."
  )
  .title("Get Current Weather")
  .input({
    location: z
      .string()
      .describe(
        "City name, address, or location to get weather for (e.g., 'New York', 'Tokyo', 'London, UK')"
      ),
  })
  .output(currentWeatherOutputSchema)
  .visibility("both")
  .readOnly()
  .handle(async ({ location }) => {
    return await weatherService.getCurrentWeather(location);
  });
// Note: .build() is now optional - codegen will auto-build using ensureBuilt()
