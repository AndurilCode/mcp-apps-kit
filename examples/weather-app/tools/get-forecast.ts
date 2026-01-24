/**
 * Get Weather Forecast Tool
 *
 * Returns multi-day weather forecast for a specified location.
 * Demonstrates the new ergonomic fluent builder API.
 */

import { tool } from "@mcp-apps-kit/core";
import { z } from "zod";
import { weatherService, forecastOutputSchema } from "./_shared.js";

// Using tool.describe() - name "getForecast" is inferred from filename
export default tool
  .describe(
    "Get a multi-day weather forecast for a specified location. Returns daily forecasts with temperatures, precipitation, and conditions."
  )
  .title("Get Weather Forecast")
  .input({
    location: z.string().describe("City name, address, or location to get forecast for"),
    days: z
      .number()
      .min(1)
      .max(16)
      .default(7)
      .describe("Number of days to forecast (1-16, default: 7)"),
  })
  .output(forecastOutputSchema)
  .visibility("both")
  .readOnly()
  .handle(async ({ location, days }) => {
    return await weatherService.getForecast(location, days);
  });
// Note: .build() is now optional - codegen will auto-build using ensureBuilt()
