import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: false, // Preserve static assets; Vite builds UI to public/, tsup outputs to dist/
  dts: false,
  sourcemap: true,
  // Bundle application code; listed packages are kept external so Vercel will install them
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
