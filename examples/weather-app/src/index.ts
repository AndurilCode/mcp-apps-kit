/**
 * @mcp-apps-kit/example-weather-app - MCP Server
 */

import { createApp, defineTool, defineUI } from "@mcp-apps-kit/core";
import { getWeather, weatherInputSchema, weatherOutputSchema } from "./weather.js";

// Define the UI for displaying weather results
const weatherUI = defineUI({
  name: "Weather Widget",
  description: "Displays current conditions and forecast",
  html: "./ui/dist/index.html",
  prefersBorder: true,
});

const app = createApp({
  name: "@mcp-apps-kit/example-weather-app",
  version: "0.1.0",

  config: {
    protocol: "mcp",
  },

  tools: {
    get_weather: defineTool({
      title: "Get Weather",
      description:
        "Get current conditions and a short forecast for a city name or latitude/longitude. Data from Open-Meteo (no API key).",
      input: weatherInputSchema,
      output: weatherOutputSchema,
      handler: async (input) => {
        // Read fetch at call-time so tests can override global fetch.
        const fetchFn: typeof fetch = globalThis.fetch;
        if (typeof fetchFn !== "function") {
          throw new Error("Global fetch is not available (requires Node.js 20+).");
        }

        return await getWeather(fetchFn, input);
      },
      ui: weatherUI,
      visibility: "both",
    }),
  },
});

// Start server (skip in test environment)
if (process.env.NODE_ENV !== "test") {
  await app.start({ port: 3000 });
  console.log("MCP server running on http://localhost:3000");
}

// Export app for testing
export { app };
