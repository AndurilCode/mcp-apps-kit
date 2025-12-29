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
  external: [
    "react",
    "react-dom",
    "@mcp-apps-kit/core",
    "@mcp-apps-kit/ui-react",
    "esbuild",
    "vite",
  ],
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
