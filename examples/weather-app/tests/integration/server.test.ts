/**
 * Integration tests for @mcp-apps-kit/example-weather-app MCP server
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, createTestClient, expectToolResult } from "@mcp-apps-kit/testing";
import type { TestEnvironment } from "@mcp-apps-kit/testing";
import { app } from "../../server/index.js";

describe("@mcp-apps-kit/example-weather-app MCP Server", () => {
  let env: TestEnvironment;
  let originalFetch: typeof fetch | undefined;

  beforeAll(async () => {
    originalFetch = globalThis.fetch;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;

      if (url.startsWith("https://geocoding-api.open-meteo.com/v1/search")) {
        const u = new URL(url);
        const name = u.searchParams.get("name") ?? "";

        const results =
          name.toLowerCase() === "nowhere"
            ? []
            : [
                {
                  name: "Berlin",
                  admin1: "Berlin",
                  country: "Germany",
                  latitude: 52.52,
                  longitude: 13.41,
                  timezone: "Europe/Berlin",
                },
              ];

        return new Response(JSON.stringify({ results }), { status: 200 });
      }

      if (url.startsWith("https://api.open-meteo.com/v1/forecast")) {
        return new Response(
          JSON.stringify({
            latitude: 52.52,
            longitude: 13.41,
            timezone: "Europe/Berlin",
            current: {
              time: "2026-01-10T12:00",
              temperature_2m: 2.3,
              wind_speed_10m: 7.1,
              weather_code: 3,
            },
            daily: {
              time: ["2026-01-10", "2026-01-11", "2026-01-12"],
              temperature_2m_min: [-1, 0, 1],
              temperature_2m_max: [3, 4, 5],
              weather_code: [3, 2, 1],
            },
          }),
          { status: 200 }
        );
      }

      if (!originalFetch) {
        throw new Error("original fetch was not available");
      }
      return await originalFetch(input as RequestInfo, init);
    }) as unknown as typeof fetch;

    const server = await startTestServer(app, { port: 0 });
    await new Promise((r) => setTimeout(r, 100));

    const client = await createTestClient(server.mcpUrl, {
      trackHistory: true,
      timeout: 10000,
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
    if (env) {
      await env.cleanup();
    }
    globalThis.fetch = originalFetch as typeof fetch;
  });

  it("should start server and connect client", () => {
    expect(env.server).toBeDefined();
    expect(env.client).toBeDefined();
    expect(env.server.url).toBeTruthy();
  });

  it("should list available tools", async () => {
    const tools = await env.client.listTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some((t) => t.name === "get_weather")).toBe(true);
  });

  it("should call get_weather tool successfully", async () => {
    const result = await env.client.callTool("get_weather", { location: "Berlin", days: 3 });

    expectToolResult(result).toHaveNoError();
    expectToolResult(result).toMatchObject({
      source: "open-meteo",
      location: {
        latitude: 52.52,
        longitude: 13.41,
      },
    });
  });

  it("should include a daily forecast array", async () => {
    const result = await env.client.callTool("get_weather", { location: "Berlin", days: 3 });

    expectToolResult(result).toHaveNoError();
    const content = result.structuredContent as unknown as {
      daily?: Array<{ date: string; tempMinC: number; tempMaxC: number }>;
    };
    expect(Array.isArray(content.daily)).toBe(true);
    expect(content.daily?.length).toBe(3);
    expect(content.daily?.[0]?.date).toBe("2026-01-10");
  });

  it("should return INVALID_INPUT for unknown locations", async () => {
    const result = await env.client.callTool("get_weather", { location: "Nowhere" });
    expectToolResult(result).toHaveError();
    expectToolResult(result).toContainText('Location not found: "Nowhere"');
  });
});
