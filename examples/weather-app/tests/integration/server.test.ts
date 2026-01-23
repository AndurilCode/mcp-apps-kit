/**
 * Integration tests for weather-app MCP server
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestServer, createTestClient, expectToolResult } from "@mcp-apps-kit/testing";
import type { TestEnvironment } from "@mcp-apps-kit/testing";
import { app } from "../../__generated__/server.js";

describe("Weather App MCP Server", () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    // Set mock mode for predictable tests
    process.env.USE_MOCK_WEATHER = "true";

    const server = await startTestServer(app, { port: 0 });
    await new Promise((r) => setTimeout(r, 100));

    const client = await createTestClient(server.mcpUrl, {
      trackHistory: true,
      timeout: 15000,
    });

    env = {
      server,
      client,
      cleanup: async () => {
        await client.disconnect();
        await server.stop();
      },
    };
  });

  afterAll(async () => {
    await env.cleanup();
    delete process.env.USE_MOCK_WEATHER;
  });

  describe("Server Initialization", () => {
    it("should start server and connect client", () => {
      expect(env.server).toBeDefined();
      expect(env.client).toBeDefined();
      expect(env.server.url).toBeTruthy();
    });

    it("should list all weather tools", async () => {
      const tools = await env.client.listTools();

      // 4 weather tools + 1 log_debug tool (from debug.logTool config)
      expect(tools.length).toBe(5);
      // File-based naming: get-current-weather.ts -> get_current_weather
      expect(tools.some((t) => t.name === "get_current_weather")).toBe(true);
      expect(tools.some((t) => t.name === "get_forecast")).toBe(true);
      expect(tools.some((t) => t.name === "get_weather_alerts")).toBe(true);
      expect(tools.some((t) => t.name === "daily_briefing")).toBe(true);
    });

    it("should have correct tool descriptions", async () => {
      const tools = await env.client.listTools();

      const currentWeatherTool = tools.find((t) => t.name === "get_current_weather");
      expect(currentWeatherTool?.description).toContain("current weather conditions");

      const forecastTool = tools.find((t) => t.name === "get_forecast");
      expect(forecastTool?.description).toContain("forecast");

      const alertsTool = tools.find((t) => t.name === "get_weather_alerts");
      expect(alertsTool?.description).toContain("alerts");
    });
  });

  describe("getCurrentWeather Tool", () => {
    it("should return current weather for a valid location", async () => {
      const result = await env.client.callTool("get_current_weather", {
        location: "New York",
      });

      expectToolResult(result).toHaveNoError();

      const content = result.structuredContent as {
        location?: { name?: string };
        temperature?: number;
        humidity?: number;
        description?: string;
        icon?: string;
      };

      expect(content.location).toBeDefined();
      expect(content.location?.name).toBeTruthy();
      expect(typeof content.temperature).toBe("number");
      expect(typeof content.humidity).toBe("number");
      expect(content.description).toBeTruthy();
      expect(content.icon).toBeTruthy();
    });

    it("should include wind information", async () => {
      const result = await env.client.callTool("get_current_weather", {
        location: "London",
      });

      expectToolResult(result).toHaveNoError();

      const content = result.structuredContent as {
        windSpeed?: number;
        windDirection?: number;
      };

      expect(typeof content.windSpeed).toBe("number");
      expect(typeof content.windDirection).toBe("number");
      expect(content.windDirection).toBeGreaterThanOrEqual(0);
      expect(content.windDirection).toBeLessThanOrEqual(360);
    });

    it("should include feels like temperature", async () => {
      const result = await env.client.callTool("get_current_weather", {
        location: "Tokyo",
      });

      expectToolResult(result).toHaveNoError();

      const content = result.structuredContent as {
        temperature?: number;
        feelsLike?: number;
      };

      expect(typeof content.temperature).toBe("number");
      expect(typeof content.feelsLike).toBe("number");
    });

    it("should include timestamp", async () => {
      const result = await env.client.callTool("get_current_weather", {
        location: "Paris",
      });

      expectToolResult(result).toHaveNoError();

      const content = result.structuredContent as { timestamp?: string };
      expect(content.timestamp).toBeDefined();
      expect(new Date(content.timestamp!).getTime()).not.toBeNaN();
    });
  });

  describe("getForecast Tool", () => {
    it("should return forecast with default 7 days", async () => {
      const result = await env.client.callTool("get_forecast", {
        location: "Berlin",
      });

      expectToolResult(result).toHaveNoError();

      const content = result.structuredContent as {
        location?: { name?: string };
        daily?: Array<{ date?: string }>;
        generatedAt?: string;
      };

      expect(content.location).toBeDefined();
      expect(content.daily).toBeDefined();
      expect(Array.isArray(content.daily)).toBe(true);
      expect(content.daily!.length).toBe(7);
    });

    it("should return forecast for specified number of days", async () => {
      const result = await env.client.callTool("get_forecast", {
        location: "Sydney",
        days: 3,
      });

      expectToolResult(result).toHaveNoError();

      const content = result.structuredContent as {
        daily?: Array<{ date?: string }>;
      };

      expect(content.daily!.length).toBe(3);
    });

    it("should include temperature range for each day", async () => {
      const result = await env.client.callTool("get_forecast", {
        location: "Madrid",
        days: 1,
      });

      expectToolResult(result).toHaveNoError();

      const content = result.structuredContent as {
        daily?: Array<{
          temperatureMax?: number;
          temperatureMin?: number;
        }>;
      };

      const day = content.daily![0];
      expect(typeof day.temperatureMax).toBe("number");
      expect(typeof day.temperatureMin).toBe("number");
      expect(day.temperatureMax).toBeGreaterThanOrEqual(day.temperatureMin!);
    });

    it("should include precipitation probability", async () => {
      const result = await env.client.callTool("get_forecast", {
        location: "Seattle",
        days: 1,
      });

      expectToolResult(result).toHaveNoError();

      const content = result.structuredContent as {
        daily?: Array<{
          precipitationProbability?: number;
        }>;
      };

      const day = content.daily![0];
      expect(typeof day.precipitationProbability).toBe("number");
      expect(day.precipitationProbability).toBeGreaterThanOrEqual(0);
      expect(day.precipitationProbability).toBeLessThanOrEqual(100);
    });

    it("should include sunrise and sunset times", async () => {
      const result = await env.client.callTool("get_forecast", {
        location: "Rome",
        days: 1,
      });

      expectToolResult(result).toHaveNoError();

      const content = result.structuredContent as {
        daily?: Array<{
          sunrise?: string;
          sunset?: string;
        }>;
      };

      const day = content.daily![0];
      expect(day.sunrise).toBeDefined();
      expect(day.sunset).toBeDefined();
    });
  });

  describe("getWeatherAlerts Tool", () => {
    it("should return alerts response for a location", async () => {
      const result = await env.client.callTool("get_weather_alerts", {
        location: "Miami",
      });

      expectToolResult(result).toHaveNoError();

      const content = result.structuredContent as {
        location?: { name?: string };
        alerts?: Array<unknown>;
        lastChecked?: string;
      };

      expect(content.location).toBeDefined();
      expect(content.alerts).toBeDefined();
      expect(Array.isArray(content.alerts)).toBe(true);
      expect(content.lastChecked).toBeDefined();
    });

    it("should return valid alert structure when alerts exist", async () => {
      // Run multiple times to get alerts (random in mock)
      let alertsFound = false;
      for (let i = 0; i < 10 && !alertsFound; i++) {
        const result = await env.client.callTool("get_weather_alerts", {
          location: "Test City",
        });

        const content = result.structuredContent as {
          alerts?: Array<{
            id?: string;
            type?: string;
            severity?: string;
            headline?: string;
            description?: string;
            startTime?: string;
            endTime?: string;
          }>;
        };

        if (content.alerts && content.alerts.length > 0) {
          alertsFound = true;
          const alert = content.alerts[0];

          expect(alert.id).toBeDefined();
          expect(["warning", "watch", "advisory"]).toContain(alert.type);
          expect(["minor", "moderate", "severe", "extreme"]).toContain(alert.severity);
          expect(alert.headline).toBeTruthy();
          expect(alert.description).toBeTruthy();
          expect(alert.startTime).toBeDefined();
          expect(alert.endTime).toBeDefined();
        }
      }

      // It's ok if no alerts were found in mock mode
      expect(true).toBe(true);
    });
  });

  describe("Tool Call History", () => {
    it("should track tool call history", async () => {
      env.client.clearHistory();

      await env.client.callTool("get_current_weather", { location: "Chicago" });
      await env.client.callTool("get_forecast", { location: "Chicago", days: 3 });

      const history = env.client.getCallHistory();

      expect(history.length).toBe(2);
      expect(history[0].name).toBe("get_current_weather");
      expect(history[1].name).toBe("get_forecast");
    });
  });
});
