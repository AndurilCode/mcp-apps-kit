import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
  },
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    dts: false,
    sourcemap: true,
    clean: false,
    treeshake: true,
    minify: false,
    external: ["commander", "prompts", "chalk"],
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
