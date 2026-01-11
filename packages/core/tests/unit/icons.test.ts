/**
 * Unit tests for server icon configuration
 *
 * Tests the icon types and configuration for MCP server icons.
 */

import { describe, it, expect, expectTypeOf, vi, beforeEach } from "vitest";
import { z } from "zod";
import type { Icon, IconTheme, AppConfig } from "../../src/types/config";
import type { ToolDefs } from "../../src/types/tools";

// Mock node:fs before importing iconFromFile
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

import { iconFromFile } from "../../src/utils/icons";
import { readFileSync } from "node:fs";

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

describe("iconFromFile", () => {
  const mockReadFileSync = vi.mocked(readFileSync);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should convert PNG file to data URI", () => {
    const pngData = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
    mockReadFileSync.mockReturnValue(pngData);

    const icon = iconFromFile("/path/to/icon.png");

    expect(icon.src).toMatch(/^data:image\/png;base64,/);
    expect(icon.mimeType).toBe("image/png");
    expect(icon.sizes).toBeUndefined();
    expect(icon.theme).toBeUndefined();
  });

  it("should convert JPEG file to data URI", () => {
    const jpegData = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic bytes
    mockReadFileSync.mockReturnValue(jpegData);

    const icon = iconFromFile("/path/to/photo.jpg");

    expect(icon.src).toMatch(/^data:image\/jpeg;base64,/);
    expect(icon.mimeType).toBe("image/jpeg");
  });

  it("should convert SVG file to data URI", () => {
    const svgContent = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    mockReadFileSync.mockReturnValue(svgContent);

    const icon = iconFromFile("/path/to/icon.svg");

    expect(icon.src).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(icon.mimeType).toBe("image/svg+xml");
  });

  it("should handle .jpeg extension", () => {
    const jpegData = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    mockReadFileSync.mockReturnValue(jpegData);

    const icon = iconFromFile("/path/to/photo.jpeg");

    expect(icon.mimeType).toBe("image/jpeg");
  });

  it("should handle WebP files", () => {
    const webpData = Buffer.from("RIFF....WEBP");
    mockReadFileSync.mockReturnValue(webpData);

    const icon = iconFromFile("/path/to/icon.webp");

    expect(icon.mimeType).toBe("image/webp");
  });

  it("should include sizes option when provided", () => {
    const pngData = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    mockReadFileSync.mockReturnValue(pngData);

    const icon = iconFromFile("/path/to/icon.png", { sizes: ["48x48", "96x96"] });

    expect(icon.sizes).toEqual(["48x48", "96x96"]);
  });

  it("should include theme option when provided", () => {
    const pngData = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    mockReadFileSync.mockReturnValue(pngData);

    const icon = iconFromFile("/path/to/icon-dark.png", { theme: "dark" });

    expect(icon.theme).toBe("dark");
  });

  it("should allow mimeType override", () => {
    const customData = Buffer.from("custom format");
    mockReadFileSync.mockReturnValue(customData);

    const icon = iconFromFile("/path/to/icon.custom", { mimeType: "image/x-custom" });

    expect(icon.src).toMatch(/^data:image\/x-custom;base64,/);
    expect(icon.mimeType).toBe("image/x-custom");
  });

  it("should throw for unsupported extension without mimeType override", () => {
    const unknownData = Buffer.from("unknown format");
    mockReadFileSync.mockReturnValue(unknownData);

    expect(() => iconFromFile("/path/to/icon.xyz")).toThrow("Unsupported image format: .xyz");
  });

  it("should correctly encode file content as base64", () => {
    const testContent = Buffer.from("Hello, World!");
    mockReadFileSync.mockReturnValue(testContent);

    const icon = iconFromFile("/path/to/test.png");

    // "Hello, World!" in base64 is "SGVsbG8sIFdvcmxkIQ=="
    expect(icon.src).toBe("data:image/png;base64,SGVsbG8sIFdvcmxkIQ==");
  });

  it("should handle all options together", () => {
    const pngData = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    mockReadFileSync.mockReturnValue(pngData);

    const icon = iconFromFile("/path/to/icon.png", {
      sizes: ["48x48"],
      theme: "light",
    });

    expect(icon.src).toMatch(/^data:image\/png;base64,/);
    expect(icon.mimeType).toBe("image/png");
    expect(icon.sizes).toEqual(["48x48"]);
    expect(icon.theme).toBe("light");
  });
});
