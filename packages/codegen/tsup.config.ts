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
    minify: true,
    external: ["vite", "@typescript-eslint/typescript-estree", "@typescript-eslint/types", "jiti"],
  },
  // CLI builds (ESM only, executable)
  {
    entry: ["src/cli.ts", "src/serve.ts"],
    format: ["esm"],
    sourcemap: true,
    treeshake: true,
    minify: true,
    external: [
      "vite",
      "@typescript-eslint/typescript-estree",
      "@typescript-eslint/types",
      "@mcp-apps-kit/core",
      "jiti",
    ],
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
