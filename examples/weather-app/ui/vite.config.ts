import { defineConfig } from "vite";
import { mcpReactUI } from "@mcp-apps-kit/ui-react-builder/vite";

export default defineConfig({
  plugins: [
    mcpReactUI({
      // File-based discovery: scan widgets directory
      widgetsDir: "./ui/widgets",
      // Output directory for built HTML files
      outDir: "./ui/dist",
      // Global CSS to include in all UIs
      globalCss: "./ui/styles.css",
      // Standalone mode: only output UI HTML files
      standalone: true,
    }),
  ],
});
