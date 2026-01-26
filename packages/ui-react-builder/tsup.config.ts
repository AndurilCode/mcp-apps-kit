import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/vite-plugin.ts"],
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
  // External dependencies - these must be listed in package.json dependencies (not devDependencies)
  // because they're needed at runtime:
  // - @typescript-eslint/* packages: Used by ast-parser.ts to parse user TypeScript code at build time
  // - esbuild: Used to bundle React components into standalone HTML files
  // - vite: Peer dependency, used when plugin is loaded by Vite config
  external: [
    "react",
    "react-dom",
    "@mcp-apps-kit/core",
    "@mcp-apps-kit/ui-react",
    "esbuild",
    "vite",
    "@typescript-eslint/typescript-estree",
    "@typescript-eslint/types",
    "postcss",
    "@tailwindcss/postcss",
  ],
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
