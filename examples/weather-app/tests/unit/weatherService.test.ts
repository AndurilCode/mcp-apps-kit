/**
 * Unit tests for Weather Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WeatherService, mockWeatherService } from "../../server/services/weatherService.js";

describe("WeatherService", () => {
  describe("Mock Mode", () => {
    const service = new WeatherService({ useMock: true });

    describe("getCurrentWeather", () => {
      it("should return current weather for any location", async () => {
        const result = await service.getCurrentWeather("New York");

        expect(result).toBeDefined();
        expect(result.location.name).toBe("New York");
        expect(typeof result.temperature).toBe("number");
        expect(typeof result.humidity).toBe("number");
        expect(typeof result.windSpeed).toBe("number");
        expect(typeof result.windDirection).toBe("number");
        expect(result.description).toBeTruthy();
        expect(result.icon).toBeTruthy();
        expect(typeof result.isDay).toBe("boolean");
        expect(result.timestamp).toBeTruthy();
      });

      it("should return mock location coordinates", async () => {
        const result = await service.getCurrentWeather("Test City");

        expect(result.location.latitude).toBe(40.7128);
        expect(result.location.longitude).toBe(-74.006);
        expect(result.location.country).toBe("United States");
        expect(result.location.timezone).toBe("America/New_York");
      });

      it("should return valid humidity range", async () => {
        const result = await service.getCurrentWeather("Tokyo");

        expect(result.humidity).toBeGreaterThanOrEqual(30);
        expect(result.humidity).toBeLessThanOrEqual(90);
      });

      it("should return valid wind direction", async () => {
        const result = await service.getCurrentWeather("London");

        expect(result.windDirection).toBeGreaterThanOrEqual(0);
        expect(result.windDirection).toBeLessThan(360);
      });
    });

    describe("getForecast", () => {
      it("should return forecast for default 7 days", async () => {
        const result = await service.getForecast("Paris");

        expect(result).toBeDefined();
        expect(result.location.name).toBe("Paris");
        expect(result.daily).toHaveLength(7);
        expect(result.generatedAt).toBeTruthy();
      });

      it("should return forecast for specified number of days", async () => {
        const result = await service.getForecast("Berlin", 3);

        expect(result.daily).toHaveLength(3);
      });

      it("should limit forecast to maximum 16 days", async () => {
        const result = await service.getForecast("Sydney", 20);

        expect(result.daily).toHaveLength(16);
      });

      it("should ensure minimum 1 day forecast", async () => {
        const result = await service.getForecast("Rome", 0);

        expect(result.daily).toHaveLength(1);
      });

      it("should return valid daily forecast data", async () => {
        const result = await service.getForecast("Madrid", 1);
        const day = result.daily[0];

        expect(day.date).toBeTruthy();
        expect(typeof day.temperatureMax).toBe("number");
        expect(typeof day.temperatureMin).toBe("number");
        expect(day.temperatureMax).toBeGreaterThanOrEqual(day.temperatureMin);
        expect(typeof day.precipitationProbability).toBe("number");
        expect(day.precipitationProbability).toBeGreaterThanOrEqual(0);
        expect(day.precipitationProbability).toBeLessThanOrEqual(100);
        expect(typeof day.windSpeedMax).toBe("number");
        expect(day.sunrise).toBeTruthy();
        expect(day.sunset).toBeTruthy();
        expect(day.description).toBeTruthy();
        expect(day.icon).toBeTruthy();
      });

      it("should return sequential dates", async () => {
        const result = await service.getForecast("Chicago", 5);

        for (let i = 1; i < result.daily.length; i++) {
          const prevDate = new Date(result.daily[i - 1].date);
          const currDate = new Date(result.daily[i].date);
          const diffDays = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
          expect(diffDays).toBe(1);
        }
      });
    });

    describe("getAlerts", () => {
      it("should return alerts response for any location", async () => {
        const result = await service.getAlerts("Miami");

        expect(result).toBeDefined();
        expect(result.location.name).toBe("Miami");
        expect(Array.isArray(result.alerts)).toBe(true);
        expect(result.lastChecked).toBeTruthy();
      });

      it("should return valid alert structure when alerts exist", async () => {
        // Run multiple times since mock generates random alerts
        let alertFound = false;
        for (let i = 0; i < 20 && !alertFound; i++) {
          const result = await service.getAlerts("Test City");

          if (result.alerts.length > 0) {
            alertFound = true;
            const alert = result.alerts[0];

            expect(alert.id).toBeTruthy();
            expect(["warning", "watch", "advisory"]).toContain(alert.type);
            expect(["minor", "moderate", "severe", "extreme"]).toContain(alert.severity);
            expect(alert.headline).toBeTruthy();
            expect(alert.description).toBeTruthy();
            expect(alert.startTime).toBeTruthy();
            expect(alert.endTime).toBeTruthy();

            // End time should be after start time
            const startTime = new Date(alert.startTime).getTime();
            const endTime = new Date(alert.endTime).getTime();
            expect(endTime).toBeGreaterThan(startTime);
          }
        }
      });

      it("should return 0-2 alerts randomly", async () => {
        const alertCounts = new Set<number>();

        // Run many times to check randomness
        for (let i = 0; i < 30; i++) {
          const result = await service.getAlerts("Random City");
          alertCounts.add(result.alerts.length);
        }

        // Should have at least 2 different counts (0, 1, or 2)
        expect(alertCounts.size).toBeGreaterThan(1);

        // All counts should be 0, 1, or 2
        for (const count of alertCounts) {
          expect(count).toBeGreaterThanOrEqual(0);
          expect(count).toBeLessThanOrEqual(2);
        }
      });
    });
  });

  describe("Exported mockWeatherService", () => {
    it("should be a WeatherService instance in mock mode", async () => {
      const result = await mockWeatherService.getCurrentWeather("Test");

      // Mock data always returns same coordinates
      expect(result.location.latitude).toBe(40.7128);
      expect(result.location.longitude).toBe(-74.006);
    });
  });

  describe("Real API Mode (with fallback)", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fetchSpy = vi.spyOn(globalThis, "fetch");
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it("should fallback to mock data when geocoding fails", async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      const service = new WeatherService({ useMock: false });
      const result = await service.getCurrentWeather("Unknown City");

      // Should still return mock data
      expect(result).toBeDefined();
      expect(result.location.name).toBe("Unknown City");
      expect(typeof result.temperature).toBe("number");
    });

    it("should fallback to mock data when network fails", async () => {
      fetchSpy.mockRejectedValue(new Error("Network error"));

      const service = new WeatherService({ useMock: false });
      const result = await service.getCurrentWeather("Test City");

      // Should still return mock data
      expect(result).toBeDefined();
      expect(result.location.name).toBe("Test City");
    });

    it("should fallback to mock when geocoding returns no results", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      } as Response);

      const service = new WeatherService({ useMock: false });
      const result = await service.getCurrentWeather("Nonexistent City");

      expect(result).toBeDefined();
      expect(result.location.name).toBe("Nonexistent City");
    });
  });

  describe("Weather Code Descriptions", () => {
    it("should return appropriate icons for different weather codes", async () => {
      const service = new WeatherService({ useMock: true });

      // Run multiple times to check different weather codes
      const icons = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const result = await service.getCurrentWeather("Test");
        icons.add(result.icon);
      }

      // Should have weather-related emojis
      const weatherEmojis = ["☀️", "🌤️", "⛅", "☁️", "🌧️", "🌦️"];
      let foundWeatherEmoji = false;
      for (const icon of icons) {
        if (weatherEmojis.includes(icon)) {
          foundWeatherEmoji = true;
          break;
        }
      }
      expect(foundWeatherEmoji).toBe(true);
    });
  });
});
