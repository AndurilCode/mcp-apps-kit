import { defineConfig } from "vite";
import { mcpReactUI } from "@mcp-apps-kit/ui-react-builder/vite";

export default defineConfig({
  plugins: [
    mcpReactUI({
      // Scan the server entry point for defineReactUI calls
      serverEntry: "./src/index.ts",
      // Output directory matching what defineReactUI generates
      outDir: "./src/ui/dist",
      // Global CSS to include in all UIs
      globalCss: "./src/ui/styles.css",
    }),
  ],
});
