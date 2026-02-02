import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { mcpReactUI } from "@mcp-apps-kit/ui-react-builder/vite";

export default defineConfig({
  plugins: [
    react(),
    mcpReactUI({
      // File-based discovery: scan widgets directory
      widgetsDir: "./ui/widgets",
      // Output directory for built HTML files
      outDir: "./ui/dist",
      // Global CSS to include in all UIs
      globalCss: "./ui/styles.css",
      // Standalone mode: only output UI HTML files
      standalone: true,
      // Enable HMR for widget development
      dev: {
        baseUrl: "http://localhost:5173", // Vite dev server URL
        port: 5173,
        hmr: true,
        watch: true,
      },
    }),
  ],
});
