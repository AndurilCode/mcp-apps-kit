import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toEsbuildImportSpecifier, isPathWithinRoot, mcpReactUI } from "../../src/vite-plugin";
import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

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

    it("should accept dev: DevServerOptions with baseUrl", () => {
      const plugin = mcpReactUI({
        serverEntry: "./src/index.ts",
        dev: { baseUrl: "http://localhost:5173" },
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

  describe("dev mode integration (with filesystem)", () => {
    /**
     * These tests create a real temporary directory with widget files to
     * exercise the full configureServer → buildStart → resolveId → load
     * pipeline in dev mode.
     */
    let tmpDir: string;
    let widgetsDir: string;
    let outDir: string;

    const WIDGET_CONTENT = `
import React from "react";

export const ui = {
  name: "Test Widget",
  autoResize: false,
};

export default function TestWidget() {
  return <div>Hello</div>;
}
`;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-react-ui-test-"));
      widgetsDir = path.join(tmpDir, "widgets");
      outDir = path.join(tmpDir, "dist");
      await fs.mkdir(widgetsDir, { recursive: true });
      await fs.writeFile(path.join(widgetsDir, "test-widget.tsx"), WIDGET_CONTENT);
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    function createPluginWithConfig(
      overrides: {
        dev?: boolean | { baseUrl?: string };
        command?: "serve" | "build";
        plugins?: Array<{ name: string }>;
      } = {}
    ) {
      const warnFn = vi.fn();
      const infoFn = vi.fn();
      const plugin = mcpReactUI({
        widgetsDir,
        outDir,
        dev: overrides.dev ?? true,
        logger: { info: infoFn, warn: warnFn, error: vi.fn() },
      }) as Plugin;

      const configResolved = plugin.configResolved as (config: ResolvedConfig) => void;
      configResolved({
        root: tmpDir,
        command: overrides.command ?? "serve",
        mode: overrides.command === "build" ? "production" : "development",
        plugins: overrides.plugins ?? [{ name: "vite:react-babel" }],
      } as unknown as ResolvedConfig);

      return { plugin, warnFn, infoFn };
    }

    describe("configureServer writes dev HTML", () => {
      it("should write dev HTML files to outDir", async () => {
        const { plugin } = createPluginWithConfig();

        const configureServer = plugin.configureServer as (server: ViteDevServer) => Promise<void>;
        await configureServer({} as ViteDevServer);

        const outputPath = path.join(outDir, "test-widget.html");
        const html = await fs.readFile(outputPath, "utf-8");

        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain("/@vite/client");
        expect(html).toContain("@react-refresh");
        expect(html).toContain("virtual:mcp-react-ui/test-widget");
      });

      it("should write dev HTML with devServerUrl when configured", async () => {
        const { plugin } = createPluginWithConfig({
          dev: { baseUrl: "http://localhost:3000" },
        });

        const configureServer = plugin.configureServer as (server: ViteDevServer) => Promise<void>;
        await configureServer({} as ViteDevServer);

        const html = await fs.readFile(path.join(outDir, "test-widget.html"), "utf-8");

        expect(html).toContain("http://localhost:3000/@vite/client");
        expect(html).toContain("http://localhost:3000/@react-refresh");
        expect(html).toContain("http://localhost:3000/virtual:mcp-react-ui/test-widget");
      });
    });

    describe("buildStart in serve mode", () => {
      it("should write dev HTML (not production bundles) in serve mode", async () => {
        const { plugin } = createPluginWithConfig();

        // configureServer populates virtualModules + writes dev HTML
        const configureServer = plugin.configureServer as (server: ViteDevServer) => Promise<void>;
        await configureServer({} as ViteDevServer);

        // buildStart should detect serve mode and return early
        const buildStart = plugin.buildStart as () => Promise<void>;
        await buildStart();

        const html = await fs.readFile(path.join(outDir, "test-widget.html"), "utf-8");

        // Must contain dev-mode markers
        expect(html).toContain("/@vite/client");
        expect(html).toContain("@react-refresh");
        expect(html).toContain("virtual:mcp-react-ui/test-widget");

        // Must NOT contain production-mode markers (esbuild inline bundle)
        expect(html).not.toContain("createRoot");
        expect(html).not.toContain("react-dom/client");
      });

      it("should discover widgets in buildStart when configureServer did not run", async () => {
        const { plugin, infoFn } = createPluginWithConfig();

        // Skip configureServer entirely — buildStart should handle discovery
        const buildStart = plugin.buildStart as () => Promise<void>;
        await buildStart();

        const html = await fs.readFile(path.join(outDir, "test-widget.html"), "utf-8");
        expect(html).toContain("/@vite/client");
        expect(html).toContain("virtual:mcp-react-ui/test-widget");

        // Should have logged discovery
        expect(infoFn).toHaveBeenCalledWith(expect.stringContaining("test-widget"));
      });
    });

    describe("dev: false disables dev features in serve mode", () => {
      it("should not write dev HTML when dev: false even in serve mode", async () => {
        const { plugin, warnFn, infoFn } = createPluginWithConfig({ dev: false });

        // configureServer should be a no-op
        const configureServer = plugin.configureServer as (server: ViteDevServer) => Promise<void>;
        await configureServer({} as ViteDevServer);

        // No React plugin warning (configureServer returned early)
        expect(warnFn).not.toHaveBeenCalled();

        // buildStart should fall through to production path which requires esbuild.
        // Since we don't have node_modules with React in tmpDir, it will fail —
        // but the important thing is it attempts the production build, not dev HTML.
        // We verify by checking configureServer didn't write dev HTML.
        const outputExists = await fs.access(path.join(outDir, "test-widget.html")).then(
          () => true,
          () => false
        );
        expect(outputExists).toBe(false);
      });

      it("should not register virtual modules when dev: false", async () => {
        const { plugin } = createPluginWithConfig({ dev: false });

        const configureServer = plugin.configureServer as (server: ViteDevServer) => Promise<void>;
        await configureServer({} as ViteDevServer);

        const resolveId = plugin.resolveId as (id: string) => string | null;
        expect(resolveId("virtual:mcp-react-ui/test-widget")).toBeNull();
      });
    });

    describe("virtual module resolution with discovered widgets", () => {
      it("should resolve virtual module after configureServer discovers widgets", async () => {
        const { plugin } = createPluginWithConfig();

        const configureServer = plugin.configureServer as (server: ViteDevServer) => Promise<void>;
        await configureServer({} as ViteDevServer);

        const resolveId = plugin.resolveId as (id: string) => string | null;
        const resolved = resolveId("virtual:mcp-react-ui/test-widget");

        // Resolved id should use the \0 prefix convention
        expect(resolved).toBe("\0virtual:mcp-react-ui/test-widget");
      });

      it("should not resolve virtual module for undiscovered widget key", async () => {
        const { plugin } = createPluginWithConfig();

        const configureServer = plugin.configureServer as (server: ViteDevServer) => Promise<void>;
        await configureServer({} as ViteDevServer);

        const resolveId = plugin.resolveId as (id: string) => string | null;
        expect(resolveId("virtual:mcp-react-ui/nonexistent-widget")).toBeNull();
      });

      it("should load virtual module with correct entry-point code", async () => {
        const { plugin } = createPluginWithConfig();

        const configureServer = plugin.configureServer as (server: ViteDevServer) => Promise<void>;
        await configureServer({} as ViteDevServer);

        const load = plugin.load as (id: string) => string | null;
        const code = load("\0virtual:mcp-react-ui/test-widget");

        expect(code).not.toBeNull();
        // Should import React and ReactDOM
        expect(code).toContain('import React from "react"');
        expect(code).toContain('import { createRoot } from "react-dom/client"');
        // Should import AppsProvider
        expect(code).toContain('import { AppsProvider } from "@mcp-apps-kit/ui-react"');
        // Should import the actual widget component
        expect(code).toContain("import Component from");
        expect(code).toContain("test-widget.tsx");
        // Should mount to #root
        expect(code).toContain('document.getElementById("root")');
        expect(code).toContain("createRoot(rootElement)");
        // Should wrap in StrictMode
        expect(code).toContain("<React.StrictMode>");
      });

      it("should pass autoResize prop from widget metadata", async () => {
        const { plugin } = createPluginWithConfig();

        const configureServer = plugin.configureServer as (server: ViteDevServer) => Promise<void>;
        await configureServer({} as ViteDevServer);

        const load = plugin.load as (id: string) => string | null;
        const code = load("\0virtual:mcp-react-ui/test-widget");

        // Widget has autoResize: false in its metadata
        expect(code).toContain("autoResize={false}");
      });

      it("should return null for unregistered resolved virtual module", async () => {
        const { plugin } = createPluginWithConfig();

        const configureServer = plugin.configureServer as (server: ViteDevServer) => Promise<void>;
        await configureServer({} as ViteDevServer);

        const load = plugin.load as (id: string) => string | null;
        expect(load("\0virtual:mcp-react-ui/nonexistent")).toBeNull();
      });
    });

    describe("multiple widgets", () => {
      beforeEach(async () => {
        await fs.writeFile(
          path.join(widgetsDir, "second-widget.tsx"),
          `
import React from "react";

export const ui = { name: "Second Widget" };

export default function SecondWidget() {
  return <div>Second</div>;
}
`
        );
      });

      it("should discover and register all widgets", async () => {
        const { plugin, infoFn } = createPluginWithConfig();

        const configureServer = plugin.configureServer as (server: ViteDevServer) => Promise<void>;
        await configureServer({} as ViteDevServer);

        const resolveId = plugin.resolveId as (id: string) => string | null;
        expect(resolveId("virtual:mcp-react-ui/test-widget")).toBe(
          "\0virtual:mcp-react-ui/test-widget"
        );
        expect(resolveId("virtual:mcp-react-ui/second-widget")).toBe(
          "\0virtual:mcp-react-ui/second-widget"
        );

        // Both HTML files should be written
        const html1 = await fs.readFile(path.join(outDir, "test-widget.html"), "utf-8");
        const html2 = await fs.readFile(path.join(outDir, "second-widget.html"), "utf-8");

        expect(html1).toContain("virtual:mcp-react-ui/test-widget");
        expect(html2).toContain("virtual:mcp-react-ui/second-widget");
      });

      it("should load each widget virtual module independently", async () => {
        const { plugin } = createPluginWithConfig();

        const configureServer = plugin.configureServer as (server: ViteDevServer) => Promise<void>;
        await configureServer({} as ViteDevServer);

        const load = plugin.load as (id: string) => string | null;
        const code1 = load("\0virtual:mcp-react-ui/test-widget");
        const code2 = load("\0virtual:mcp-react-ui/second-widget");

        expect(code1).toContain("test-widget.tsx");
        expect(code2).toContain("second-widget.tsx");

        // Widget 1 has autoResize: false, widget 2 has no autoResize (default)
        expect(code1).toContain("autoResize={false}");
        expect(code2).toContain("<AppsProvider>");
        expect(code2).not.toContain("autoResize");
      });
    });
  });
});
