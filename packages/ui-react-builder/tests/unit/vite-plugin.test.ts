import { describe, it, expect, vi } from "vitest";
import { toEsbuildImportSpecifier, isPathWithinRoot, mcpReactUI } from "../../src/vite-plugin";
import type { Plugin, ResolvedConfig } from "vite";

describe("toEsbuildImportSpecifier", () => {
  it("should normalize Windows backslashes to forward slashes", () => {
    expect(toEsbuildImportSpecifier("C:\\foo\\bar\\Widget.tsx")).toBe("C:/foo/bar/Widget.tsx");
  });

  it("should not prefix POSIX absolute paths", () => {
    expect(toEsbuildImportSpecifier("/Users/alice/project/Widget.tsx")).toBe(
      "/Users/alice/project/Widget.tsx"
    );
  });

  it("should not prefix Windows drive absolute paths", () => {
    expect(toEsbuildImportSpecifier("C:/foo/bar/Widget.tsx")).toBe("C:/foo/bar/Widget.tsx");
  });

  it("should not prefix UNC absolute paths", () => {
    expect(toEsbuildImportSpecifier("\\\\server\\share\\Widget.tsx")).toBe(
      "//server/share/Widget.tsx"
    );
  });

  it("should prefix non-relative, non-absolute specifiers with ./", () => {
    expect(toEsbuildImportSpecifier("src/ui/Widget.tsx")).toBe("./src/ui/Widget.tsx");
  });

  it("should not double-prefix already-relative specifiers", () => {
    expect(toEsbuildImportSpecifier("./src/ui/Widget.tsx")).toBe("./src/ui/Widget.tsx");
    expect(toEsbuildImportSpecifier("../src/ui/Widget.tsx")).toBe("../src/ui/Widget.tsx");
  });
});

describe("isPathWithinRoot", () => {
  it("should treat direct children as within root", () => {
    expect(isPathWithinRoot("/repo", "/repo/src/ui/Widget.tsx")).toBe(true);
  });

  it("should reject paths outside root", () => {
    expect(isPathWithinRoot("/repo", "/etc/passwd")).toBe(false);
    expect(isPathWithinRoot("/repo", "/repo/../etc/passwd")).toBe(false);
  });

  it("should treat same path as within root", () => {
    expect(isPathWithinRoot("/repo", "/repo")).toBe(true);
  });

  it("should handle parent directory traversal", () => {
    expect(isPathWithinRoot("/repo", "/repo/..")).toBe(false);
  });
});

describe("mcpReactUI", () => {
  it("should return a Vite plugin with correct name", () => {
    const plugin = mcpReactUI({ serverEntry: "./src/index.ts" });
    expect(plugin.name).toBe("mcp-react-ui");
  });

  it("should have required plugin hooks", () => {
    const plugin = mcpReactUI({ serverEntry: "./src/index.ts" }) as Plugin;
    expect(plugin.configResolved).toBeDefined();
    expect(plugin.buildStart).toBeDefined();
    expect(plugin.resolveId).toBeDefined();
    expect(plugin.load).toBeDefined();
    expect(plugin.config).toBeDefined();
    expect(plugin.generateBundle).toBeDefined();
  });

  describe("standalone mode", () => {
    it("should resolve virtual entry in standalone mode", () => {
      const plugin = mcpReactUI({
        serverEntry: "./src/index.ts",
        standalone: true,
      }) as Plugin;

      const resolveId = plugin.resolveId as (id: string) => string | null;
      expect(resolveId("virtual:mcp-react-ui-entry")).toBe("virtual:mcp-react-ui-entry");
      expect(resolveId("other-module")).toBeNull();
    });

    it("should not resolve virtual entry when not standalone", () => {
      const plugin = mcpReactUI({
        serverEntry: "./src/index.ts",
        standalone: false,
      }) as Plugin;

      const resolveId = plugin.resolveId as (id: string) => string | null;
      expect(resolveId("virtual:mcp-react-ui-entry")).toBeNull();
    });

    it("should load virtual entry in standalone mode", () => {
      const plugin = mcpReactUI({
        serverEntry: "./src/index.ts",
        standalone: true,
      }) as Plugin;

      const load = plugin.load as (id: string) => string | null;
      expect(load("virtual:mcp-react-ui-entry")).toBe("export default {}");
      expect(load("other-module")).toBeNull();
    });

    it("should not load virtual entry when not standalone", () => {
      const plugin = mcpReactUI({
        serverEntry: "./src/index.ts",
        standalone: false,
      }) as Plugin;

      const load = plugin.load as (id: string) => string | null;
      expect(load("virtual:mcp-react-ui-entry")).toBeNull();
    });

    it("should return config with rollup input in standalone mode", () => {
      const plugin = mcpReactUI({
        serverEntry: "./src/index.ts",
        standalone: true,
      }) as Plugin;

      const config = plugin.config as () => object | undefined;
      const result = config();
      expect(result).toEqual({
        build: {
          rollupOptions: {
            input: "virtual:mcp-react-ui-entry",
          },
        },
      });
    });

    it("should return undefined config when not standalone", () => {
      const plugin = mcpReactUI({
        serverEntry: "./src/index.ts",
        standalone: false,
      }) as Plugin;

      const config = plugin.config as () => object | undefined;
      expect(config()).toBeUndefined();
    });

    it("should clear bundle in standalone mode", () => {
      const plugin = mcpReactUI({
        serverEntry: "./src/index.ts",
        standalone: true,
      }) as Plugin;

      const bundle = {
        "chunk1.js": { type: "chunk" },
        "asset1.css": { type: "asset" },
      };

      const generateBundle = plugin.generateBundle as (
        options: unknown,
        bundle: Record<string, unknown>
      ) => void;
      generateBundle({}, bundle);

      expect(Object.keys(bundle)).toHaveLength(0);
    });

    it("should not modify bundle when not standalone", () => {
      const plugin = mcpReactUI({
        serverEntry: "./src/index.ts",
        standalone: false,
      }) as Plugin;

      const bundle = {
        "chunk1.js": { type: "chunk" },
        "asset1.css": { type: "asset" },
      };

      const generateBundle = plugin.generateBundle as (
        options: unknown,
        bundle: Record<string, unknown>
      ) => void;
      generateBundle({}, bundle);

      expect(Object.keys(bundle)).toHaveLength(2);
    });
  });

  describe("logging", () => {
    it("should use silent logger when logger is false", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const plugin = mcpReactUI({
        serverEntry: "./src/index.ts",
        logger: false,
      });
      // Plugin should be created without logging
      expect(plugin).toBeDefined();
      consoleSpy.mockRestore();
    });

    it("should accept custom logger", () => {
      const customLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const plugin = mcpReactUI({
        serverEntry: "./src/index.ts",
        logger: customLogger,
      });

      expect(plugin).toBeDefined();
    });
  });
});
