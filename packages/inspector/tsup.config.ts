import { defineConfig } from "tsup";

export default defineConfig([
  // Main library build
  {
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: {
      compilerOptions: {
        paths: {},
      },
    },
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    external: ["zod", "@mcp-apps-kit/core", "@mcp-apps-kit/testing"],
  },
  // CLI build (ESM only, executable)
  {
    entry: ["src/bin/mcp-inspector.ts"],
    outDir: "dist/bin",
    format: ["esm"],
    sourcemap: true,
    treeshake: true,
    minify: false,
    external: ["zod", "@mcp-apps-kit/core", "@mcp-apps-kit/testing"],
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
