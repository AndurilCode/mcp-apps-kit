import { defineConfig } from "vite";
import { mcpReactUI } from "@mcp-apps-kit/ui-react-builder/vite";

export default defineConfig({
  plugins: [
    mcpReactUI({
      // Scan widget index file for defineReactUI calls
      serverEntry: "./ui/widgets/index.ts",
      // Output directory for built HTML files
      outDir: "./ui/dist",
      // Global CSS to include in all UIs
      globalCss: "./ui/src/styles.css",
      // Standalone mode: only output UI HTML files
      standalone: true,
    }),
  ],
});
