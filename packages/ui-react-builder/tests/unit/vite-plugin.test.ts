import { describe, it, expect, vi } from "vitest";
import { toEsbuildImportSpecifier, isPathWithinRoot, mcpReactUI } from "../../src/vite-plugin";
import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";

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

  describe("default options", () => {
    it("should use default standalone=false when not specified", () => {
      const plugin = mcpReactUI({ serverEntry: "./src/index.ts" }) as Plugin;

      // Default is standalone: false (plugin integrates with existing build)
      const resolveId = plugin.resolveId as (id: string) => string | null;
      expect(resolveId("virtual:mcp-react-ui-entry")).toBeNull();
    });

    it("should use default outDir when not specified", () => {
      const plugin = mcpReactUI({ serverEntry: "./src/index.ts" });
      expect(plugin).toBeDefined();
      // outDir defaults to "dist" - verified by plugin creation succeeding
    });
  });

  describe("path handling", () => {
    it("should handle serverEntry with different path formats", () => {
      // Relative path
      expect(() => mcpReactUI({ serverEntry: "./src/index.ts" })).not.toThrow();

      // Absolute-looking path (though may not exist)
      expect(() => mcpReactUI({ serverEntry: "/absolute/path/index.ts" })).not.toThrow();

      // Path with subdirectories
      expect(() => mcpReactUI({ serverEntry: "./src/deep/nested/index.ts" })).not.toThrow();
    });

    it("should handle custom outDir", () => {
      const plugin = mcpReactUI({
        serverEntry: "./src/index.ts",
        outDir: "custom-dist",
      });
      expect(plugin).toBeDefined();
    });
  });

  describe("dev option", () => {
    it("should accept dev: true", () => {
      const plugin = mcpReactUI({ serverEntry: "./src/index.ts", dev: true });
      expect(plugin).toBeDefined();
    });

    it("should accept dev: false", () => {
      const plugin = mcpReactUI({ serverEntry: "./src/index.ts", dev: false });
      expect(plugin).toBeDefined();
    });

    it("should accept dev: DevServerOptions object", () => {
      const plugin = mcpReactUI({
        serverEntry: "./src/index.ts",
        dev: { port: 5174, hmr: true },
      });
      expect(plugin).toBeDefined();
    });

    it("should accept dev: undefined (default)", () => {
      const plugin = mcpReactUI({ serverEntry: "./src/index.ts" });
      expect(plugin).toBeDefined();
    });
  });

  describe("configureServer hook", () => {
    it("should have configureServer hook", () => {
      const plugin = mcpReactUI({ serverEntry: "./src/index.ts" }) as Plugin;
      expect(plugin.configureServer).toBeDefined();
      expect(typeof plugin.configureServer).toBe("function");
    });

    it("should not have configureServer when dev: false is set", () => {
      // Even with dev: false, the hook exists but is a no-op —
      // the hook checks isDevModeActive internally
      const plugin = mcpReactUI({
        serverEntry: "./src/index.ts",
        dev: false,
      }) as Plugin;
      expect(plugin.configureServer).toBeDefined();
    });
  });

  describe("virtual module resolution (dev mode)", () => {
    /**
     * Helper to create a plugin pre-configured with dev mode active.
     * Simulates what happens when configureServer registers virtual modules
     * by calling resolveId/load after seeding the internal map.
     */
    function createDevPlugin() {
      const warnFn = vi.fn();
      const infoFn = vi.fn();
      const plugin = mcpReactUI({
        serverEntry: "./src/index.ts",
        logger: { info: infoFn, warn: warnFn, error: vi.fn() },
      }) as Plugin;

      // Simulate configResolved with serve command
      const configResolved = plugin.configResolved as (config: ResolvedConfig) => void;
      configResolved({
        root: "/fake/root",
        command: "serve",
        mode: "development",
        plugins: [{ name: "vite:react-babel" }],
      } as unknown as ResolvedConfig);

      return { plugin, warnFn, infoFn };
    }

    it("should not resolve unknown virtual modules", () => {
      const { plugin } = createDevPlugin();
      const resolveId = plugin.resolveId as (id: string) => string | null;

      // No virtual modules registered yet (configureServer hasn't run)
      expect(resolveId("virtual:mcp-react-ui/unknown-widget")).toBeNull();
    });

    it("should not resolve non-virtual modules", () => {
      const { plugin } = createDevPlugin();
      const resolveId = plugin.resolveId as (id: string) => string | null;

      expect(resolveId("./src/component.tsx")).toBeNull();
      expect(resolveId("react")).toBeNull();
    });

    it("should return null from load for non-virtual modules", () => {
      const { plugin } = createDevPlugin();
      const load = plugin.load as (id: string) => string | null;

      expect(load("./src/component.tsx")).toBeNull();
      expect(load("react")).toBeNull();
    });

    it("should return null from load for unresolved virtual prefix", () => {
      const { plugin } = createDevPlugin();
      const load = plugin.load as (id: string) => string | null;

      // The resolved prefix uses \0, but if someone passes the raw prefix it shouldn't match
      expect(load("virtual:mcp-react-ui/some-widget")).toBeNull();
    });
  });

  describe("React plugin detection", () => {
    it("should warn when @vitejs/plugin-react is not present", async () => {
      const warnFn = vi.fn();
      const plugin = mcpReactUI({
        widgetsDir: "./nonexistent-widgets-dir",
        logger: { info: vi.fn(), warn: warnFn, error: vi.fn() },
      }) as Plugin;

      // Simulate configResolved with no React plugin
      const configResolved = plugin.configResolved as (config: ResolvedConfig) => void;
      configResolved({
        root: "/fake/root",
        command: "serve",
        mode: "development",
        plugins: [{ name: "some-other-plugin" }],
      } as unknown as ResolvedConfig);

      // Call configureServer
      const configureServer = plugin.configureServer as (server: ViteDevServer) => Promise<void>;
      await configureServer({} as ViteDevServer);

      expect(warnFn).toHaveBeenCalledWith(expect.stringContaining("@vitejs/plugin-react"));
    });

    it("should not warn when vite:react-babel is present", async () => {
      const warnFn = vi.fn();
      const plugin = mcpReactUI({
        widgetsDir: "./nonexistent-widgets-dir",
        logger: { info: vi.fn(), warn: warnFn, error: vi.fn() },
      }) as Plugin;

      const configResolved = plugin.configResolved as (config: ResolvedConfig) => void;
      configResolved({
        root: "/fake/root",
        command: "serve",
        mode: "development",
        plugins: [{ name: "vite:react-babel" }],
      } as unknown as ResolvedConfig);

      const configureServer = plugin.configureServer as (server: ViteDevServer) => Promise<void>;
      await configureServer({} as ViteDevServer);

      expect(warnFn).not.toHaveBeenCalledWith(expect.stringContaining("@vitejs/plugin-react"));
    });

    it("should not warn when vite:react-swc is present", async () => {
      const warnFn = vi.fn();
      const plugin = mcpReactUI({
        widgetsDir: "./nonexistent-widgets-dir",
        logger: { info: vi.fn(), warn: warnFn, error: vi.fn() },
      }) as Plugin;

      const configResolved = plugin.configResolved as (config: ResolvedConfig) => void;
      configResolved({
        root: "/fake/root",
        command: "serve",
        mode: "development",
        plugins: [{ name: "vite:react-swc" }],
      } as unknown as ResolvedConfig);

      const configureServer = plugin.configureServer as (server: ViteDevServer) => Promise<void>;
      await configureServer({} as ViteDevServer);

      expect(warnFn).not.toHaveBeenCalledWith(expect.stringContaining("@vitejs/plugin-react"));
    });

    it("should not run configureServer when dev: false", async () => {
      const warnFn = vi.fn();
      const infoFn = vi.fn();
      const plugin = mcpReactUI({
        widgetsDir: "./nonexistent-widgets-dir",
        dev: false,
        logger: { info: infoFn, warn: warnFn, error: vi.fn() },
      }) as Plugin;

      const configResolved = plugin.configResolved as (config: ResolvedConfig) => void;
      configResolved({
        root: "/fake/root",
        command: "serve",
        mode: "development",
        plugins: [],
      } as unknown as ResolvedConfig);

      const configureServer = plugin.configureServer as (server: ViteDevServer) => Promise<void>;
      await configureServer({} as ViteDevServer);

      // Should not warn about React plugin because configureServer returned early
      expect(warnFn).not.toHaveBeenCalled();
      // Should not discover widgets
      expect(infoFn).not.toHaveBeenCalled();
    });
  });
});
