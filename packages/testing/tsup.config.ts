import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    vitest: "src/adapters/vitest.ts",
    jest: "src/adapters/jest.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  external: [
    "zod",
    "@modelcontextprotocol/sdk",
    "fast-check",
    "zod-fast-check",
    "openai",
    "@anthropic-ai/sdk",
    "vitest",
    "jest",
  ],
});
