/**
 * Integration tests for set_globals tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConnectionManager } from "../src/connection";
import {
  createSetGlobalsTool,
  createGetGlobalsTool,
  createResetGlobalsTool,
} from "../src/tools/set-globals";
import { createMockRegistry } from "./test-utils";

describe("set_globals tool integration", () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    manager = new ConnectionManager();
  });

  describe("basic functionality", () => {
    it("should get default globals", async () => {
      const tool = createGetGlobalsTool(createMockRegistry(manager));
      const result = await tool.handler({}, {} as never);

      expect(result.currentState).toMatchObject({
        theme: "light",
        locale: "en-US",
        timeZone: "UTC",
        displayMode: "inline",
        viewport: { width: 800, height: 600 },
        safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        userAgent: {
          device: { type: "desktop" },
          capabilities: { hover: true, touch: false },
        },
      });
    });

    it("should set theme", async () => {
      const tool = createSetGlobalsTool(createMockRegistry(manager));
      const result = await tool.handler({ theme: "dark" }, {} as never);

      expect(result.updated).toBe(true);
      expect(result.currentState.theme).toBe("dark");

      // Verify with get_globals
      const getTool = createGetGlobalsTool(createMockRegistry(manager));
      const getResult = await getTool.handler({}, {} as never);
      expect(getResult.currentState.theme).toBe("dark");
    });

    it("should set locale and timezone", async () => {
      const tool = createSetGlobalsTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          locale: "ja-JP",
          timeZone: "Asia/Tokyo",
        },
        {} as never
      );

      expect(result.updated).toBe(true);
      expect(result.currentState.locale).toBe("ja-JP");
      expect(result.currentState.timeZone).toBe("Asia/Tokyo");
    });

    it("should set viewport for mobile", async () => {
      const tool = createSetGlobalsTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          viewport: { width: 390, height: 844 },
        },
        {} as never
      );

      expect(result.updated).toBe(true);
      expect(result.currentState.viewport).toEqual({ width: 390, height: 844 });
    });

    it("should set safe area insets", async () => {
      const tool = createSetGlobalsTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          safeAreaInsets: { top: 47, right: 0, bottom: 34, left: 0 },
        },
        {} as never
      );

      expect(result.updated).toBe(true);
      expect(result.currentState.safeAreaInsets).toEqual({
        top: 47,
        right: 0,
        bottom: 34,
        left: 0,
      });
    });

    it("should set user agent for mobile device", async () => {
      const tool = createSetGlobalsTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          userAgent: {
            device: { type: "mobile" },
            capabilities: { hover: false, touch: true },
          },
        },
        {} as never
      );

      expect(result.updated).toBe(true);
      expect(result.currentState.userAgent).toEqual({
        device: { type: "mobile" },
        capabilities: { hover: false, touch: true },
      });
    });

    it("should set user location", async () => {
      const tool = createSetGlobalsTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          userLocation: {
            city: "Paris",
            region: "Île-de-France",
            country: "FR",
            timezone: "Europe/Paris",
          },
        },
        {} as never
      );

      expect(result.updated).toBe(true);
      expect(result.currentState.userLocation).toEqual({
        city: "Paris",
        region: "Île-de-France",
        country: "FR",
        timezone: "Europe/Paris",
      });
    });

    it("should set maxHeight", async () => {
      const tool = createSetGlobalsTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          maxHeight: 1200,
        },
        {} as never
      );

      expect(result.updated).toBe(true);
      expect(result.currentState.maxHeight).toBe(1200);
    });

    it("should unset optional fields with null", async () => {
      const setTool = createSetGlobalsTool(createMockRegistry(manager));

      // First set a value
      await setTool.handler(
        {
          maxHeight: 1000,
          userLocation: { city: "Tokyo", country: "JP" },
        },
        {} as never
      );

      // Then unset with null
      const result = await setTool.handler(
        {
          maxHeight: null,
          userLocation: null,
        },
        {} as never
      );

      expect(result.updated).toBe(true);
      expect(result.currentState.maxHeight).toBeUndefined();
      expect(result.currentState.userLocation).toBeUndefined();
    });

    it("should set multiple fields at once", async () => {
      const tool = createSetGlobalsTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          theme: "dark",
          locale: "fr-FR",
          viewport: { width: 1920, height: 1080 },
          displayMode: "fullscreen",
          userAgent: {
            device: { type: "desktop" },
            capabilities: { hover: true, touch: false },
          },
        },
        {} as never
      );

      expect(result.updated).toBe(true);
      expect(result.currentState).toMatchObject({
        theme: "dark",
        locale: "fr-FR",
        viewport: { width: 1920, height: 1080 },
        displayMode: "fullscreen",
      });
      expect(result.message).toContain("5 setting(s)");
    });

    it("should reset to defaults", async () => {
      const setTool = createSetGlobalsTool(createMockRegistry(manager));
      const resetTool = createResetGlobalsTool(createMockRegistry(manager));

      // First set custom values
      await setTool.handler(
        {
          theme: "dark",
          locale: "es-ES",
          viewport: { width: 375, height: 667 },
        },
        {} as never
      );

      // Then reset
      const result = await resetTool.handler({}, {} as never);

      expect(result.reset).toBe(true);
      expect(result.currentState).toMatchObject({
        theme: "light",
        locale: "en-US",
        viewport: { width: 800, height: 600 },
      });
    });

    it("should persist state across multiple calls", async () => {
      const setTool = createSetGlobalsTool(createMockRegistry(manager));
      const getTool = createGetGlobalsTool(createMockRegistry(manager));

      // Set theme
      await setTool.handler({ theme: "dark" }, {} as never);

      // Set locale
      await setTool.handler({ locale: "de-DE" }, {} as never);

      // Both should be set
      const result = await getTool.handler({}, {} as never);
      expect(result.currentState.theme).toBe("dark");
      expect(result.currentState.locale).toBe("de-DE");
    });

    it("should return message indicating no changes when empty input", async () => {
      const tool = createSetGlobalsTool(createMockRegistry(manager));
      const result = await tool.handler({}, {} as never);

      expect(result.updated).toBe(false);
      expect(result.message).toBe("No settings were changed");
    });
  });

  describe("common testing scenarios", () => {
    it("should configure iPhone 13 Pro simulation", async () => {
      const tool = createSetGlobalsTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          viewport: { width: 390, height: 844 },
          safeAreaInsets: { top: 47, right: 0, bottom: 34, left: 0 },
          userAgent: {
            device: { type: "mobile" },
            capabilities: { hover: false, touch: true },
          },
          locale: "en-US",
        },
        {} as never
      );

      expect(result.updated).toBe(true);
      expect(result.currentState.viewport.width).toBe(390);
      expect(result.currentState.viewport.height).toBe(844);
      expect(result.currentState.safeAreaInsets.top).toBe(47);
      expect(result.currentState.userAgent.device?.type).toBe("mobile");
    });

    it("should configure iPad landscape", async () => {
      const tool = createSetGlobalsTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          viewport: { width: 1024, height: 768 },
          userAgent: {
            device: { type: "tablet" },
            capabilities: { hover: false, touch: true },
          },
        },
        {} as never
      );

      expect(result.updated).toBe(true);
      expect(result.currentState.viewport).toEqual({ width: 1024, height: 768 });
      expect(result.currentState.userAgent.device?.type).toBe("tablet");
    });

    it("should configure desktop with 4K resolution", async () => {
      const tool = createSetGlobalsTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          viewport: { width: 3840, height: 2160 },
          userAgent: {
            device: { type: "desktop" },
            capabilities: { hover: true, touch: false },
          },
        },
        {} as never
      );

      expect(result.updated).toBe(true);
      expect(result.currentState.viewport.width).toBe(3840);
      expect(result.currentState.viewport.height).toBe(2160);
    });

    it("should configure European user with dark mode", async () => {
      const tool = createSetGlobalsTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          theme: "dark",
          locale: "fr-FR",
          timeZone: "Europe/Paris",
          userLocation: {
            city: "Paris",
            region: "Île-de-France",
            country: "FR",
            timezone: "Europe/Paris",
          },
        },
        {} as never
      );

      expect(result.updated).toBe(true);
      expect(result.currentState.theme).toBe("dark");
      expect(result.currentState.locale).toBe("fr-FR");
      expect(result.currentState.timeZone).toBe("Europe/Paris");
      expect(result.currentState.userLocation?.city).toBe("Paris");
    });

    it("should configure Asian user with mobile device", async () => {
      const tool = createSetGlobalsTool(createMockRegistry(manager));
      const result = await tool.handler(
        {
          locale: "zh-CN",
          timeZone: "Asia/Shanghai",
          viewport: { width: 390, height: 844 },
          userAgent: {
            device: { type: "mobile" },
            capabilities: { hover: false, touch: true },
          },
          userLocation: {
            city: "Shanghai",
            country: "CN",
            timezone: "Asia/Shanghai",
          },
        },
        {} as never
      );

      expect(result.updated).toBe(true);
      expect(result.currentState.locale).toBe("zh-CN");
      expect(result.currentState.timeZone).toBe("Asia/Shanghai");
      expect(result.currentState.userLocation?.city).toBe("Shanghai");
    });
  });

  describe("dynamic propagation to active sessions", () => {
    it("should propagate theme changes to active widget sessions", async () => {
      const setTool = createSetGlobalsTool(createMockRegistry(manager));
      const sessionManager = manager.getWidgetSessionManager();

      // Mock a widget session (we won't actually render, just verify the method is called)
      const updateAllSessionGlobalsSpy = vi.spyOn(sessionManager, "updateAllSessionGlobals");

      // Initial state is light theme
      const initialState = await createGetGlobalsTool(createMockRegistry(manager)).handler(
        {},
        {} as never
      );
      expect(initialState.currentState.theme).toBe("light");

      // Change to dark theme
      const result = await setTool.handler({ theme: "dark" }, {} as never);

      expect(result.updated).toBe(true);
      expect(result.currentState.theme).toBe("dark");

      // Verify that updateAllSessionGlobals was called
      expect(updateAllSessionGlobalsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          theme: "dark",
        })
      );

      updateAllSessionGlobalsSpy.mockRestore();
    });

    it("should report number of sessions updated in message", async () => {
      const setTool = createSetGlobalsTool(createMockRegistry(manager));
      const sessionManager = manager.getWidgetSessionManager();

      // Mock updateAllSessionGlobals to return 2 sessions updated
      const updateAllSessionGlobalsSpy = vi
        .spyOn(sessionManager, "updateAllSessionGlobals")
        .mockResolvedValue(2);

      const result = await setTool.handler({ theme: "dark", locale: "fr-FR" }, {} as never);

      expect(result.updated).toBe(true);
      expect(result.message).toContain("2 active session(s)");
      expect(result.message).toContain("2 setting(s)");

      updateAllSessionGlobalsSpy.mockRestore();
    });

    it("should handle zero active sessions gracefully", async () => {
      const setTool = createSetGlobalsTool(createMockRegistry(manager));
      const sessionManager = manager.getWidgetSessionManager();

      // Mock updateAllSessionGlobals to return 0 sessions updated
      const updateAllSessionGlobalsSpy = vi
        .spyOn(sessionManager, "updateAllSessionGlobals")
        .mockResolvedValue(0);

      const result = await setTool.handler({ displayMode: "fullscreen" }, {} as never);

      expect(result.updated).toBe(true);
      expect(result.message).toContain("0 active session(s)");

      updateAllSessionGlobalsSpy.mockRestore();
    });
  });
});
