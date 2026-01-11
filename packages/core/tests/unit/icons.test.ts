/**
 * Unit tests for server icon configuration
 *
 * Tests the icon types and configuration for MCP server icons.
 */

import { describe, it, expect, expectTypeOf } from "vitest";
import { z } from "zod";
import type { Icon, IconTheme, AppConfig } from "../../src/types/config";
import type { ToolDefs } from "../../src/types/tools";

describe("Icon types", () => {
  describe("Icon interface", () => {
    it("should accept a minimal icon with just src", () => {
      const icon: Icon = {
        src: "https://example.com/icon.png",
      };

      expect(icon.src).toBe("https://example.com/icon.png");
      expect(icon.mimeType).toBeUndefined();
      expect(icon.sizes).toBeUndefined();
      expect(icon.theme).toBeUndefined();
    });

    it("should accept a fully specified icon", () => {
      const icon: Icon = {
        src: "https://example.com/icon.png",
        mimeType: "image/png",
        sizes: ["48x48", "96x96"],
        theme: "light",
      };

      expect(icon.src).toBe("https://example.com/icon.png");
      expect(icon.mimeType).toBe("image/png");
      expect(icon.sizes).toEqual(["48x48", "96x96"]);
      expect(icon.theme).toBe("light");
    });

    it("should accept data URI for src", () => {
      const icon: Icon = {
        src: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==",
        mimeType: "image/svg+xml",
        sizes: ["any"],
      };

      expect(icon.src).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it("should accept theme values", () => {
      const lightIcon: Icon = { src: "https://example.com/light.png", theme: "light" };
      const darkIcon: Icon = { src: "https://example.com/dark.png", theme: "dark" };

      expectTypeOf<IconTheme>().toEqualTypeOf<"light" | "dark">();
      expect(lightIcon.theme).toBe("light");
      expect(darkIcon.theme).toBe("dark");
    });
  });

  describe("AppConfig with icons", () => {
    const baseTools: ToolDefs = {
      test: {
        description: "Test tool",
        input: z.object({}),
        output: z.object({}),
        handler: async () => ({}),
      },
    };

    it("should accept icon shorthand string", () => {
      const config: AppConfig = {
        name: "test-app",
        version: "1.0.0",
        tools: baseTools,
        icon: "https://example.com/icon.png",
      };

      expect(config.icon).toBe("https://example.com/icon.png");
    });

    it("should accept icons array", () => {
      const config: AppConfig = {
        name: "test-app",
        version: "1.0.0",
        tools: baseTools,
        icons: [
          { src: "https://example.com/icon-48.png", sizes: ["48x48"] },
          { src: "https://example.com/icon-96.png", sizes: ["96x96"] },
        ],
      };

      expect(config.icons).toHaveLength(2);
      expect(config.icons?.[0].sizes).toEqual(["48x48"]);
    });

    it("should accept both icon and icons (icons takes precedence)", () => {
      const config: AppConfig = {
        name: "test-app",
        version: "1.0.0",
        tools: baseTools,
        icon: "https://example.com/fallback.png",
        icons: [{ src: "https://example.com/primary.png" }],
      };

      expect(config.icon).toBe("https://example.com/fallback.png");
      expect(config.icons).toHaveLength(1);
    });

    it("should accept theme-specific icons", () => {
      const config: AppConfig = {
        name: "test-app",
        version: "1.0.0",
        tools: baseTools,
        icons: [
          { src: "https://example.com/light.png", theme: "light" },
          { src: "https://example.com/dark.png", theme: "dark" },
        ],
      };

      expect(config.icons?.[0].theme).toBe("light");
      expect(config.icons?.[1].theme).toBe("dark");
    });

    it("should accept data URI icons", () => {
      const svgBase64 = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==";
      const config: AppConfig = {
        name: "test-app",
        version: "1.0.0",
        tools: baseTools,
        icon: `data:image/svg+xml;base64,${svgBase64}`,
      };

      expect(config.icon).toMatch(/^data:image\/svg\+xml;base64,/);
    });
  });
});
