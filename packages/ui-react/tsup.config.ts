import { defineConfig } from "tsup";

export default defineConfig({
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
  external: ["react", "react-dom", "@apps-builder/ui"],
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
