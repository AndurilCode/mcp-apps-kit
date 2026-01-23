/**
 * Get Weather Alerts Tool
 *
 * Returns active weather alerts and warnings for a specified location.
 */

import { defineTool } from "@mcp-apps-kit/core";
import { z } from "zod";
import { weatherService, alertsOutputSchema } from "./_shared.js";
import type { WeatherAlertsResponse } from "../services/weatherService.js";

export default defineTool({
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
});
