/**
 * Tests for configuration loading and validation
 */

import { describe, it, expect } from "vitest";
import { defineConfig, validateConfig, getDefaultConfig } from "../src/config";

describe("config", () => {
  describe("defineConfig", () => {
    it("should return the same config object", () => {
      const config = {
        name: "my-app",
        version: "1.0.0",
      };

      const result = defineConfig(config);
      expect(result).toBe(config);
    });

    it("should work with full configuration", () => {
      const config = defineConfig({
        name: "my-app",
        version: "1.0.0",
        directories: {
          tools: "src/tools",
          workflows: "src/workflows",
          ui: "src/ui",
        },
        config: {
          protocol: "mcp",
          cors: { origin: true },
          debug: { logTool: true, level: "debug" },
        },
        plugins: [],
        icon: "https://example.com/icon.png",
        icons: [{ src: "https://example.com/icon.png", mimeType: "image/png" }],
      });

      expect(config.name).toBe("my-app");
      expect(config.version).toBe("1.0.0");
    });
  });

  describe("validateConfig", () => {
    it("should validate a minimal config", () => {
      const config = {
        name: "my-app",
        version: "1.0.0",
      };

      expect(() => validateConfig(config)).not.toThrow();
    });

    it("should throw for missing name", () => {
      const config = { version: "1.0.0" };

      expect(() => validateConfig(config)).toThrow("Configuration 'name' is required");
    });

    it("should throw for empty name", () => {
      const config = { name: "", version: "1.0.0" };

      expect(() => validateConfig(config)).toThrow(
        "Configuration 'name' is required and must be a non-empty string"
      );
    });

    it("should throw for missing version", () => {
      const config = { name: "my-app" };

      expect(() => validateConfig(config)).toThrow("Configuration 'version' is required");
    });

    it("should throw for empty version", () => {
      const config = { name: "my-app", version: "" };

      expect(() => validateConfig(config)).toThrow(
        "Configuration 'version' is required and must be a non-empty string"
      );
    });

    it("should throw for non-object config", () => {
      expect(() => validateConfig(null)).toThrow("Configuration must be an object");
      expect(() => validateConfig("string")).toThrow("Configuration must be an object");
      expect(() => validateConfig(123)).toThrow("Configuration must be an object");
    });

    it("should validate directories configuration", () => {
      const config = {
        name: "my-app",
        version: "1.0.0",
        directories: {
          tools: "src/tools",
          workflows: "src/workflows",
          ui: "src/ui",
        },
      };

      expect(() => validateConfig(config)).not.toThrow();
    });

    it("should throw for invalid directories", () => {
      const config = {
        name: "my-app",
        version: "1.0.0",
        directories: "invalid",
      };

      expect(() => validateConfig(config)).toThrow("Configuration 'directories' must be an object");
    });

    it("should throw for invalid directory values", () => {
      const config = {
        name: "my-app",
        version: "1.0.0",
        directories: { tools: 123 },
      };

      expect(() => validateConfig(config)).toThrow(
        "Configuration 'directories'.tools: Invalid input: expected string, received number"
      );
    });

    it("should validate uiWidgets directory configuration", () => {
      const config = {
        name: "my-app",
        version: "1.0.0",
        directories: {
          uiWidgets: "ui/widgets",
        },
      };

      expect(() => validateConfig(config)).not.toThrow();
    });

    it("should throw for invalid uiWidgets directory value", () => {
      const config = {
        name: "my-app",
        version: "1.0.0",
        directories: { uiWidgets: 123 },
      };

      expect(() => validateConfig(config)).toThrow(
        "Configuration 'directories'.uiWidgets: Invalid input: expected string, received number"
      );
    });

    it("should validate global config", () => {
      const config = {
        name: "my-app",
        version: "1.0.0",
        config: {
          protocol: "mcp",
          cors: { origin: true },
          debug: { level: "debug", transport: "api" },
          serverRoute: "/api/mcp",
        },
      };

      expect(() => validateConfig(config)).not.toThrow();
    });

    it("should throw for invalid protocol", () => {
      const config = {
        name: "my-app",
        version: "1.0.0",
        config: { protocol: "invalid" },
      };

      expect(() => validateConfig(config)).toThrow(
        "Configuration 'config'.protocol: must be 'mcp' or 'openai'"
      );
    });

    it("should throw for invalid debug level", () => {
      const config = {
        name: "my-app",
        version: "1.0.0",
        config: { debug: { level: "invalid" } },
      };

      expect(() => validateConfig(config)).toThrow(
        "Configuration 'config'.debug.level: must be one of"
      );
    });

    it("should throw for invalid debug transport", () => {
      const config = {
        name: "my-app",
        version: "1.0.0",
        config: { debug: { transport: "invalid" } },
      };

      expect(() => validateConfig(config)).toThrow(
        "Configuration 'config'.debug.transport: must be one of"
      );
    });

    it("should throw for invalid serverRoute", () => {
      const config = {
        name: "my-app",
        version: "1.0.0",
        config: { serverRoute: "no-leading-slash" },
      };

      expect(() => validateConfig(config)).toThrow(
        "Configuration 'config'.serverRoute: serverRoute must start with"
      );
    });

    it("should validate plugins array", () => {
      const config = {
        name: "my-app",
        version: "1.0.0",
        plugins: [{ name: "test-plugin" }],
      };

      expect(() => validateConfig(config)).not.toThrow();
    });

    it("should throw for invalid plugins", () => {
      const config = {
        name: "my-app",
        version: "1.0.0",
        plugins: "not-an-array",
      };

      // Zod validation now provides detailed type error
      expect(() => validateConfig(config)).toThrow("Configuration 'plugins': Invalid input");
    });

    it("should validate icon string", () => {
      const config = {
        name: "my-app",
        version: "1.0.0",
        icon: "https://example.com/icon.png",
      };

      expect(() => validateConfig(config)).not.toThrow();
    });

    it("should throw for invalid icon type", () => {
      const config = {
        name: "my-app",
        version: "1.0.0",
        icon: 123,
      };

      expect(() => validateConfig(config)).toThrow("Configuration 'icon' must be a string");
    });

    it("should validate icons array", () => {
      const config = {
        name: "my-app",
        version: "1.0.0",
        icons: [{ src: "https://example.com/icon.png", mimeType: "image/png" }],
      };

      expect(() => validateConfig(config)).not.toThrow();
    });

    it("should throw for invalid icons array", () => {
      const config = {
        name: "my-app",
        version: "1.0.0",
        icons: "not-an-array",
      };

      expect(() => validateConfig(config)).toThrow("Configuration 'icons' must be an array");
    });

    it("should throw for icon without src", () => {
      const config = {
        name: "my-app",
        version: "1.0.0",
        icons: [{ mimeType: "image/png" }],
      };

      expect(() => validateConfig(config)).toThrow("Each icon must have a 'src' string property");
    });
  });

  describe("getDefaultConfig", () => {
    it("should return default configuration", () => {
      const config = getDefaultConfig();

      expect(config.name).toBe("my-app");
      expect(config.version).toBe("1.0.0");
      expect(config.directories?.tools).toBe("tools");
      expect(config.directories?.workflows).toBe("workflows");
      expect(config.directories?.ui).toBe("ui");
    });
  });
});
