/**
 * Get Weather Alerts Tool
 *
 * Returns active weather alerts and warnings for a specified location.
 * Demonstrates the new ergonomic fluent builder API.
 */

import { tool } from "@mcp-apps-kit/core";
import { z } from "zod";
import { weatherService, alertsOutputSchema } from "./_shared.js";

// Using tool.describe() - name "getWeatherAlerts" is inferred from filename
export default tool
  .describe(
    "Get active weather alerts and warnings for a specified location. Returns any watches, warnings, or advisories in effect."
  )
  .title("Get Weather Alerts")
  .input({
    location: z.string().describe("City name, address, or location to check for alerts"),
  })
  .output(alertsOutputSchema)
  .visibility("both")
  .readOnly()
  .handle(async ({ location }) => {
    return await weatherService.getAlerts(location);
  });
// Note: .build() is now optional - codegen will auto-build using ensureBuilt()
