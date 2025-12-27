import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: false, // Don't clean since vite builds UI to same dir
  dts: false,
  sourcemap: true,
  // Don't bundle - let Vercel install dependencies
  bundle: true,
  // External packages that Vercel will install
  external: [
    "@mcp-apps-kit/core",
    "@mcp-apps-kit/ui",
    "@mcp-apps-kit/ui-react",
    "express",
    "zod",
    "react",
    "react-dom",
  ],
});
