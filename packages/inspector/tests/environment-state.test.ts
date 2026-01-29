/**
 * Environment globals configuration tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ConnectionManager } from "../src/connection";
import type { EnvironmentState } from "../src/types";

describe("Environment State Management", () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    manager = new ConnectionManager();
  });

  describe("default state", () => {
    it("should have sensible defaults", () => {
      const state = manager.getEnvironmentState();

      expect(state.theme).toBe("light");
      expect(state.locale).toBe("en-US");
      expect(state.timeZone).toBe("UTC");
      expect(state.displayMode).toBe("inline");
      expect(state.viewport).toEqual({ width: 800, height: 600 });
      expect(state.maxHeight).toBeUndefined();
      expect(state.safeAreaInsets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
      expect(state.userAgent).toEqual({
        device: { type: "desktop" },
        capabilities: { hover: true, touch: false },
      });
      expect(state.userLocation).toBeUndefined();
    });
  });

  describe("setEnvironmentState", () => {
    it("should update theme", () => {
      const updated = manager.setEnvironmentState({ theme: "dark" });
      expect(updated.theme).toBe("dark");
      expect(manager.getEnvironmentState().theme).toBe("dark");
    });

    it("should update locale", () => {
      const updated = manager.setEnvironmentState({ locale: "fr-FR" });
      expect(updated.locale).toBe("fr-FR");
      expect(manager.getEnvironmentState().locale).toBe("fr-FR");
    });

    it("should update timeZone", () => {
      const updated = manager.setEnvironmentState({ timeZone: "America/New_York" });
      expect(updated.timeZone).toBe("America/New_York");
      expect(manager.getEnvironmentState().timeZone).toBe("America/New_York");
    });

    it("should update displayMode", () => {
      const updated = manager.setEnvironmentState({ displayMode: "fullscreen" });
      expect(updated.displayMode).toBe("fullscreen");
      expect(manager.getEnvironmentState().displayMode).toBe("fullscreen");
    });

    it("should update viewport", () => {
      const updated = manager.setEnvironmentState({ viewport: { width: 375, height: 667 } });
      expect(updated.viewport).toEqual({ width: 375, height: 667 });
      expect(manager.getEnvironmentState().viewport).toEqual({ width: 375, height: 667 });
    });

    it("should merge viewport partially", () => {
      manager.setEnvironmentState({ viewport: { width: 1920, height: 1080 } });
      const updated = manager.setEnvironmentState({
        viewport: { width: 1280 } as { width: number; height: number },
      });
      expect(updated.viewport).toEqual({ width: 1280, height: 1080 });
    });

    it("should update maxHeight", () => {
      const updated = manager.setEnvironmentState({ maxHeight: 1200 });
      expect(updated.maxHeight).toBe(1200);
      expect(manager.getEnvironmentState().maxHeight).toBe(1200);
    });

    it("should update safeAreaInsets", () => {
      const insets = { top: 44, right: 0, bottom: 34, left: 0 };
      const updated = manager.setEnvironmentState({ safeAreaInsets: insets });
      expect(updated.safeAreaInsets).toEqual(insets);
      expect(manager.getEnvironmentState().safeAreaInsets).toEqual(insets);
    });

    it("should merge safeAreaInsets partially", () => {
      manager.setEnvironmentState({
        safeAreaInsets: { top: 44, right: 0, bottom: 34, left: 0 },
      });
      const updated = manager.setEnvironmentState({
        safeAreaInsets: { top: 50 } as { top: number; right: number; bottom: number; left: number },
      });
      expect(updated.safeAreaInsets).toEqual({ top: 50, right: 0, bottom: 34, left: 0 });
    });

    it("should update userAgent", () => {
      const userAgent = {
        device: { type: "mobile" },
        capabilities: { hover: false, touch: true },
      };
      const updated = manager.setEnvironmentState({ userAgent });
      expect(updated.userAgent).toEqual(userAgent);
      expect(manager.getEnvironmentState().userAgent).toEqual(userAgent);
    });

    it("should merge userAgent partially", () => {
      manager.setEnvironmentState({
        userAgent: { device: { type: "desktop" }, capabilities: { hover: true, touch: false } },
      });
      const updated = manager.setEnvironmentState({
        userAgent: { device: { type: "tablet" } },
      });
      expect(updated.userAgent).toEqual({
        device: { type: "tablet" },
        capabilities: { hover: true, touch: false },
      });
    });

    it("should update userLocation", () => {
      const location = {
        city: "San Francisco",
        region: "CA",
        country: "US",
        timezone: "America/Los_Angeles",
      };
      const updated = manager.setEnvironmentState({ userLocation: location });
      expect(updated.userLocation).toEqual(location);
      expect(manager.getEnvironmentState().userLocation).toEqual(location);
    });

    it("should update multiple fields at once", () => {
      const updates = {
        theme: "dark" as const,
        locale: "ja-JP",
        viewport: { width: 375, height: 812 },
        displayMode: "fullscreen" as const,
      };
      const updated = manager.setEnvironmentState(updates);

      expect(updated.theme).toBe("dark");
      expect(updated.locale).toBe("ja-JP");
      expect(updated.viewport).toEqual({ width: 375, height: 812 });
      expect(updated.displayMode).toBe("fullscreen");
    });

    it("should preserve other fields when updating", () => {
      manager.setEnvironmentState({ theme: "dark", locale: "fr-FR" });
      const updated = manager.setEnvironmentState({ viewport: { width: 1024, height: 768 } });

      expect(updated.theme).toBe("dark");
      expect(updated.locale).toBe("fr-FR");
      expect(updated.viewport).toEqual({ width: 1024, height: 768 });
    });
  });

  describe("resetEnvironmentState", () => {
    it("should reset to defaults", () => {
      // Set some custom values
      manager.setEnvironmentState({
        theme: "dark",
        locale: "es-ES",
        viewport: { width: 375, height: 667 },
        maxHeight: 1000,
        userLocation: { city: "Madrid", country: "ES" },
      });

      // Verify custom values are set
      expect(manager.getEnvironmentState().theme).toBe("dark");
      expect(manager.getEnvironmentState().locale).toBe("es-ES");

      // Reset
      const reset = manager.resetEnvironmentState();

      // Verify defaults
      expect(reset.theme).toBe("light");
      expect(reset.locale).toBe("en-US");
      expect(reset.timeZone).toBe("UTC");
      expect(reset.displayMode).toBe("inline");
      expect(reset.viewport).toEqual({ width: 800, height: 600 });
      expect(reset.maxHeight).toBeUndefined();
      expect(reset.userLocation).toBeUndefined();
    });
  });

  describe("getEnvironmentState", () => {
    it("should return a copy of the state", () => {
      const state1 = manager.getEnvironmentState();
      const state2 = manager.getEnvironmentState();

      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2); // Different objects
    });

    it("should not allow external mutation", () => {
      const state = manager.getEnvironmentState();
      state.theme = "dark";

      // Original state should remain unchanged
      expect(manager.getEnvironmentState().theme).toBe("light");
    });
  });

  describe("common testing scenarios", () => {
    it("should configure mobile device with safe areas", () => {
      const mobileState: Partial<EnvironmentState> = {
        viewport: { width: 390, height: 844 },
        safeAreaInsets: { top: 47, right: 0, bottom: 34, left: 0 },
        userAgent: {
          device: { type: "mobile" },
          capabilities: { hover: false, touch: true },
        },
      };

      const updated = manager.setEnvironmentState(mobileState);

      expect(updated.viewport).toEqual({ width: 390, height: 844 });
      expect(updated.safeAreaInsets).toEqual({ top: 47, right: 0, bottom: 34, left: 0 });
      expect(updated.userAgent.device?.type).toBe("mobile");
      expect(updated.userAgent.capabilities?.touch).toBe(true);
      expect(updated.userAgent.capabilities?.hover).toBe(false);
    });

    it("should configure tablet landscape mode", () => {
      const tabletState: Partial<EnvironmentState> = {
        viewport: { width: 1024, height: 768 },
        userAgent: {
          device: { type: "tablet" },
          capabilities: { hover: false, touch: true },
        },
      };

      const updated = manager.setEnvironmentState(tabletState);

      expect(updated.viewport).toEqual({ width: 1024, height: 768 });
      expect(updated.userAgent.device?.type).toBe("tablet");
    });

    it("should configure dark mode with specific locale", () => {
      const updated = manager.setEnvironmentState({
        theme: "dark",
        locale: "de-DE",
        timeZone: "Europe/Berlin",
      });

      expect(updated.theme).toBe("dark");
      expect(updated.locale).toBe("de-DE");
      expect(updated.timeZone).toBe("Europe/Berlin");
    });

    it("should configure user in specific location", () => {
      const updated = manager.setEnvironmentState({
        locale: "en-GB",
        timeZone: "Europe/London",
        userLocation: {
          city: "London",
          region: "England",
          country: "GB",
          timezone: "Europe/London",
        },
      });

      expect(updated.locale).toBe("en-GB");
      expect(updated.userLocation?.city).toBe("London");
      expect(updated.userLocation?.country).toBe("GB");
    });
  });
});
